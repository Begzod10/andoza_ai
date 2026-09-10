import { create } from 'zustand'

/**
 * Real-world model dimensions (metres, before any per-placement scaleOverride),
 * measured from each GLB's own geometry the first time it renders in the 3D
 * scene and keyed by furniture_id.
 *
 * Why this exists: a do'kon (shop) upload carries no reliable footprint — its
 * `sizeM` is derived from admin-set footprint_w/footprint_d which are usually
 * unset, so the design panel showed a misleading "0×0 m". The true size is only
 * known once the model's geometry loads (see extractSceneInfo). The 3D layer
 * already measures it for collision; it publishes the base size here so the
 * panel — which never loads the GLB itself — can display the real dimensions.
 *
 * Deliberately a standalone, non-persisted store: it is derived, live-measured
 * data, not part of the saved room draft.
 */
interface MeasuredSizesState {
  sizes: Record<string, { w: number; d: number }>
  setSize: (furnitureId: string, w: number, d: number) => void
}

export const useMeasuredSizes = create<MeasuredSizesState>((set) => ({
  sizes: {},
  setSize: (furnitureId, w, d) =>
    set((state) => {
      const prev = state.sizes[furnitureId]
      // Ignore sub-5mm churn so a re-measure with the same result can't loop renders.
      if (prev && Math.abs(prev.w - w) < 0.005 && Math.abs(prev.d - d) < 0.005) return state
      return { sizes: { ...state.sizes, [furnitureId]: { w, d } } }
    }),
}))
