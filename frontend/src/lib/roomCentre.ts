/**
 * Where "the middle of the room" is, for a room that is not a rectangle.
 *
 * The 360 camera used to stand at the world origin, on the reasoning that the
 * 3D scene centres the room on the origin so the origin must be its middle.
 * That is true of the legacy A-B-C-D rectangle and false of every drawn or
 * scanned polygon: `NWallRoomShell` (pages/studio/three-d/RoomShell.tsx)
 * centres the outline on the MEAN OF ITS VERTICES, and a vertex mean is not a
 * point in the room at all. For the L-shaped room
 * `[0,0] [6000,0] [6000,2000] [2000,2000] [2000,6000] [0,6000]` the vertex
 * mean is (2667, 2667) mm, which sits in the cut-away notch — outside the
 * floor, inside a wall. A panorama rendered from inside a wall is the worst
 * failure this feature has, and it is the same "the rectangle is handled, the
 * polygon falls through" bug family as `clampFootprintToRoom`.
 *
 * The user's words were: "set 360 camera in the middle of the room, you can
 * take the middle point from floor, according to the edges of floor" — so the
 * point must come from the floor's own edges, which is what this file does.
 *
 * ## Which "middle"
 *
 * Three candidates, in increasing order of being right:
 *
 *   - The **vertex mean** is what the camera used, and it is wrong for any
 *     non-convex outline, as above. It is also unstable: splitting one wall
 *     into two collinear halves adds a vertex and moves the "middle".
 *   - The **area centroid** is a real property of the floor rather than of the
 *     vertex list, but it still leaves the room: the L above has its centroid
 *     at (2200, 2200), which is also in the notch.
 *   - The **pole of inaccessibility** — the interior point furthest from any
 *     edge, i.e. the centre of the largest circle that fits in the floor — is
 *     always strictly inside by construction, is what a person means when they
 *     are told to stand in the middle of a room, and gives the camera the most
 *     room to turn in before a wall is in its face. This is what we use.
 *
 * The pole alone is not quite enough, because it is not always unique. In a
 * 4000 x 3000 room every point on the segment z = 1500, x in [1500, 2500] is
 * 1500 mm from the nearest wall, so a search would return whichever of them it
 * happened to visit first — and for a plain rectangle that must not happen:
 * the camera has to stay exactly where it already is, or we would have moved
 * it in every ordinary room for nothing. So the definition is lexicographic:
 * **the deepest point, and among equally deep points the one nearest the area
 * centroid**. For a rectangle (and for a corridor) the centroid is itself a
 * deepest point, so the answer is the centroid exactly — the geometric centre,
 * unchanged. For an L the centroid is not deep at all and the pole stands.
 *
 * ## Frames
 *
 * Everything here is in the plan frame `planPolygon` establishes: millimetres,
 * x to the right and z down, with the world origin at plan (W/2, D/2). The
 * caller converts with `planToWorld` from `furnitureBounds`, which is correct
 * for this purpose because the two definitions compose exactly:
 *   - `NWallRoomShell`:  world_m   = raw_mm / 1000 - vertexMean_mm / 1000
 *   - `planPolygon`:     plan_mm   = raw_mm - vertexMean_mm + (W/2, D/2)
 *   => plan_mm = world_m * 1000 + (W/2, D/2), which is `worldToPlan`.
 * Note that this makes (W/2, D/2) the vertex mean, NOT the centre of the
 * plan bounding box — a polygon's plan box does not start at (0, 0) and
 * `minX`/`minZ` are generally non-zero. Anything that assumed the box started
 * at the origin would be off by exactly the amount this fix is about, so the
 * test file pins the composition rather than trusting it.
 *
 * ## Relation to `interiorAnchor`
 *
 * `furnitureBounds.interiorAnchor` is the nearest point to the bounding-box
 * centre where a given footprint FITS. That is the right answer for dropping a
 * wardrobe — it wants to be near the middle but it mostly wants to be legal —
 * and the wrong one for a camera: it happily returns a spot hugging a wall,
 * and it is driven by the box centre, the very point that lands in the notch.
 * Extending it was considered and rejected: the two want different objectives
 * (feasibility-nearest-centre vs. furthest-from-any-wall), and bending one
 * into the other would make furniture placement drift to the middle of the
 * floor. This file is a sibling, in the same frame, sharing `RoomBounds`,
 * `planToWorld` and `pointInPolygon` so there is still only one notion of
 * "inside the room".
 */
import { planToWorld, roomBoundsFromGeometry, type PlanPoint, type RoomBounds } from '@/lib/furnitureBounds'
import { pointInPolygon } from '@/lib/planPolygon'
import type { RoomGeometry } from '@/store/roomStore'

type Outline = [number, number][]

/**
 * How much deeper one point has to be than another to count as deeper, mm.
 *
 * Half a millimetre of clearance is not a difference anybody can stand in, so
 * within that the tie-break decides instead. This is what makes the plain
 * rectangle come out at its exact centre: the grid search can only ever report
 * a sampled point, which is at best equal to the true maximum and in practice
 * a hair under it, and without a tolerance the centroid would lose that
 * comparison to floating-point noise and the camera would shift by a few
 * millimetres in every rectangular room.
 */
const DEPTH_TIE_MM = 0.5

/** Distance from (x, z) to the segment p1-p2, mm. */
function distanceToSegment(
  x: number, z: number,
  x1: number, z1: number,
  x2: number, z2: number,
): number {
  const ex = x2 - x1
  const ez = z2 - z1
  const len2 = ex * ex + ez * ez
  // A degenerate edge collapses to its own endpoint rather than dividing by
  // zero; `planPolygon` drops edges under 10 mm but this is also called with
  // raw outlines from tests and from `roomBoundsFromGeometry`'s offset copy.
  if (len2 < 1e-12) return Math.hypot(x - x1, z - z1)
  const t = Math.max(0, Math.min(1, ((x - x1) * ex + (z - z1) * ez) / len2))
  return Math.hypot(x - (x1 + ex * t), z - (z1 + ez * t))
}

/**
 * Signed distance from a plan point to the floor's edges, mm: positive inside
 * the room, negative outside it.
 *
 * The sign is what lets the coarse grid below be searched by plain
 * maximisation. If outside points all scored zero the search would have a flat
 * plateau everywhere beyond the walls and no reason to prefer a point just
 * outside the room over one across the street, which matters for the degenerate
 * outlines (a self-touching scan, a room of three nearly collinear vertices)
 * where no sampled point lands inside at all.
 */
export function edgeClearance(x: number, z: number, outline: Outline): number {
  let best = Infinity
  const n = outline.length
  for (let i = 0; i < n; i++) {
    const [x1, z1] = outline[i]
    const [x2, z2] = outline[(i + 1) % n]
    const d = distanceToSegment(x, z, x1, z1, x2, z2)
    if (d < best) best = d
  }
  if (!isFinite(best)) return 0
  return pointInPolygon(x, z, outline) ? best : -best
}

/**
 * The floor's area centroid, plan mm — the shoelace centroid, not the mean of
 * the vertex list, so that splitting a wall into two collinear halves does not
 * move it.
 *
 * Falls back to the vertex mean for a zero-area outline (all vertices on one
 * line), which has no centroid to speak of but must still return a number
 * rather than NaN.
 */
export function polygonAreaCentroid(outline: Outline): PlanPoint {
  const n = outline.length
  let area2 = 0
  let cx = 0
  let cz = 0
  for (let i = 0; i < n; i++) {
    const [x1, z1] = outline[i]
    const [x2, z2] = outline[(i + 1) % n]
    const cross = x1 * z2 - x2 * z1
    area2 += cross
    cx += (x1 + x2) * cross
    cz += (z1 + z2) * cross
  }
  if (Math.abs(area2) < 1e-9) {
    return {
      x: outline.reduce((s, [x]) => s + x, 0) / Math.max(1, n),
      z: outline.reduce((s, [, z]) => s + z, 0) / Math.max(1, n),
    }
  }
  return { x: cx / (3 * area2), z: cz / (3 * area2) }
}

/** Coarse samples per axis across the bounding box, before refinement. */
const COARSE_STEPS = 32
/** Halvings of the search window after the coarse pass. */
const REFINE_ROUNDS = 20
/** Samples per axis inside each refinement window. */
const REFINE_STEPS = 4

/**
 * The interior point furthest from any edge, plan mm.
 *
 * Grid refinement rather than a medial-axis construction or Mapbox's
 * priority-queue "polylabel": a room has a handful of edges and this runs once,
 * when the panorama is opened, not per frame — so the honest cost of a coarse
 * scan plus twenty halvings (about 1400 clearance evaluations) is nothing, and
 * there is no quadtree bookkeeping to get wrong. The coarse pass exists so the
 * refinement cannot be trapped in the wrong arm of an L: it scans the whole
 * bounding box before committing to a neighbourhood, and its cell is 1/32 of
 * the room, which is far finer than the width of any arm a room actually has.
 *
 * Twenty halvings take the window from 1/32 of the room to about 1e-7 of it,
 * which for a 6 m room is well under a micrometre — the answer is exact for
 * every purpose the camera has.
 */
export function poleOfInaccessibility(outline: Outline): PlanPoint {
  const xs = outline.map(([x]) => x)
  const zs = outline.map(([, z]) => z)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)
  const w = maxX - minX
  const d = maxZ - minZ

  let best: PlanPoint = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 }
  let bestClearance = edgeClearance(best.x, best.z, outline)

  for (let i = 0; i <= COARSE_STEPS; i++) {
    const x = minX + (w * i) / COARSE_STEPS
    for (let j = 0; j <= COARSE_STEPS; j++) {
      const z = minZ + (d * j) / COARSE_STEPS
      const c = edgeClearance(x, z, outline)
      if (c > bestClearance) { bestClearance = c; best = { x, z } }
    }
  }

  // Shrinking window around the best sample so far. The window starts at one
  // coarse cell on each side, which is exactly the distance the true optimum
  // can be from the best sample.
  let hx = w / COARSE_STEPS
  let hz = d / COARSE_STEPS
  for (let round = 0; round < REFINE_ROUNDS; round++) {
    const cx = best.x
    const cz = best.z
    for (let i = 0; i <= REFINE_STEPS; i++) {
      const x = cx - hx + (2 * hx * i) / REFINE_STEPS
      for (let j = 0; j <= REFINE_STEPS; j++) {
        const z = cz - hz + (2 * hz * j) / REFINE_STEPS
        const c = edgeClearance(x, z, outline)
        if (c > bestClearance) { bestClearance = c; best = { x, z } }
      }
    }
    hx /= 2
    hz /= 2
  }

  return best
}

/**
 * The middle of the room, plan mm: the deepest interior point, moved to the
 * area centroid when the centroid is just as deep.
 *
 * `RoomBounds.outline` is null for a legacy A-B-C-D rectangle, which has no
 * polygon to search; (W/2, D/2) is both its geometric centre and the world
 * origin, so that case returns precisely the point the camera has always
 * used. (A rectangle that DOES carry vertices goes down the polygon path and
 * lands on the same point, because a rectangle's area centroid is its vertex
 * mean, which `planPolygon` maps to (W/2, D/2) by construction. The test file
 * checks both routes agree.)
 */
export function roomCentrePlan(room: RoomBounds): PlanPoint {
  const centre = { x: room.W / 2, z: room.D / 2 }
  const outline = room.outline
  if (!outline || outline.length < 3) return centre

  const pole = poleOfInaccessibility(outline)
  const poleClearance = edgeClearance(pole.x, pole.z, outline)
  // A room whose outline the search could not get inside at all — a scan that
  // came back as a sliver, or three collinear vertices. Nothing here is
  // trustworthy, so hand back the frame's own centre rather than a point
  // picked out of a degenerate polygon.
  if (poleClearance <= 0) return centre

  const centroid = polygonAreaCentroid(outline)
  const centroidClearance = edgeClearance(centroid.x, centroid.z, outline)
  // The lexicographic tie-break. `> 0` as well as the tolerance because a
  // room smaller than the tolerance would otherwise let a point outside the
  // walls win on a rounding error.
  if (centroidClearance > 0 && centroidClearance >= poleClearance - DEPTH_TIE_MM) return centroid

  return pole
}

/**
 * The middle of the room in world metres — the x and z the 360 camera stands
 * at. Its height is not this file's business: the user set eye height at
 * 1650 mm deliberately and only the horizontal position was ever wrong.
 *
 * @param fallback passed straight to `roomExtents` for a geometry with no
 *        usable walls — `{ W: room.length, D: room.width }`, as everywhere else.
 */
export function roomCentreWorld(
  geometry: RoomGeometry,
  fallback?: { W: number; D: number },
): { x: number; z: number } {
  const room = roomBoundsFromGeometry(geometry, fallback)
  return planToWorld(roomCentrePlan(room), room)
}
