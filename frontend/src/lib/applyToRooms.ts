import { getRooms, RoomChangedError, updateRoom, type CatalogFurniture, type Room } from '@/lib/api'
import type { DesignState, PlacedFurniture, PlacedLight, RoomGeometry } from '@/store/roomStore'
import { apiGeometryToStoreGeometry, roomScopedElementId } from '@/lib/apiRoomGeometry'
import { siblingDesignState } from '@/lib/siblingRoomView'
import { effectiveRoomType, isRoomType } from '@/lib/roomType'
import { roomSizeOf } from '@/lib/aiDesignPresets'
import { designRoomState, type DesignParts, type RoomDesign } from '@/lib/aiDesign'
import { planForRoom, type DesignSource, type TargetRoom } from '@/lib/planForRoom'
import { withFlatOpenings } from '@/lib/layoutOpenings'
import { roomLayoutPos } from '@/pages/studio/three-d/helpers'

/**
 * What became of one room: written (`applied`), refused because it was changed elsewhere after it was
 * read (`changed`, the PATCH's 409), or not saved for any other reason (`failed`).
 */
export type RoomOutcome = { roomId: string; name: string; status: 'applied' | 'changed' | 'failed' }

/** The rooms written, each with its `state` as it was and the `updated_at` our write gave it. */
export type RoomsUndo = Array<{ roomId: string; name: string; prevState: unknown; writtenAt: string }>

/** The keys of the saved `state` blob a design changes; every other key (geometry, electricals…) stays. */
interface SavedDesign {
  designState?: DesignState
  furniture?: PlacedFurniture[]
  lights?: PlacedLight[]
}

/** A room of the apartment as `planForRoom` sees it, or null when it has no walls to design. */
function targetOf(room: Room): (TargetRoom & { roomType: string; guessed: boolean }) | null {
  // Room-scoped ids, as the sibling rooms are drawn with (`siblingRoomView`).
  const geometry: RoomGeometry | null = apiGeometryToStoreGeometry(room.geometry, roomScopedElementId(room.id))
  if (!geometry) return null
  return {
    geometry,
    wallIds: geometry.walls.map((w) => w.id),
    roomType: effectiveRoomType(room.room_type, room.name) ?? 'mehmonxona',
    // The type is the room's own only when it was set; else it is read off the name, or the default.
    guessed: !isRoomType(room.room_type),
    size: roomSizeOf(geometry),
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
function listOr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

/**
 * The room's design as saved, repaired as a sibling room's is (`siblingDesignState`): a room never
 * opened starts from `DEFAULT_DESIGN_STATE`, with no furniture or lights. A malformed blob reads the
 * same way: furniture or lights that are not a list are none, a designState that is not an object
 * is the default.
 */
function savedDesign(room: Room): RoomDesign {
  const saved = isObject(room.state) ? (room.state as SavedDesign) : undefined
  return {
    designState: siblingDesignState(isObject(saved?.designState) ? { designState: saved.designState } : null),
    furniture: listOr<PlacedFurniture>(saved?.furniture),
    lights: listOr<PlacedLight>(saved?.lights),
  }
}

/**
 * A room in the confirm list: its type (`guessed` when the room has none of its own) and the names of
 * the furniture it would get. `skipped` says why a room will not be designed: it has no walls drawn
 * (`no_walls`, which applying leaves out), or it cannot be worked out (`failed`).
 */
export interface RoomPreview {
  roomId: string
  name: string
  roomType: string
  guessed: boolean
  furnitureNames: string[]
  skipped: null | 'no_walls' | 'failed'
}

/**
 * For the confirm list: each of `rooms`, with the furniture it would get from the plan it would get
 * (`planForRoom`). One room that cannot be read or worked out is that room's `skipped`, never a list
 * that fails whole.
 */
export function previewOtherRooms(rooms: Room[], source: DesignSource, catalog: CatalogFurniture[]): RoomPreview[] {
  return rooms.map((room) => {
    const roomType = effectiveRoomType(room.room_type, room.name) ?? 'mehmonxona'
    const base = { roomId: room.id, name: room.name, roomType, guessed: !isRoomType(room.room_type), furnitureNames: [] as string[] }
    try {
      const target = targetOf(room)
      if (!target) return { ...base, skipped: 'no_walls' as const }
      const plan = planForRoom(source, target, catalog)
      return { ...base, furnitureNames: plan.furniture.map((f) => f.name), skipped: null }
    } catch {
      return { ...base, skipped: 'failed' as const }
    }
  })
}

const statusOf = (r: PromiseSettledResult<unknown>): RoomOutcome['status'] =>
  r.status === 'fulfilled' ? 'applied' : r.reason instanceof RoomChangedError ? 'changed' : 'failed'

/**
 * Puts the design into every room of the apartment but the open one (whose store has it already):
 * each room's new design is worked out from the room as the server holds it, merged into its saved
 * `state` (the PATCH replaces it whole), and written guarded by the `updated_at` it was read with, all
 * at once. A room with no walls is left out; one that cannot be worked out, or was read without an
 * `updated_at` to guard its write, is `failed` and not written. Gives what became of each room, and what undoes the
 * rooms written.
 *
 * `catalog` is the shop's: the names and prices of the pieces placed are read from it.
 */
export async function applyToOtherRooms(args: {
  aptId: string; currentRoomId: string; source: DesignSource; parts: DesignParts; catalog: CatalogFurniture[]
}): Promise<{ outcomes: RoomOutcome[]; undo: RoomsUndo }> {
  const { aptId, currentRoomId, source, parts, catalog } = args
  const flat = await getRooms(aptId)
  const rooms = flat.filter((r) => r.id !== currentRoomId)

  // Every room is worked out before anything is written: a room that cannot be is that room's
  // failure alone, and never one that leaves rooms written with nothing to tell of them or undo them.
  type Work = { room: Room; state: Record<string, unknown> | null; guard: string | null }
  const work: Work[] = rooms.flatMap((room): Work[] => {
    const target = targetOf(room)
    if (!target) return []
    // A room read without its updated_at cannot be written guarded, so it is not written.
    if (!room.updated_at) return [{ room, state: null, guard: null }]
    try {
      const plan = planForRoom(source, target, catalog)
      // Laid out round the doors its neighbours store in the walls they share with it, too.
      const layout = withFlatOpenings(target.geometry, room.id, flat, roomLayoutPos(room))
      const { designState, furniture, lights } = designRoomState(savedDesign(room), layout, plan, parts, catalog, target.roomType)
      const state = { ...(isObject(room.state) ? room.state : {}), designState, furniture, lights }
      return [{ room, state, guard: room.updated_at }]
    } catch {
      return [{ room, state: null, guard: null }]
    }
  })
  const results = await Promise.allSettled(work.map(({ room, state, guard }) => (state && guard
    ? updateRoom(room.id, { state, expected_updated_at: guard })
    : Promise.reject(new Error('Room not designed')))))

  const outcomes: RoomOutcome[] = []
  const undo: RoomsUndo = []
  results.forEach((r, i) => {
    const { room } = work[i]
    outcomes.push({ roomId: room.id, name: room.name, status: statusOf(r) })
    if (r.status === 'fulfilled') {
      undo.push({ roomId: room.id, name: room.name, prevState: room.state ?? null, writtenAt: r.value.updated_at ?? '' })
    }
  })
  return { outcomes, undo }
}

/**
 * Puts back each room's `state` as it was, guarded by the `updated_at` our write gave it: a room
 * changed since is left as it is (`changed`). A room that had no state gets an empty one, which opens
 * as the default: the PATCH takes no null. An entry without that updated_at is not written (`failed`):
 * an unguarded write could undo someone else's change.
 */
export async function undoOtherRooms(undo: RoomsUndo): Promise<RoomOutcome[]> {
  const results = await Promise.allSettled(undo.map((u) => (u.writtenAt
    ? updateRoom(u.roomId, { state: (u.prevState ?? {}) as Record<string, unknown>, expected_updated_at: u.writtenAt })
    : Promise.reject(new Error('No updated_at to guard the undo')))))
  return results.map((r, i) => ({ roomId: undo[i].roomId, name: undo[i].name, status: statusOf(r) }))
}
