import type { WallElement } from '@/store/roomStore'

const GAP_MM = 400

/**
 * Whether an element still needs auto-placement (centered/auto-spread below)
 * rather than being honored as an explicit, user-committed `position`.
 *
 * `position > 0` alone is NOT a safe signal: a corner-dragged opening can
 * legitimately land at `position === 0`, and that is a deliberate placement,
 * not "unset". `positionAuto` disambiguates the two cases; when it is absent
 * (legacy elements saved before this flag existed) we fall back to the exact
 * old `position > 0` heuristic so previously-saved rooms render unchanged.
 */
function needsAutoPlacement(el: WallElement): boolean {
  if (el.positionAuto === true) return true
  if (el.positionAuto === false) return false
  // el.positionAuto === undefined — legacy element, preserve old behavior.
  return el.position <= 0
}

/**
 * Returns a new array of elements with their positions resolved.
 * - 1 element: centered on the wall.
 * - 2 elements: the pair is centered together with a 400mm gap between them.
 *   If both already have explicit positions they are kept as-is.
 * - 3+ elements: evenly distributed; explicit positions are kept.
 */
export function resolveElementPositions(
  elements: WallElement[],
  wallLenMm: number,
): WallElement[] {
  const n = elements.length
  if (n === 0) return elements

  if (n === 1) {
    const el = elements[0]
    if (!needsAutoPlacement(el)) return elements
    return [{ ...el, position: Math.max(0, Math.round((wallLenMm - el.width) / 2)) }]
  }

  if (n === 2) {
    if (elements.every((e) => !needsAutoPlacement(e))) return elements
    const totalGroup = elements[0].width + GAP_MM + elements[1].width
    const groupStart = Math.max(0, Math.round((wallLenMm - totalGroup) / 2))
    return [
      { ...elements[0], position: groupStart },
      { ...elements[1], position: groupStart + elements[0].width + GAP_MM },
    ]
  }

  // 3+ elements
  return elements.map((el, i) => ({
    ...el,
    position: needsAutoPlacement(el)
      ? Math.round((wallLenMm / (n + 1)) * (i + 1) - el.width / 2)
      : el.position,
  }))
}

// ─── API ↔ store position conversion ─────────────────────────────────────────
//
// The two sides of the wire measure an opening from different points, and the
// difference is exactly half its width — big enough to move a 900 mm door
// 450 mm, small enough that it long went unnoticed on narrow windows:
//
//   API  (backend/app/schemas/room.py, WallElement.position)
//        the opening's CENTRE, as a 0..1 fraction of the wall's length.
//   store (WallElement.position above)
//        the opening's LEFT EDGE, in millimetres.
//
// Convert only here. Everything downstream — rendering, dragging, the 2D plans
// — speaks store millimetres, and `convert_captured_room` / `room_electrical_auto`
// on the server speak centre fractions.

/** API centre fraction → store left-edge millimetres. */
export function apiPositionToStoreMm(
  fraction: number,
  wallLenMm: number,
  widthMm: number,
): number {
  // May legitimately go negative: the scan can see a door whose centre sits
  // less than half its width from a corner, and clamping here would silently
  // move it. The renderers cope; only a user drag clamps it onto the wall.
  return Math.round(fraction * wallLenMm - widthMm / 2)
}

/** Store left-edge millimetres → API centre fraction, clamped to the field's 0..1.
 *
 *  Pass an element whose `position` is already resolved (see
 *  `resolveElementPositions`) — an unresolved auto placeholder still reads 0,
 *  which would be saved as "centre half a width from the start corner" rather
 *  than the centred spot it actually renders at. */
export function storeElementToApiPosition(
  el: Pick<WallElement, 'position' | 'width'>,
  wallLenMm: number,
): number {
  if (wallLenMm <= 0) return 0.5
  const centreMm = el.position + el.width / 2
  return Math.min(1, Math.max(0, centreMm / wallLenMm))
}

/** Every element of a wall as the API wants them: auto placeholders resolved to
 *  where they actually render, then each one's centre as a 0..1 fraction.
 *
 *  Resolving first is what makes the save round-trip exact. The old shortcut
 *  ("position 0 ⇒ write 0.5") happened to be right for a lone auto opening —
 *  it does render centred — but collapsed two auto openings on one wall onto
 *  the same spot, and reloading then turned that into two explicit, overlapping
 *  positions. */
export function wallElementsToApiPositions(
  elements: WallElement[],
  wallLenMm: number,
): number[] {
  return resolveElementPositions(elements, wallLenMm).map((el) =>
    storeElementToApiPosition(el, wallLenMm),
  )
}
