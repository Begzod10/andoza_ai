/**
 * Questions about a drawn room's outline that the rectangular machinery needs
 * answered before it can be reused.
 *
 * The ceiling designs — the drop, the border, the cove — are built as
 * axis-aligned boxes for a W x D room. On an outline that is one, they are
 * exactly right; on an L-shaped one they would cut through a wall. So the
 * drawn-room shell asks first.
 */
export type Outline = [number, number][]

/** Millimetre tolerance, in metres: a drawn or scanned rectangle is never
 *  exact to the last decimal. */
const TOL = 0.01

/**
 * Whether the outline is a rectangle with its sides along X and Z.
 *
 * Both parts matter: the ceiling parts are axis-aligned boxes, so a rectangle
 * drawn at 30 degrees is no more usable than an L.
 */
export function isAxisAlignedRectangle(outline: Outline): boolean {
  if (outline.length !== 4) return false
  for (let i = 0; i < 4; i++) {
    const [x0, z0] = outline[i]
    const [x1, z1] = outline[(i + 1) % 4]
    const alongX = Math.abs(z1 - z0) <= TOL
    const alongZ = Math.abs(x1 - x0) <= TOL
    // Exactly one of the two: a diagonal edge fails both, a degenerate one
    // (a repeated vertex) passes both and is not a rectangle either.
    if (alongX === alongZ) return false
  }
  return true
}

/** The outline's extent along each axis. */
export function outlineSpan(outline: Outline): { W: number; D: number } {
  if (!outline.length) return { W: 0, D: 0 }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const [x, z] of outline) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z)
  }
  return { W: maxX - minX, D: maxZ - minZ }
}
