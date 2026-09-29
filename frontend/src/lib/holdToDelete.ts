/**
 * Press-and-hold to delete, for the things in the room that are placed rather
 * than painted on: doors and windows, models, the skirting and the cornice,
 * and the electrical faceplates.
 *
 * Each of those already does something on a press — a door drags along its
 * wall, a model drags across the floor, a trim selects — so the hold has to
 * live alongside that and give way to it. Any real movement cancels: the user
 * who meant to drag gets a drag, and only a finger that stays put gets the
 * delete button.
 *
 * The timing lives here, apart from React and the DOM, so it can be tested
 * without a renderer.
 */

/** How long a finger has to stay put. Long enough not to fire mid-drag. */
export const HOLD_DELETE_MS = 1200
/** Travel that still counts as holding still, px. */
export const HOLD_MOVE_TOL_PX = 10

export interface HoldPoint<T> {
  x: number
  y: number
  payload: T
}

export interface HoldTracker<T> {
  down(x: number, y: number, payload: T): void
  move(x: number, y: number): void
  /** @returns whether the hold had already fired, so the caller can swallow
   *  the click that would otherwise follow. */
  up(): boolean
  cancel(): void
  readonly holding: boolean
}

export function createHoldTracker<T>(opts: {
  onHold: (p: HoldPoint<T>) => void
  holdMs?: number
  tolPx?: number
  /** Injectable for tests; defaults to the window's timers. */
  setTimer?: (fn: () => void, ms: number) => number
  clearTimer?: (id: number) => void
}): HoldTracker<T> {
  const holdMs = opts.holdMs ?? HOLD_DELETE_MS
  const tolPx = opts.tolPx ?? HOLD_MOVE_TOL_PX
  const setTimer = opts.setTimer ?? ((fn, ms) => window.setTimeout(fn, ms))
  const clearTimer = opts.clearTimer ?? ((id) => window.clearTimeout(id))

  let timer: number | null = null
  let start: { x: number; y: number } | null = null
  let fired = false

  function stop() {
    if (timer != null) { clearTimer(timer); timer = null }
    start = null
  }

  return {
    get holding() { return timer != null },

    down(x, y, payload) {
      stop()
      fired = false
      start = { x, y }
      timer = setTimer(() => {
        timer = null
        fired = true
        opts.onHold({ x, y, payload })
      }, holdMs)
    },

    move(x, y) {
      if (!start) return
      // Dragging is the other thing a press means here, so the moment this
      // looks like one the hold is off.
      if (Math.hypot(x - start.x, y - start.y) > tolPx) stop()
    },

    up() {
      stop()
      const didFire = fired
      fired = false
      return didFire
    },

    cancel() {
      stop()
      fired = false
    },
  }
}
