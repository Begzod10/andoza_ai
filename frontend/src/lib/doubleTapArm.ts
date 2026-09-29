/**
 * When a second tap means "I want to move this".
 *
 * One tap on a door opens its ring of designs, and that ring's backdrop covers
 * the screen — so the second tap of a double tap lands on the backdrop, not on
 * the door. A dismissal that arrives while the finger is still there is
 * therefore exactly what a double tap looks like from inside the menu, and it
 * is what arms an opening for dragging.
 *
 * Arming matters because without it a finger resting on a door and sliding a
 * little walked it along the wall, which is not what anyone taps a door to do.
 */

/** How soon after the ring opens a dismissal still counts as a double tap. */
export const DOUBLE_TAP_MS = 500

export interface RingAtDismiss {
  surface: string
  /** The opening the ring belongs to, if it belongs to one. */
  elId?: string
}

export function armsForDragging(
  ring: RingAtDismiss | null | undefined,
  openedAt: number,
  now: number,
): boolean {
  if (!ring?.elId) return false
  // Only an opening can be dragged; a wall or a ceiling has nowhere to go.
  if (ring.surface !== 'door' && ring.surface !== 'window') return false
  const since = now - openedAt
  // A dismissal from before the ring opened is a clock that went backwards,
  // not a double tap.
  return since >= 0 && since < DOUBLE_TAP_MS
}
