/**
 * Keeping wall devices off doors and windows.
 *
 * A socket dragged along a wall went straight over the door and stayed there,
 * drawn on the leaf. Nothing in the room stopped it: the drag clamped to the
 * wall's two ends and nothing else.
 *
 * The rule is about the opening a device would actually land in, not about
 * every opening on the wall: a socket at 300 mm passes happily under a window
 * whose sill is at 900. So a span only blocks when the two overlap BOTH ways —
 * across the wall and up it.
 */

/** An opening, as the store holds it: `position` is its left edge in mm. */
export interface OpeningLike {
  position: number
  width: number
  sill_height: number
  height: number
}

/** The device being placed, in mm. `bottomMm` is its mounting height. */
export interface DeviceBand {
  widthMm: number
  bottomMm: number
  topMm: number
}

/** Gap kept between a device and the edge of an opening, mm. Enough that the
 *  faceplate clears the architrave rather than touching it. */
export const OPENING_CLEARANCE_MM = 30

function overlapsVertically(op: OpeningLike, band: DeviceBand): boolean {
  const opBottom = op.sill_height
  const opTop = op.sill_height + op.height
  // Touching exactly is not overlapping: a device that ends where the opening
  // begins is beside it, not on it.
  return band.bottomMm < opTop && band.topMm > opBottom
}

/**
 * The centre positions a device may NOT take, merged and in order. A device is
 * placed by its centre, so each opening blocks its own span widened by half
 * the device plus the clearance.
 */
export function blockedCentreSpans(
  openings: readonly OpeningLike[],
  band: DeviceBand,
): [number, number][] {
  const pad = band.widthMm / 2 + OPENING_CLEARANCE_MM
  const spans = openings
    .filter((op) => op.width > 0 && overlapsVertically(op, band))
    .map((op): [number, number] => [op.position - pad, op.position + op.width + pad])
    .sort((a, b) => a[0] - b[0])

  const merged: [number, number][] = []
  for (const span of spans) {
    const last = merged[merged.length - 1]
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1])
    else merged.push([...span])
  }
  return merged
}

/**
 * The nearest position to `posMm` that the device may occupy: inside the wall,
 * and clear of any opening it would otherwise sit on.
 *
 * A device pushed out of a doorway goes to whichever jamb it was nearer, so a
 * drag across the door slides on out the far side instead of sticking at the
 * near one.
 */
export function clearOfOpenings(
  posMm: number,
  band: DeviceBand,
  openings: readonly OpeningLike[],
  wallLengthMm: number,
  /** How close to the wall's ends a device may sit, mm. */
  endMarginMm = 100,
): number {
  const lo = Math.min(endMarginMm, wallLengthMm / 2)
  const hi = Math.max(wallLengthMm - endMarginMm, wallLengthMm / 2)
  const clamped = Math.max(lo, Math.min(hi, posMm))

  const blocked = blockedCentreSpans(openings, band)
  const hit = blocked.find(([a, b]) => clamped > a && clamped < b)
  if (!hit) return clamped

  const [a, b] = hit
  const left = a
  const right = b
  const leftOk = left >= lo && !blocked.some(([x, y]) => left > x && left < y)
  const rightOk = right <= hi && !blocked.some(([x, y]) => right > x && right < y)
  if (leftOk && rightOk) return clamped - left <= right - clamped ? left : right
  if (leftOk) return left
  if (rightOk) return right
  // The wall is openings end to end (a glazed wall, say). Nowhere is better
  // than anywhere, so leave the device where the user put it rather than
  // snapping it somewhere arbitrary.
  return clamped
}
