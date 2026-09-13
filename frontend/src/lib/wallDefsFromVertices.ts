/**
 * Builds `WallOpenings`-compatible wall definitions for an arbitrary polygon
 * room (rectilinear or otherwise hand-drawn), instead of the legacy 4-wall
 * axis-aligned rectangle assumption.
 *
 * This mirrors the exact per-edge math `NWallRoomShell` (in
 * `pages/studio/three-d/RoomShell.tsx` — read-only reference, not edited
 * here) uses to render the polygon's wall boxes, so this interactive layer's
 * raycast planes/hit-testing line up with what is actually drawn:
 *   - centre the polygon at its own centroid (metres) before any per-edge math
 *   - `dx = x2 - x1`, `dz = z2 - z1`, `length = sqrt(dx*dx + dz*dz)`
 *   - `ry = atan2(-dz, dx)` aligns a box's local-X with the edge direction
 *
 * `WallOpenings.tsx`'s existing `WallDef` (renamed here to `PolyWallDef` to
 * avoid re-exporting a type shape owned by that file) additionally needs, per
 * edge, an `axis` ('X' | 'Z'), the wall's constant cross-axis `face`
 * coordinate, and its `leftAlong` (along-axis coordinate of position 0) —
 * none of which a truly arbitrary polygon edge inherently has, since those
 * only make exact sense for an axis-aligned wall. See the `axis` derivation
 * below for how a near-axis-aligned edge is approximated.
 */
import * as THREE from 'three'

export interface PolyWallDef {
  id: string
  axis: 'X' | 'Z'
  /** world position of the wall's inner face on the OTHER axis */
  face: number
  /** along-axis world coordinate of the wall's LEFT edge (position = 0) */
  leftAlong: number
  length: number
  ry: number
  normal: THREE.Vector3
  plane: THREE.Plane
}

/** Degenerate-edge skip threshold (metres) — mirrors NWallRoomShell's own
 *  `if (length < 0.01) return null` so a near-duplicate vertex pair produces
 *  no wall here either. */
const MIN_EDGE_LENGTH_M = 0.01

/**
 * @param vertices Polygon vertices `[x, z]` in millimetres — the same
 *   convention `geometry.vertices` and `NWallRoomShell` use (converted to
 *   metres internally, exactly like `NWallRoomShell` does).
 * @param wallIds `geometry.walls.map(w => w.id)`, in the same order as the
 *   vertex-edge pairs: `wallIds[i]` is the id of the edge from
 *   `vertices[i]` to `vertices[(i + 1) % n]`.
 */
export function wallDefsFromVertices(
  vertices: [number, number][],
  wallIds: string[],
): Record<string, PolyWallDef> {
  const n = vertices.length
  if (n < 3) return {}

  // Centre the polygon at its own centroid, in metres — mirrors
  // NWallRoomShell's cxM/czM + `centred` computation exactly.
  const cxM = vertices.reduce((sum, [x]) => sum + x, 0) / n / 1000
  const czM = vertices.reduce((sum, [, z]) => sum + z, 0) / n / 1000
  const centred = vertices.map(
    ([x, z]) => [x / 1000 - cxM, z / 1000 - czM] as [number, number],
  )

  // Signed area (shoelace formula, treating (x, z) as a standard (x, y)
  // plane) gives the polygon's winding order. A per-edge "is this normal
  // closer to the centroid or away from it" test breaks down near a concave
  // notch — the centroid can sit on the "wrong" side of a reflex edge — so
  // instead we derive ONE global sign from the whole loop's winding and
  // apply it to every edge. That is correct for convex AND concave simple
  // polygons alike (the L-shape test case below has a concave notch).
  let signedArea = 0
  for (let i = 0; i < n; i++) {
    const [x1, z1] = centred[i]
    const [x2, z2] = centred[(i + 1) % n]
    signedArea += x1 * z2 - x2 * z1
  }
  // Verified against the legacy rectangle's own known-correct walls (A:
  // normal (0,0,1)/ry 0, C: normal (0,0,-1)/ry PI, and B/D derived the same
  // way): for that CCW-wound loop (signedArea > 0), `normalize(-dz, dx)`
  // already reproduces all four exactly with NO flip needed. A CW-wound
  // input (e.g. a hand-drawn polygon traced the other way) needs the sign
  // flipped to keep pointing the same way (into the room, matching how
  // WallOpenings.tsx's `toWorld` pushes openings "into the room" along this
  // normal) rather than out through the exterior wall face.
  const windingSign = signedArea >= 0 ? 1 : -1

  const defs: Record<string, PolyWallDef> = {}

  for (let i = 0; i < n; i++) {
    const [x1, z1] = centred[i]
    const [x2, z2] = centred[(i + 1) % n]
    const dx = x2 - x1
    const dz = z2 - z1
    const length = Math.sqrt(dx * dx + dz * dz)
    if (length < MIN_EDGE_LENGTH_M) continue // degenerate edge — skip, mirrors NWallRoomShell

    const id = wallIds[i] ?? String(i)

    const nx = (-dz / length) * windingSign
    const nz = (dx / length) * windingSign
    const normal = new THREE.Vector3(nx, 0, nz)
    // Same convention as NWallRoomShell's `Math.atan2(-dz, dx)`: since
    // (nx, nz) is a positive scalar multiple of (-dz, dx) (up to the shared
    // `windingSign`), `atan2(nx, nz) === atan2(-dz, dx)` for windingSign = 1,
    // and consistently rotates by PI when windingSign = -1 (normal flipped).
    const ry = Math.atan2(nx, nz)

    // `axis`: only strictly meaningful for an axis-aligned edge. For a
    // genuinely diagonal edge we approximate to whichever axis its direction
    // is CLOSER to (a 45° split — ties, |dx| === |dz|, go to 'X'), rather
    // than omitting the wall entirely. This keeps a slightly imprecise
    // hand-drawn rectangle's near-axis-aligned edges fully functional, at
    // the cost of click-to-add-window/door being approximate on a true ~45°
    // diagonal wall — an accepted, narrow limitation for this
    // rectilinear-focused hand-drawing feature.
    const axis: 'X' | 'Z' = Math.abs(dx) >= Math.abs(dz) ? 'X' : 'Z'
    const face = axis === 'X' ? (z1 + z2) / 2 : (x1 + x2) / 2
    const leftAlong = axis === 'X' ? Math.min(x1, x2) : Math.min(z1, z2)

    const midpoint = new THREE.Vector3((x1 + x2) / 2, 0, (z1 + z2) / 2)
    const plane = new THREE.Plane(normal, -normal.dot(midpoint))

    defs[id] = { id, axis, face, leftAlong, length, ry, normal, plane }
  }

  return defs
}
