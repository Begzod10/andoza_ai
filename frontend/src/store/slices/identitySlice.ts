import type { StateCreator } from 'zustand'
import type { RoomType } from '@/lib/roomType'
import type { RoomStore } from '../roomStoreTypes'

export interface IdentitySlice {
  draftId: string | null
  roomId: string | null
  apartmentId: string | null
  name: string
  /** The room's kind (null until picked); sent to the AI designer. */
  roomType: RoomType | null
  isDirty: boolean
  wizardStep: number

  setDraftId(id: string | null): void
  setRoomId(id: string): void
  setApartmentId(id: string | null): void
  setRoomType(type: RoomType | null): void
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
  // Empty until a room is loaded or created: the default name is chosen then,
  // in the language of that moment (lib/defaultNames), never frozen at import.
  name: '',
  roomType: null,
  isDirty: false,
  wizardStep: 0,

  setDraftId(id) {
    set({ draftId: id })
  },

  setRoomId(id) {
    set({ roomId: id })
  },

  setRoomType(type) {
    set({ roomType: type })
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
