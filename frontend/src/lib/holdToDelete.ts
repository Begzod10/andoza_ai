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

/** How long a finger has to stay put. Long enough not to fire mid-drag, and
 *  the second the user asked for. */
export const HOLD_DELETE_MS = 1000
/**
 * Travel that still counts as holding still, px.
 *
 * Was 10, and the hold "sometimes worked and sometimes did not". The surface
 * ring's own hold — the one that fires reliably — allows 12 px over 460 ms,
 * which is 26 px of drift per second; this one allowed 10 px over a full
 * second, under a fifth of that rate. A thumb resting on a phone for a second
 * drifts further than that, so the delete timer was being cancelled by a
 * finger that had not moved on purpose at all.
 *
 * 20 px keeps it short of the ring's rate — a deliberate drag still cancels
 * at once — while leaving room for a hand that is merely holding still.
 */
export const HOLD_MOVE_TOL_PX = 20

export interface HoldPoint<T> {
  x: number
  y: number
  payload: T
}

export interface HoldTracker<T> {
  /** `pointerId` is what keeps a second finger, or a palm resting on the
   *  screen, from cancelling the hold the first finger is making. */
  down(x: number, y: number, payload: T, pointerId?: number): void
  move(x: number, y: number, pointerId?: number): void
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
  let holdingPointer: number | null = null
  let fired = false

  function stop() {
    if (timer != null) { clearTimer(timer); timer = null }
    start = null
    holdingPointer = null
  }

  return {
    get holding() { return timer != null },

    down(x, y, payload, pointerId) {
      stop()
      fired = false
      start = { x, y }
      holdingPointer = pointerId ?? null
      timer = setTimer(() => {
        timer = null
        fired = true
        opts.onHold({ x, y, payload })
      }, holdMs)
    },

    move(x, y, pointerId) {
      if (!start) return
      // Another finger moving is not this finger moving. Moves are watched on
      // the window for every pointer at once, so without this a second thumb
      // on the screen — or a palm — cancelled a hold that the holding finger
      // was making perfectly still.
      if (holdingPointer != null && pointerId != null && pointerId !== holdingPointer) return
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
