import type { StateCreator } from 'zustand'
import type { AppliedSurfaces, DesignState, WallCovering, WallPanelSettings } from '../types'
import { DEFAULT_DESIGN_STATE } from '../utils/designStateHelpers'
import type { RoomStore } from '../roomStoreTypes'

export interface DesignSlice {
  surfaces: AppliedSurfaces
  designState: DesignState

  applySurface(wallId: string, materialId: string): void
  setDesignState(patch: Partial<DesignState>): void
  setFloorTexture(url: string | null): void
  setWallCovering(wallId: string, covering: WallCovering): void
  setWallPanel(wallId: string, settings: WallPanelSettings): void
  resetDesignState(): void
}

export const createDesignSlice: StateCreator<
  RoomStore,
  [],
  [],
  DesignSlice
> = (set) => ({
  surfaces: {},
  designState: DEFAULT_DESIGN_STATE,

  applySurface(wallId, materialId) {
    set((state) => ({
      isDirty: true,
      surfaces: { ...state.surfaces, [wallId]: materialId },
    }))
  },

  setDesignState(patch) {
    set((state) => ({ designState: { ...state.designState, ...patch }, isDirty: true }))
  },

  setFloorTexture(url) {
    set((state) => ({ designState: { ...state.designState, floorTexture: url }, isDirty: true }))
  },

  setWallCovering(wallId, covering) {
    set((state) => ({
      designState: {
        ...state.designState,
        // Setting ALL clears per-wall overrides so it genuinely applies everywhere
        wallCoverings: wallId === 'ALL'
          ? { ALL: covering }
          : { ...state.designState.wallCoverings, [wallId]: covering },
      },
      isDirty: true,
    }))
  },

  setWallPanel(wallId, settings) {
    set((state) => ({
      designState: {
        ...state.designState,
        wallPanels: wallId === 'ALL'
          ? { ALL: settings }
          : { ...state.designState.wallPanels, [wallId]: settings },
      },
      isDirty: true,
    }))
  },

  resetDesignState() {
    set({ designState: DEFAULT_DESIGN_STATE, isDirty: true })
  },
})
