import type { StateCreator } from 'zustand'
import type { PlacedElectrical } from '../types'
import type { RoomStore } from '../roomStoreTypes'

export interface ElectricalSlice {
  electricals: PlacedElectrical[]

  addElectrical(e: PlacedElectrical): void
  moveElectrical(id: string, positionMm: number): void
  removeElectrical(id: string): void
}

export const createElectricalSlice: StateCreator<
  RoomStore,
  [],
  [],
  ElectricalSlice
> = (set) => ({
  electricals: [],

  addElectrical(e) {
    set((state) => ({ electricals: [...state.electricals, e], isDirty: true }))
  },

  moveElectrical(id, positionMm) {
    set((state) => ({
      electricals: state.electricals.map(e => e.id === id ? { ...e, positionMm } : e),
      isDirty: true,
    }))
  },

  removeElectrical(id) {
    set((state) => ({ electricals: state.electricals.filter((e) => e.id !== id), isDirty: true }))
  },
})
