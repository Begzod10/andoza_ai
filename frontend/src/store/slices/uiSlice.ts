import type { StateCreator } from 'zustand'
import { hourOfDay } from '@/lib/sunPosition'
import type { RoomStore } from '../roomStoreTypes'

export interface UiSlice {
  /**
   * Time of day the sun is shown at, as fractional hours. Lives here rather
   * than in a page so the studio, the walkthrough and anything else looking at
   * the same room agree about what time it is — a walkthrough lit at noon
   * inside a room designed at dusk is worse than either on its own.
   *
   * Deliberately not persisted: it opens at the real current time.
   */
  sunHour: number
  highQuality3d: boolean
  /** Room's position in the apartment floor plan (metres); null = not placed */
  layoutPos: { x: number; z: number } | null

  setSunHour(hour: number): void
  setHighQuality3d(v: boolean): void
  setLayoutPos(pos: { x: number; z: number } | null): void
}

export const createUiSlice: StateCreator<
  RoomStore,
  [],
  [],
  UiSlice
> = (set) => ({
  sunHour: hourOfDay(new Date()),
  // Auto-detect mobile: no fine pointer = touch device → default off.
  // A window can exist without matchMedia (jsdom, older embedded webviews), so
  // probe the method rather than assuming it comes with the window.
  highQuality3d:
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer:fine)').matches,
  layoutPos: null,

  setSunHour(hour) {
    set({ sunHour: hour })
  },

  setHighQuality3d(v) {
    set({ highQuality3d: v })
  },

  setLayoutPos(pos) {
    set({ layoutPos: pos })
  },
})
