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
