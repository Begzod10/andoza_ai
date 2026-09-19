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
 * coordinate, and its `originAlong` (along-axis coordinate of position 0) —
 * none of which a truly arbitrary polygon edge inherently has, since those
 * only make exact sense for an axis-aligned wall. See the `axis` derivation
 * below for how a near-axis-aligned edge is approximated.
 *
 * WHERE POSITION 0 IS — see the block comment above `originAlong` in the loop
 * below. Short version: on a polygon edge it is `vertices[i]`, the same end
 * the server measures `WallElement.position` from; on a legacy A/B/C/D
 * rectangle it stays the along-axis minimum, which is what that room's own
 * renderer and its stored openings have always meant.
 */
import * as THREE from 'three'

export interface PolyWallDef {
  id: string
  axis: 'X' | 'Z'
  /** world position of the wall's inner face on the OTHER axis */
  face: number
  /** along-axis world coordinate of the wall's position-0 end. NOT necessarily
   *  the axis minimum: on a polygon edge that runs in the DECREASING direction
   *  on its own dominant axis this is the larger coordinate, and `alongSign` is
   *  −1. Map a position to the along axis with
   *  `originAlong + alongSign * alongM`, and back with
   *  `(along - originAlong) * alongSign`. */
  originAlong: number
  /** Direction of increasing position on the `axis` axis: +1 or −1. */
  alongSign: 1 | -1
  /** TRUE world midpoint of the edge (metres, centroid-centred frame). Unlike
   *  `face`/`originAlong` this is exact for a diagonal edge, and matches the
   *  `mx`/`mz` `NWallRoomShell` positions the drawn wall box at. */
  midX: number
  midZ: number
  /** Unit vector along the edge, from `vertices[i]` (where a polygon wall
   *  element's `position` is measured from, i.e. position 0) toward
   *  `vertices[i + 1]`.
   *  Same direction `NWallRoomShell`'s wall group maps its local +X to, so a
   *  world point on the wall is `mid + dir * (alongMetres - length / 2)`. */
  dirX: number
  dirZ: number
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

  // A legacy A/B/C/D rectangle reaches this function too: the server's
  // RoomGeometry validator auto-fills `vertices` for any 4-wall room
  // (`_normalize_polygon`, backend/app/schemas/room.py) as the CCW loop
  // (0,0) → (a,0) → (a,b) → (0,b), so a saved-and-reloaded wizard rectangle
  // has vertices even though nothing about it is polygon-shaped. Its openings
  // predate polygons entirely and mean "millimetres from the wall's along-axis
  // MINIMUM end" — that is what `RoomScene`'s legacy ABCD branch renders
  // (walls A and C are both `axis: 'X'`, `cx: 0`, so both measure from −W/2)
  // and what `WallOpenings`' hardcoded `buildWallDefs` fallback agrees with.
  // Edges 2 and 3 of that generated loop run in the decreasing direction, so
  // traversal order would mirror every C/D opening in every rectangle room
  // ever saved. Keep the old meaning for exactly that shape.
  const legacyAbcd =
    wallIds.length === 4 && ['A', 'B', 'C', 'D'].every((id, i) => wallIds[i] === id)

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

    // ── Where position 0 sits, and which way position grows ──────────────
    // The server is the source of truth for scanned geometry, and it measures
    // `WallElement.position` as a 0..1 fraction from `corners[i]` toward
    // `corners[i + 1]` — polygon traversal order (see
    // `backend/app/services/room_scan_converter.py`, and the auto-placed
    // electrical devices in `room_electrical_auto.py`, which document the same
    // direction). This file used to take position 0 to be whichever endpoint
    // had the SMALLER coordinate on the edge's dominant axis. A closed simple
    // polygon must traverse each axis in both directions, so on every room
    // some edges run the "wrong" way and the two readings are mirror images:
    // frontend position = length − backend position. On the real 5-wall scan
    // fixture `captured_room_real_scan2.json` that put a window 0.92 m from
    // where the LiDAR saw it, and on `captured_room_sample.json` a full 1.0 m.
    //
    // Traversal order wins, for three reasons beyond the server being
    // authoritative:
    //   1. `NWallRoomShell` (pages/studio/three-d/RoomShell.tsx) — the code
    //      that actually CARVES the opening out of the wall mesh — wraps each
    //      edge in a group rotated by `atan2(-dz, dx)`, which maps the wall's
    //      local +X onto `vertices[i] → vertices[i + 1]`. The hole in the wall
    //      has therefore always been at the traversal-order position. Same for
    //      the door/window frames and baseboard it renders inside that group,
    //      and for `wallFramesFromVertices` (components/studio/DoorLeaves.tsx),
    //      which reads `dirX`/`dirZ` from this very file. The old `leftAlong`
    //      disagreed with all of them — a scanned room's drag handle and its
    //      hole were on opposite ends of the same wall.
    //   2. Unlike an axis minimum, it is well defined for a diagonal edge, and
    //      no real scan produces axis-aligned walls.
    //   3. The Flutter converter mirrors the backend algorithm, so leaving the
    //      server alone means no mobile change and no migration of the stored
    //      positions of real scanned rooms.
    // Trade-off accepted: openings that a user DRAGGED onto a decreasing-
    // direction edge of a HAND-DRAWN polygon were stored under the old reading
    // and now mirror. Those rooms were already self-inconsistent (the handle
    // and the carved hole disagreed), so there is no coherent stored state to
    // migrate — this makes the room agree with itself. Auto-centred openings
    // (lib/wallPositions.ts) are symmetric about the wall midpoint and so are
    // unaffected either way.
    const along1 = axis === 'X' ? x1 : z1
    const along2 = axis === 'X' ? x2 : z2
    const alongSign: 1 | -1 = legacyAbcd || along2 >= along1 ? 1 : -1
    const originAlong = legacyAbcd ? Math.min(along1, along2) : along1

    const midpoint = new THREE.Vector3((x1 + x2) / 2, 0, (z1 + z2) / 2)
    const plane = new THREE.Plane(normal, -normal.dot(midpoint))

    defs[id] = {
      id,
      axis,
      face,
      originAlong,
      alongSign,
      midX: (x1 + x2) / 2,
      midZ: (z1 + z2) / 2,
      dirX: dx / length,
      dirZ: dz / length,
      length,
      ry,
      normal,
      plane,
    }
  }

  return defs
}
