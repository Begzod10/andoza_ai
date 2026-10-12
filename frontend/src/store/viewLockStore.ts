import { create } from 'zustand'

/**
 * The 3D view's lock.
 *
 * Locked, nothing in the scene answers a tap or a hold — no wall, floor or
 * door ring, no door panel, no hold-to-delete, no selecting or dragging — so
 * the room can be turned and looked at without a menu popping up under the
 * finger. Orbiting and zooming are the camera's own DOM handlers and keep
 * working. The user asked for it as a button that locks and unlocks "3d edit
 * buttons pop up".
 *
 * Per device, kept in localStorage: it is a viewing preference, not part of
 * the design, and a page that cannot store it still works, just unlocked.
 */
export const VIEW_LOCK_KEY = 'andoza-view-lock'

export function readViewLock(): boolean {
  try { return localStorage.getItem(VIEW_LOCK_KEY) === '1' } catch { return false }
}

function writeViewLock(locked: boolean) {
  try { localStorage.setItem(VIEW_LOCK_KEY, locked ? '1' : '0') } catch { /* private window */ }
}

interface ViewLockState {
  locked: boolean
  toggle(): void
}

export const useViewLockStore = create<ViewLockState>((set, get) => ({
  locked: readViewLock(),
  toggle: () => {
    const locked = !get().locked
    writeViewLock(locked)
    set({ locked })
  },
}))
