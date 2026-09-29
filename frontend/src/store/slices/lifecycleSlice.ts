import type { StateCreator } from 'zustand'
import { nanoid } from 'nanoid'
import { apiPositionToStoreMm } from '@/lib/wallPositions'
import type {
  AppliedSurfaces,
  DesignState,
  PlacedElectrical,
  PlacedFurniture,
  PlacedLight,
  RoomGeometry,
  RoomPayload,
  UserFurnitureEntry,
  WallElement,
} from '../types'
import { defaultGeometry } from '../utils/geometryHelpers'
import { DEFAULT_DESIGN_STATE, repairDesignState } from '../utils/designStateHelpers'
import type { RoomStore } from '../roomStoreTypes'
// Value import from the composed store — safe because it is only referenced
// inside action bodies below (loadRoom/loadDraftState), never at module
// evaluation time, so the circular import resolves fine: by the time a user
// actually triggers these actions, roomStore.ts has finished initializing
// and `useRoomStore` is a real, fully-formed hook.
import { useRoomStore } from '../roomStore'

export interface LifecycleSlice {
  loadRoom(room: RoomPayload): void
  loadDraftState(state: Record<string, unknown>): void
  resetRoom(): void
}

export const createLifecycleSlice: StateCreator<
  RoomStore,
  [],
  [],
  LifecycleSlice
> = (set) => ({
  loadRoom(room) {
    // API geometry is in metres with 0–1 CENTRE fractions; the store uses mm
    // measured to the opening's left edge (see apiPositionToStoreMm).
    // Sets only identity + authoritative geometry — design state, furniture and
    // lights are per-room data restored separately from the room's state blob.
    const geometry: RoomGeometry = room.geometry?.walls?.length
      ? {
          walls: room.geometry.walls.map((w) => {
            const lengthMm = Math.round(w.length * 1000)
            return {
              id: w.id,
              length: lengthMm,
              elements: (w.elements ?? []).map((e) => {
                const widthMm = Math.round(e.width * 1000)
                return {
                  // API elements carry no id — mint one so selection, drag and
                  // removal stay per-element (undefined ids match each other)
                  id: nanoid(),
                  type: e.type as WallElement['type'],
                  width: widthMm,
                  height: Math.round(e.height * 1000),
                  sill_height: Math.round((e.sill_height ?? 0) * 1000),
                  // Centre fraction → left-edge mm. This is the one place the
                  // API's convention is translated on the way in.
                  position: apiPositionToStoreMm(e.position ?? 0.5, lengthMm, widthMm),
                  // A saved element is a real placement, never a placeholder.
                  // Without this, the legacy `position <= 0` fallback would
                  // re-centre any opening whose centre sits within half its
                  // width of the start corner — exactly where the conversion
                  // above legitimately puts a corner door, at a negative
                  // left edge.
                  positionAuto: false,
                  ...(e.style_id ? { styleId: e.style_id } : {}),
                  ...(e.sashes === 1 || e.sashes === 2 ? { sashes: e.sashes as 1 | 2 } : {}),
                }
              }),
            }
          }),
          vertices: room.geometry.vertices?.map(([x, z]: [number, number]) => [
            Math.round(x * 1000),
            Math.round(z * 1000),
          ]) as [number, number][] | undefined,
        }
      : defaultGeometry()
    set({
      roomId: room.id ?? null,
      apartmentId: room.apartment_id ?? null,
      name: room.name ?? 'Xona',
      ceilingHeight: Math.round((room.ceiling_h ?? 2.7) * 1000),
      geometry,
      surfaces: (room.surfaces ?? {}) as AppliedSurfaces,
      isDirty: false,
    })
    // This is the room's starting point, not an edit — without clearing,
    // a user's very first Ctrl+Z would "undo" past it into whatever
    // in-memory default state happened to precede this load (an empty
    // room, or worse, a previous room's leftover history).
    useRoomStore.temporal.getState().clear()
  },

  loadDraftState(state) {
    const s = state as {
      ceilingHeight?: number
      geometry?: RoomGeometry
      wizardStep?: number
      designState?: DesignState
      name?: string
      roomId?: string
      furniture?: PlacedFurniture[]
      electricals?: PlacedElectrical[]
      lights?: PlacedLight[]
      userFurniture?: UserFurnitureEntry[]
      layoutPos?: { x: number; z: number }
    }
    // Clear wall elements to prevent cross-room contamination from localStorage
    const cleanGeometry = (s.geometry ? {
      ...s.geometry,
      walls: s.geometry.walls.map(w => ({ ...w, elements: [] })),
    } : defaultGeometry());
    set({
      ceilingHeight: s.ceilingHeight ?? 2700,
      geometry: cleanGeometry,
      wizardStep: s.wizardStep ?? 0,
      // Rooms saved before floorConfigured existed have a real, user-visible
      // floor already — default the backfill to true so they don't suddenly
      // go neutral. A genuinely new room has no designState at all yet, so it
      // falls through to DEFAULT_DESIGN_STATE's explicit floorConfigured: false.
      designState: s.designState
        ? repairDesignState({ floorConfigured: true, ...s.designState })
        : DEFAULT_DESIGN_STATE,
      name: s.name ?? 'Xona',
      roomId: s.roomId ?? null,
      furniture: s.furniture ?? [],
      electricals: s.electricals ?? [],
      lights: s.lights ?? [],
      userFurniture: s.userFurniture ?? [],
      layoutPos: s.layoutPos ?? null,
      isDirty: false,
    })
    // Same reasoning as loadRoom above — a bulk restore is the starting
    // point for this session, not a step the user should be able to
    // undo away from.
    useRoomStore.temporal.getState().clear()
  },

  resetRoom() {
    set({
      draftId: null,
      roomId: null,
      apartmentId: null,
      name: 'Xona',
      ceilingHeight: 2700,
      geometry: defaultGeometry(),
      surfaces: {},
      furniture: [],
      electricals: [],
      lights: [],
      userFurniture: [],
      isDirty: false,
      wizardStep: 0,
      designState: DEFAULT_DESIGN_STATE,
      layoutPos: null,
    })
  },
})
