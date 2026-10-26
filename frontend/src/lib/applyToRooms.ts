import { getRooms, RoomChangedError, updateRoom, type CatalogFurniture, type Room } from '@/lib/api'
import type { DesignState, PlacedFurniture, PlacedLight, RoomGeometry } from '@/store/roomStore'
import { apiGeometryToStoreGeometry, roomScopedElementId } from '@/lib/apiRoomGeometry'
import { siblingDesignState } from '@/lib/siblingRoomView'
import { effectiveRoomType, isRoomType } from '@/lib/roomType'
import { roomSizeOf } from '@/lib/aiDesignPresets'
import { designRoomState, type DesignParts, type RoomDesign } from '@/lib/aiDesign'
import { planForRoom, type DesignSource, type TargetRoom } from '@/lib/planForRoom'

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

/**
 * The room's design as saved, repaired as a sibling room's is (`siblingDesignState`): a room never
 * opened starts from `DEFAULT_DESIGN_STATE`, with no furniture or lights.
 */
function savedDesign(room: Room): RoomDesign {
  const saved = room.state as SavedDesign | null | undefined
  return {
    designState: siblingDesignState(room.state),
    furniture: saved?.furniture ?? [],
    lights: saved?.lights ?? [],
  }
}

/**
 * For the confirm list: each of `rooms` that has walls, its type (`guessed` when the room has none of
 * its own) and the names of the furniture it would get, from the plan it would get (`planForRoom`).
 */
export function previewOtherRooms(
  rooms: Room[], source: DesignSource, catalog: CatalogFurniture[],
): Array<{ roomId: string; name: string; roomType: string; guessed: boolean; furnitureNames: string[] }> {
  return rooms.flatMap((room) => {
    const target = targetOf(room)
    if (!target) return []
    const plan = planForRoom(source, target, catalog)
    return [{
      roomId: room.id, name: room.name, roomType: target.roomType, guessed: target.guessed,
      furnitureNames: plan.furniture.map((f) => f.name),
    }]
  })
}

const statusOf = (r: PromiseSettledResult<unknown>): RoomOutcome['status'] =>
  r.status === 'fulfilled' ? 'applied' : r.reason instanceof RoomChangedError ? 'changed' : 'failed'

/**
 * Puts the design into every room of the apartment but the open one (whose store has it already):
 * each room's new design is worked out from the room as the server holds it, merged into its saved
 * `state` (the PATCH replaces it whole), and written guarded by the `updated_at` it was read with, all
 * at once. A room with no walls is left out. Gives what became of each room, and what undoes the
 * rooms written.
 *
 * `catalog` is the shop's: the names and prices of the pieces placed are read from it.
 */
export async function applyToOtherRooms(args: {
  aptId: string; currentRoomId: string; source: DesignSource; parts: DesignParts; catalog: CatalogFurniture[]
}): Promise<{ outcomes: RoomOutcome[]; undo: RoomsUndo }> {
  const { aptId, currentRoomId, source, parts, catalog } = args
  const rooms = (await getRooms(aptId)).filter((r) => r.id !== currentRoomId)
  const writes = rooms.flatMap((room) => {
    const target = targetOf(room)
    if (!target) return []
    const plan = planForRoom(source, target, catalog)
    const { designState, furniture, lights } = designRoomState(savedDesign(room), target.geometry, plan, parts, catalog, target.roomType)
    const state = { ...room.state, designState, furniture, lights }
    return [{ room, request: updateRoom(room.id, { state, expected_updated_at: room.updated_at ?? undefined }) }]
  })
  const results = await Promise.allSettled(writes.map((w) => w.request))

  const outcomes: RoomOutcome[] = []
  const undo: RoomsUndo = []
  results.forEach((r, i) => {
    const { room } = writes[i]
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
 * as the default: the PATCH takes no null.
 */
export async function undoOtherRooms(undo: RoomsUndo): Promise<RoomOutcome[]> {
  const results = await Promise.allSettled(undo.map((u) => updateRoom(u.roomId, {
    state: (u.prevState ?? {}) as Record<string, unknown>,
    expected_updated_at: u.writtenAt || undefined,
  })))
  return results.map((r, i) => ({ roomId: undo[i].roomId, name: undo[i].name, status: statusOf(r) }))
}
