/**
 * Whether a window style picked from the ring makes a new window or restyles
 * the one just made.
 *
 * The ring stays open after a pick, so a second style is almost always the
 * user reconsidering the window in front of them rather than asking for
 * another one beside it. Same spot, same window; a new window means tapping a
 * new spot.
 */
export interface StyledWindow {
  /** Which tap it came from. */
  spot: string
  wallId: string
  id: string
}

/** Identifies the tap. Rounded to the millimetre: the radial menu hands back
 *  the same hit point for the whole of one gesture, but float noise between
 *  renders should not read as a different spot. */
export function windowSpotKey(
  wallId: string,
  point: { x: number; y: number; z: number },
): string {
  return `${wallId}:${point.x.toFixed(3)}:${point.y.toFixed(3)}:${point.z.toFixed(3)}`
}

/**
 * True when the pick should change `last` rather than add a window.
 *
 * `elements` is the wall's current openings — a window deleted in between
 * cannot be restyled, and the pick should make a fresh one instead of
 * silently doing nothing.
 */
export function restylesExisting(
  last: StyledWindow | null | undefined,
  spot: string,
  elements: readonly { id: string }[] | undefined,
): last is StyledWindow {
  if (!last || last.spot !== spot) return false
  return !!elements?.some((e) => e.id === last.id)
}
