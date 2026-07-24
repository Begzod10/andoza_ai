import { create } from 'zustand'
import { Material, WallFinish } from '../types'

export interface AppliedMaterial {
  wallId: string
  material: Material
  appliedAt: string
}

export interface DecorationState {
  // Materials
  availablePaints: Material[]
  availableWallpapers: Material[]
  availableFloorMaterials: Material[]
  setAvailablePaints: (materials: Material[]) => void
  setAvailableWallpapers: (materials: Material[]) => void
  setAvailableFloorMaterials: (materials: Material[]) => void

  // Applied materials
  appliedWallMaterials: Map<string, AppliedMaterial> // wall_id -> applied material
  appliedFloorMaterial: AppliedMaterial | null
  setWallMaterial: (wallId: string, material: Material) => void
  setFloorMaterial: (material: Material) => void
  clearWallMaterial: (wallId: string) => void
  clearFloorMaterial: () => void

  // Current selection
  selectedMaterial: Material | null
  setSelectedMaterial: (material: Material | null) => void

  // Cost tracking
  totalCost: number
  calculateTotalCost: () => void

  // UI State
  currentDecorStep: 1 | 2 | 3 | 4 | 5
  setCurrentDecorStep: (step: 1 | 2 | 3 | 4 | 5) => void

  // Reset
  reset: () => void
}

export const useDecorationStore = create<DecorationState>((set, get) => ({
  // Materials
  availablePaints: [],
  availableWallpapers: [],
  availableFloorMaterials: [],
  setAvailablePaints: (materials) => set({ availablePaints: materials }),
  setAvailableWallpapers: (materials) => set({ availableWallpapers: materials }),
  setAvailableFloorMaterials: (materials) => set({ availableFloorMaterials: materials }),

  // Applied materials
  appliedWallMaterials: new Map(),
  appliedFloorMaterial: null,
  setWallMaterial: (wallId, material) => {
    const current = new Map(get().appliedWallMaterials)
    current.set(wallId, {
      wallId,
      material,
      appliedAt: new Date().toISOString(),
    })
    set({ appliedWallMaterials: current })
    get().calculateTotalCost()
  },
  setFloorMaterial: (material) => {
    set({
      appliedFloorMaterial: {
        wallId: 'floor',
        material,
        appliedAt: new Date().toISOString(),
      },
    })
    get().calculateTotalCost()
  },
  clearWallMaterial: (wallId) => {
    const current = new Map(get().appliedWallMaterials)
    current.delete(wallId)
    set({ appliedWallMaterials: current })
    get().calculateTotalCost()
  },
  clearFloorMaterial: () => {
    set({ appliedFloorMaterial: null })
    get().calculateTotalCost()
  },

  // Current selection
  selectedMaterial: null,
  setSelectedMaterial: (material) => set({ selectedMaterial: material }),

  // Cost tracking
  totalCost: 0,
  calculateTotalCost: () => {
    const materials = get()
    let total = 0

    materials.appliedWallMaterials.forEach((applied) => {
      // Assuming material has a price field (you may need to add this)
      if ('price' in applied.material) {
        total += (applied.material as any).price || 0
      }
    })

    if (materials.appliedFloorMaterial && 'price' in materials.appliedFloorMaterial.material) {
      total += (materials.appliedFloorMaterial.material as any).price || 0
    }

    set({ totalCost: total })
  },

  // UI State
  currentDecorStep: 1,
  setCurrentDecorStep: (step) => set({ currentDecorStep: step }),

  // Reset
  reset: () => {
    set({
      availablePaints: [],
      availableWallpapers: [],
      availableFloorMaterials: [],
      appliedWallMaterials: new Map(),
      appliedFloorMaterial: null,
      selectedMaterial: null,
      totalCost: 0,
      currentDecorStep: 1,
    })
  },
}))
