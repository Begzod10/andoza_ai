import type { StateCreator } from 'zustand'
import type { RoomStore } from '../roomStoreTypes'

export interface IdentitySlice {
  draftId: string | null
  roomId: string | null
  apartmentId: string | null
  name: string
  isDirty: boolean
  wizardStep: number

  setDraftId(id: string | null): void
  setRoomId(id: string): void
  setApartmentId(id: string | null): void
  setWizardStep(step: number): void
  markSaved(): void
}

export const createIdentitySlice: StateCreator<
  RoomStore,
  [],
  [],
  IdentitySlice
> = (set) => ({
  draftId: null,
  roomId: null,
  apartmentId: null,
  name: 'Xona',
  isDirty: false,
  wizardStep: 0,

  setDraftId(id) {
    set({ draftId: id })
  },

  setRoomId(id) {
    set({ roomId: id })
  },

  setApartmentId(id) {
    set({ apartmentId: id })
  },

  setWizardStep(step) {
    set({ wizardStep: step })
  },

  markSaved() {
    set({ isDirty: false })
  },
})
