import type { StateCreator } from 'zustand'
import type { PlacedLight } from '../types'
import type { RoomStore } from '../roomStoreTypes'

export interface LightSlice {
  lights: PlacedLight[]

  addLight(l: PlacedLight): void
  updateLight(id: string, patch: Partial<Omit<PlacedLight, 'id'>>): void
  moveLight(id: string, xMm: number, zMm: number): void
  removeLight(id: string): void
  clearLights(): void
}

export const createLightSlice: StateCreator<
  RoomStore,
  [],
  [],
  LightSlice
> = (set) => ({
  lights: [],

  addLight(l) {
    set((state) => ({ lights: [...state.lights, l], isDirty: true }))
  },

  updateLight(id, patch) {
    set((state) => ({
      lights: state.lights.map((l) => l.id === id ? { ...l, ...patch } : l),
      isDirty: true,
    }))
  },

  moveLight(id, xMm, zMm) {
    set((state) => ({
      lights: state.lights.map((l) => l.id === id ? { ...l, xMm, zMm } : l),
      isDirty: true,
    }))
  },

  removeLight(id) {
    set((state) => ({ lights: state.lights.filter((l) => l.id !== id), isDirty: true }))
  },

  clearLights() {
    set({ lights: [], isDirty: true })
  },
})
