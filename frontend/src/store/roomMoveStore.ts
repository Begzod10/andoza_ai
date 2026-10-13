import { create } from 'zustand'

/**
 * Whether the 3D view is in "move rooms" mode — switched by the button beside
 * the lock, read inside the canvas where the arrows are drawn and dragged.
 * Not remembered: it is a tool you pick up and put down, not a preference.
 */
interface RoomMoveState {
  active: boolean
  toggle(): void
  set(active: boolean): void
}

export const useRoomMoveStore = create<RoomMoveState>((set) => ({
  active: false,
  toggle: () => set((s) => ({ active: !s.active })),
  set: (active) => set({ active }),
}))
