import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { temporal, type TemporalState } from 'zundo'
import { shallow } from 'zustand/shallow'

import type {
  AppliedSurfaces,
  DesignState,
  FloorType,
  PlacedElectrical,
  PlacedFurniture,
  PlacedLight,
  RoomGeometry,
} from './types'
import { persistableDesignState } from './utils/designStateHelpers'
import type { RoomStore } from './roomStoreTypes'

import { createIdentitySlice } from './slices/identitySlice'
import { createGeometrySlice } from './slices/geometrySlice'
import { createDesignSlice } from './slices/designSlice'
import { createFurnitureSlice } from './slices/furnitureSlice'
import { createElectricalSlice } from './slices/electricalSlice'
import { createLightSlice } from './slices/lightSlice'
import { createUiSlice } from './slices/uiSlice'
import { createLifecycleSlice } from './slices/lifecycleSlice'

// ─── Re-exports ────────────────────────────────────────────────────────────
//
// roomStore.ts stays the single import path (`@/store/roomStore`) every
// consumer already uses. The state/types/helpers themselves now live next to
// the slice that owns them; this file just composes the slices and hands
// everything back out under its original name.

export type {
  AppliedSurfaces,
  CeilingState,
  DesignState,
  ElectricalType,
  FloorState,
  FloorTextureSettings,
  FloorType,
  PlacedElectrical,
  PlacedFurniture,
  PlacedLight,
  RoomGeometry,
  RoomPayload,
  RoomPayloadGeometry,
  UserFurnitureEntry,
  Wall,
  WallCovering,
  WallElement,
  WallPanelSettings,
} from './types'
export { PLASTER_BASE_COLOR, resolveWallColor, resolveWallCovering, resolveWallPanel } from './types'

export {
  computeFloorArea,
  computeNetWallArea,
  computeOpeningsCount,
  computePerimeter,
  resizeWall,
} from './utils/geometryHelpers'

export { DEFAULT_DESIGN_STATE, persistableDesignState, repairDesignState } from './utils/designStateHelpers'

// ─── Undo/redo (zundo) ────────────────────────────────────────────────────────
//
// Only the fields a user actually *edits* in the studio participate in
// undo/redo — not identity (roomId/apartmentId/draftId/name), not transient
// UI state (sunHour is a live preview slider, wizardStep/isDirty/saveStatus
// are navigation/save bookkeeping, catalogFurniture/userFurniture are loaded
// catalog data, not room edits). `surfaces` IS included even though it looks
// like backend bookkeeping — applySurface() links a wall's paint/wallpaper to
// a real do'kon Material *in the same user action* as setWallCovering()
// changing designState, so leaving it out would let undo revert the visible
// color while leaving the price-relevant material link pointing at the old
// one (or vice versa on redo).
export interface RoomTemporalState {
  geometry: RoomGeometry
  designState: DesignState
  surfaces: AppliedSurfaces
  furniture: PlacedFurniture[]
  electricals: PlacedElectrical[]
  lights: PlacedLight[]
  layoutPos: { x: number; z: number } | null
  ceilingHeight: number
}

function partializeTemporal(state: RoomStore): RoomTemporalState {
  return {
    geometry: state.geometry,
    designState: state.designState,
    surfaces: state.surfaces,
    furniture: state.furniture,
    electricals: state.electricals,
    lights: state.lights,
    layoutPos: state.layoutPos,
    ceilingHeight: state.ceilingHeight,
  }
}

/**
 * Leading-edge throttle: the first call within `ms` fires immediately: later
 * calls in that window are dropped. Used to coalesce a burst of set() calls
 * — a slider dragged across a dozen frames, or one user action that happens
 * to call two setters back-to-back (setWallCovering + applySurface) — into a
 * single undo step, using whatever state existed at the *start* of the burst
 * as the "past" snapshot (a trailing-edge debounce would instead fire once
 * the burst calms down, by which point current state has already caught up
 * to it — pushing a near-no-op history entry right next to the real one).
 */
function leadingThrottle<Args extends unknown[]>(fn: (...args: Args) => void, ms: number) {
  let lastCall = 0
  return (...args: Args) => {
    const now = Date.now()
    if (now - lastCall >= ms) {
      lastCall = now
      fn(...args)
    }
  }
}

// A burst of set() calls closer together than this counts as "one edit" for
// undo purposes — long enough to coalesce a slider drag or a paint-then-link
// action pair, short enough that two genuinely separate clicks a beat apart
// still land as two separate undo steps.
export const UNDO_COALESCE_MS = 400

// ─── Store ────────────────────────────────────────────────────────────────────

export const useRoomStore = create<RoomStore>()(
  persist(
    temporal(
      (...a) => ({
        ...createIdentitySlice(...a),
        ...createGeometrySlice(...a),
        ...createDesignSlice(...a),
        ...createFurnitureSlice(...a),
        ...createElectricalSlice(...a),
        ...createLightSlice(...a),
        ...createUiSlice(...a),
        ...createLifecycleSlice(...a),
      }),
      {
        partialize: partializeTemporal,
        // Skip pushing a history entry when none of the undoable fields
        // actually changed — most store writes (setSunHour, markSaved,
        // setDraftId, setRoomId, wizardStep, ...) touch fields outside
        // partializeTemporal and would otherwise spam the stack with
        // no-op steps that "undo" to an identical state.
        equality: shallow,
        limit: 50,
        handleSet: (handleSet) => leadingThrottle(handleSet, UNDO_COALESCE_MS),
      },
    ),
    {
      name: 'andoza-ai-room-draft',
      version: 3,
      partialize: (state) => ({
        draftId: state.draftId,
        // Persist geometry with dimensions but CLEAR wall elements (doors/windows)
        // They should not carry over between rooms
        geometry: {
          ...state.geometry,
          walls: state.geometry.walls.map(w => ({ ...w, elements: [] })),
        },
        ceilingHeight: state.ceilingHeight,
        wizardStep: state.wizardStep,
        name: state.name,
        furniture: state.furniture,
        electricals: state.electricals,
        lights: state.lights,
        highQuality3d: state.highQuality3d,
        // Persist metadata but clear modelPath (blob URLs don't survive refresh)
        userFurniture: state.userFurniture.map((f) => ({ ...f, modelPath: '' })),
        // Wall/floor finishes survive a reload even before the room has been
        // saved to the backend. Oversized inline images are stripped first —
        // see persistableDesignState.
        designState: persistableDesignState(state.designState),
        // Don't persist: roomId, surfaces, etc.
      }),
      migrate(persisted: unknown, version: number) {
        if (version < 2) {
          const old = persisted as { designState?: { wallColor?: string; floorType?: string } }
          const wallColor = old?.designState?.wallColor ?? '#D8D3C8'
          const floorType = (old?.designState?.floorType ?? 'parquet') as FloorType
          return {
            ...(old as object),
            designState: {
              wallCoverings: { ALL: { kind: 'paint' as const, color: wallColor } },
              floorType,
            } satisfies DesignState,
          }
        }
        // v2→v3: no-op (vertices is optional, AppliedSurfaces is backward-compatible)
        return persisted
      },
    },
  ),
)

/**
 * Reactive access to the undo/redo history — plain `useRoomStore.temporal`
 * (the vanilla store zundo attaches) does not trigger a re-render on its
 * own, so a component reading e.g. `pastStates.length` to disable an Undo
 * button needs this hook instead of calling `.temporal.getState()` directly.
 * `useRoomStore.temporal.getState().undo()` / `.redo()` are fine to call
 * as one-off actions (a button's onClick, a keydown handler) without going
 * through this hook at all.
 */
export function useTemporalRoomStore<T>(
  selector: (state: TemporalState<RoomTemporalState>) => T,
): T {
  return useStoreWithEqualityFn(useRoomStore.temporal, selector, Object.is)
}

// Dev-only debugging handle (also used by e2e smoke checks)
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__roomStore = useRoomStore
}
