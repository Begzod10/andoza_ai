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

/** A rectangle's own frame: its side lengths, and how far it is turned. */
export interface RectangleFrame {
  /** Length of the edge the local X axis runs along. */
  W: number
  /** Length of the edge the local Z axis runs along. */
  D: number
  /** Yaw, radians, as a three.js `rotation-y` — turn a group by this and its
   *  local X axis points along the outline's first edge. */
  yaw: number
}

/**
 * The outline as a rectangle at any angle, or null if it is not one.
 *
 * `isAxisAlignedRectangle` above was too strict, and the ceiling paid for it.
 * A room drawn or scanned at an angle is still a rectangle — the user's own
 * room is 5.70 x 3.85 m turned 27.8 degrees — but it failed the axis test, so
 * `buildCeilingParts` was never called, no design geometry was ever made, and
 * picking a ceiling from Shift turi changed the saved design while the room
 * carried on showing a flat slab. Nothing was broken on the way in: the menu
 * opened, the choice was stored. It simply had nothing to draw.
 *
 * Returning the frame rather than a yes/no is what lets the caller keep using
 * the axis-aligned box builder: build the parts for a W x D room as before,
 * then turn the whole group by `yaw`. The boxes do not have to know.
 *
 * The outline is assumed centred on its own middle, which is what the drawn
 * shell hands over and what a rectangle's vertex mean is anyway, so the frame
 * carries no offset.
 */
export function rectangleFrame(outline: Outline): RectangleFrame | null {
  if (outline.length !== 4) return null

  const edge = (i: number): [number, number] => {
    const [x0, z0] = outline[i]
    const [x1, z1] = outline[(i + 1) % 4]
    return [x1 - x0, z1 - z0]
  }

  const lengths: number[] = []
  for (let i = 0; i < 4; i++) {
    const [dx, dz] = edge(i)
    const len = Math.hypot(dx, dz)
    // A repeated vertex is a triangle wearing four points, not a rectangle.
    if (len <= TOL) return null
    lengths.push(len)

    // Square corners: the dot product of consecutive edges is zero. Scaled by
    // the two lengths so the tolerance stays a tolerance in metres rather than
    // tightening as the room grows.
    const [nx, nz] = edge((i + 1) % 4)
    if (Math.abs(dx * nx + dz * nz) / len > TOL) return null
  }

  // Opposite sides equal. Four right angles already force this for a closed
  // quadrilateral, but a drawn outline can be a hair open, and a ceiling built
  // to the wrong side length is worse than no ceiling at all.
  if (Math.abs(lengths[0] - lengths[2]) > TOL) return null
  if (Math.abs(lengths[1] - lengths[3]) > TOL) return null

  // Local +X runs along the first edge. three's rotation about +Y sends local
  // (1, 0) to world (cos, -sin), so the yaw that lands it on the edge is
  // atan2(-dz, dx).
  const [dx, dz] = edge(0)
  return { W: lengths[0], D: lengths[1], yaw: Math.atan2(-dz, dx) }
}
