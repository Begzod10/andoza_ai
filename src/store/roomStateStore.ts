import { create } from 'zustand'
import { RoomState, RoomStateType } from '../types'

interface RoomStateStore {
  // Current state
  selectedState: RoomStateType | null
  setSelectedState: (state: RoomStateType | null) => void

  // Paint colors (material intro)
  selectedPaintColor: string | null
  setSelectedPaintColor: (color: string | null) => void

  // 3D camera
  cameraRotationX: number // vertical rotation
  cameraRotationY: number // horizontal rotation
  cameraZoom: number // 1-5x
  setCameraRotation: (x: number, y: number) => void
  setCameraZoom: (zoom: number) => void
  resetCamera: () => void

  // Onboarding rail
  isRailOpen: boolean
  toggleRail: () => void

  // Stage progress
  completedStages: Set<number>
  markStageComplete: (stage: number) => void

  // Reset
  reset: () => void
}

export const useRoomStateStore = create<RoomStateStore>((set, get) => ({
  // State selection
  selectedState: null,
  setSelectedState: (state) => set({ selectedState: state }),

  // Paint colors
  selectedPaintColor: null,
  setSelectedPaintColor: (color) => set({ selectedPaintColor: color }),

  // 3D camera (initial neutral position)
  cameraRotationX: 0,
  cameraRotationY: 0,
  cameraZoom: 1,
  setCameraRotation: (x, y) => set({ cameraRotationX: x, cameraRotationY: y }),
  setCameraZoom: (zoom) => {
    const clamped = Math.max(0.5, Math.min(5, zoom))
    set({ cameraZoom: clamped })
  },
  resetCamera: () => set({ cameraRotationX: 0, cameraRotationY: 0, cameraZoom: 1 }),

  // Onboarding rail
  isRailOpen: false,
  toggleRail: () => set({ isRailOpen: !get().isRailOpen }),

  // Stage progress (0-7 for decoration, 8 for electrical)
  completedStages: new Set(),
  markStageComplete: (stage) => {
    const completed = new Set(get().completedStages)
    completed.add(stage)
    set({ completedStages: completed })
  },

  // Reset all
  reset: () => set({
    selectedState: null,
    selectedPaintColor: null,
    cameraRotationX: 0,
    cameraRotationY: 0,
    cameraZoom: 1,
    isRailOpen: false,
    completedStages: new Set(),
  }),
}))
