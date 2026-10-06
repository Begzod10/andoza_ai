/**
 * When a second tap on the same ring button means "and everywhere else too".
 *
 * Picking a colour, a wallpaper or a tile from the wall ring paints the wall
 * that was tapped, which is right: the ring was opened ON a wall, and that is
 * the wall the user meant. But a room is usually finished in one paper, and
 * doing the other three walls meant tapping each one, opening its ring,
 * finding the same swatch and picking it again — four times for one decision.
 *
 * So a second tap on the swatch already picked carries it to every wall. The
 * first tap is NOT held back waiting to see whether a second arrives: it acts
 * at once, as it always did, and the second escalates what it did. Delaying
 * every single tap by a double-tap window to make the double tap tidy would
 * trade a rare convenience for latency on the common action, and the user
 * would feel the lag on every pick.
 *
 * That also makes the gesture self-explaining: the first tap shows the finish
 * on one wall, and if the user likes it the second spreads it. Nothing is
 * undone in between.
 */

/** How long after a tap a second one on the same thing still counts.
 *
 *  350 ms is the platform double-tap window. Longer starts catching a user
 *  who tapped, looked at the wall, and deliberately tapped again meaning only
 *  that wall; shorter is hard to hit on a phone. */
export const DOUBLE_TAP_MS = 350

export interface TapRecord {
  key: string
  at: number
}

/**
 * Whether this tap is the second of a double tap on the same button.
 *
 * `previous` is the last tap seen, or null. A tap on a different button is
 * never a double tap, however quickly it follows — the two taps have to be
 * about the same choice for "and everywhere" to mean anything.
 */
export function isDoubleTap(
  previous: TapRecord | null | undefined,
  key: string,
  now: number,
  windowMs = DOUBLE_TAP_MS,
): boolean {
  if (!previous || previous.key !== key) return false
  const since = now - previous.at
  // A negative gap is a clock that went backwards, not a fast finger.
  return since >= 0 && since < windowMs
}

/**
 * The tap to remember after handling this one.
 *
 * A double tap clears the record rather than storing itself, so three taps in
 * quick succession are one single and one double — not a double followed by
 * another double off the middle tap, which would fire "all walls" twice and
 * make a triple tap behave like a stutter.
 */
export function nextTapRecord(
  previous: TapRecord | null | undefined,
  key: string,
  now: number,
  windowMs = DOUBLE_TAP_MS,
): TapRecord | null {
  return isDoubleTap(previous, key, now, windowMs) ? null : { key, at: now }
}
