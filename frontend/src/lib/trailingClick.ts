/**
 * The click that trails a tap on a dismissed overlay.
 *
 * A tap is pointerdown, pointerup, then `click`. The ring's backdrop closes
 * on pointerup, so by the time the click is dispatched the backdrop is gone —
 * and on a phone the browser aims that click at whatever is under the finger
 * NOW: the wall the ring was opened on, which opens it again. A mouse's
 * click goes to the element that was pressed, now detached, so desktop
 * never saw it. "One tap open, one tap close the same wall" is this.
 *
 * The guard swallows exactly one click, if it arrives soon after a
 * dismissal; a deliberate tap later goes through.
 */

/** How long after a dismissal a click still counts as its trailing one. */
export const TRAILING_CLICK_MS = 400

export interface TrailingClickGuard {
  /** A dismissal just happened (now, ms). */
  arm(now: number): void
  /** Whether this click (now, ms) is the trailing one — true once per arming. */
  shouldSwallow(now: number): boolean
}

export function createTrailingClickGuard(): TrailingClickGuard {
  let armedAt: number | null = null
  return {
    arm(now) { armedAt = now },
    shouldSwallow(now) {
      if (armedAt === null) return false
      const trailing = now - armedAt >= 0 && now - armedAt < TRAILING_CLICK_MS
      armedAt = null
      return trailing
    },
  }
}
