/**
 * Moving a model until it touches something — and not one millimetre further.
 *
 * What was here before answered a yes/no question: does the model fit where
 * the finger is? If it did not, the drag simply stopped updating, so the model
 * froze wherever it last happened to be legal. With the pointer moving several
 * centimetres per frame, "wherever it last happened to be legal" is anywhere
 * up to a frame's travel short of the wall — which is exactly the gap the user
 * sees, on top of the 50 mm clearance the clamp used to insist on and the
 * 50 mm grid the drag used to snap to.
 *
 * So this module answers a different question: how far along the way to the
 * finger CAN the model go? It binary-searches the segment for the last point
 * that fits, which puts the model against the wall rather than near it, and it
 * does so per axis so a model dragged into a corner slides along the wall
 * instead of sticking to it.
 *
 * It also works in the model's own frame rather than its bounding box. A table
 * turned 45 degrees has a bounding box half again as wide as the table, and
 * clamping that box leaves the table visibly short of the wall at exactly the
 * angles where the user can see the gap best. The separating-axis test below
 * is the same arithmetic, done on four axes instead of two.
 *
 * Plan frame throughout: millimetres from the room's top-left corner, the
 * frame `planPolygon` and `furnitureBounds` already use. Yaw follows THREE's
 * rotation about +Y — (x, z) → (x·cos + z·sin, −x·sin + z·cos) — the same one
 * `hullBounds` uses, so a footprint measured there lands here unchanged.
 */
import { pointInPolygon } from '@/lib/planPolygon'
import type { FootprintBounds, PlanPoint, RoomBounds } from '@/lib/furnitureBounds'

/** A footprint plus the angle it is turned to. The extents are in the MODEL's
 *  own axes, around its origin, and asymmetric on purpose: a model's origin is
 *  wherever it was authored, not its centre. */
export interface OrientedFootprint extends FootprintBounds {
  rotation: number
}

/** Something already standing in the room, in the way. */
export interface Obstacle {
  at: PlanPoint
  box: OrientedFootprint
}

type Corner = [number, number]

/** Floating-point slack, mm. Small enough to be invisible, big enough that a
 *  model resting exactly against a wall is not judged to be through it. */
const EPS = 1e-6

/** The four corners of a footprint standing at `at`. */
export function footprintCorners(box: OrientedFootprint, at: PlanPoint): Corner[] {
  const c = Math.cos(box.rotation)
  const s = Math.sin(box.rotation)
  const local: Corner[] = [
    [box.minX, box.minZ],
    [box.maxX, box.minZ],
    [box.maxX, box.maxZ],
    [box.minX, box.maxZ],
  ]
  return local.map(([x, z]) => [at.x + x * c + z * s, at.z - x * s + z * c] as Corner)
}

/** The two axes a rectangle at this angle can be separated along. For a
 *  rectangle the edge directions and the edge normals are the same pair. */
function axesOf(rotation: number): Corner[] {
  const c = Math.cos(rotation)
  const s = Math.sin(rotation)
  return [[c, -s], [s, c]]
}

function project(corners: Corner[], ax: number, az: number): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  for (const [x, z] of corners) {
    const d = x * ax + z * az
    if (d < min) min = d
    if (d > max) max = d
  }
  return { min, max }
}

/**
 * Do two footprints overlap by more than `gap`?
 *
 * The separating-axis test: two convex shapes miss each other exactly when
 * some axis sees their shadows apart. Four axes suffice for two rectangles.
 *
 * Touching is NOT overlapping — at `gap` 0 a model may come to rest with its
 * edge flush against another's, which is the whole point.
 */
export function footprintsOverlap(
  a: OrientedFootprint, aAt: PlanPoint,
  b: OrientedFootprint, bAt: PlanPoint,
  gap = 0,
): boolean {
  const ca = footprintCorners(a, aAt)
  const cb = footprintCorners(b, bAt)
  for (const [ax, az] of [...axesOf(a.rotation), ...axesOf(b.rotation)]) {
    const pa = project(ca, ax, az)
    const pb = project(cb, ax, az)
    if (pa.max + gap <= pb.min + EPS || pb.max + gap <= pa.min + EPS) return false
  }
  return true
}

/** Strictly crossing segments — sharing an endpoint or lying along each other
 *  does not count, so a model resting ON a wall line is not through it. */
function segmentsCross(a: Corner, b: Corner, c: Corner, d: Corner): boolean {
  const side = (p: Corner, q: Corner, r: Corner) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const d1 = side(a, b, c)
  const d2 = side(a, b, d)
  const d3 = side(c, d, a)
  const d4 = side(c, d, b)
  return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) &&
         ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))
}

/** Does the whole footprint sit inside the outline at this spot? */
export function footprintInside(
  box: OrientedFootprint, at: PlanPoint, outline: [number, number][],
): boolean {
  const corners = footprintCorners(box, at)
  for (const [x, z] of corners) if (!pointInPolygon(x, z, outline)) return false
  // Every corner inside is not the same as the whole rectangle inside: the
  // inner corner of an L-shaped room can poke into the middle of a rectangle
  // whose own four corners are all in open floor. An edge crossing catches it.
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i]
    const b = corners[(i + 1) % corners.length]
    for (let j = 0; j < outline.length; j++) {
      const p = outline[j] as Corner
      const q = outline[(j + 1) % outline.length] as Corner
      if (segmentsCross(a, b, p, q)) return false
    }
  }
  return true
}

/** May the model stand here — clear of the walls and of everything else? */
export function footprintFree(
  at: PlanPoint,
  box: OrientedFootprint,
  room: RoomBounds,
  others: readonly Obstacle[] = [],
  gap = 0,
): boolean {
  if (room.inner) {
    if (!footprintInside(box, at, room.inner)) return false
  } else {
    // Legacy A-B-C-D room: the rectangle IS the outline.
    for (const [x, z] of footprintCorners(box, at)) {
      if (x < gap - EPS || x > room.W - gap + EPS) return false
      if (z < gap - EPS || z > room.D - gap + EPS) return false
    }
  }
  for (const o of others) {
    if (footprintsOverlap(box, at, o.box, o.at, gap)) return false
  }
  return true
}

/**
 * The furthest point along `from` → `to` the model may stand at.
 *
 * Eighteen halvings put the answer within a thousandth of the travel, which
 * over any drag anyone makes is far finer than a millimetre — so the model
 * stops ON the wall rather than near it. `from` is assumed to fit; the caller
 * checks that, because when it does not the right answer is a different one
 * entirely (see `resolveFurnitureMove`).
 */
const SLIDE_STEPS = 18

export function slideTo(
  from: PlanPoint, to: PlanPoint, fits: (p: PlanPoint) => boolean,
): PlanPoint {
  if (fits(to)) return to
  const at = (t: number) => ({ x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t })
  let lo = 0
  let hi = 1
  for (let i = 0; i < SLIDE_STEPS; i++) {
    const mid = (lo + hi) / 2
    if (fits(at(mid))) lo = mid
    else hi = mid
  }
  return at(lo)
}

/**
 * Where a dragged model actually ends up.
 *
 * Straight there if it fits. Otherwise as far as it can go: along X, then
 * along Z from there, then along X once more — because freeing up Z often
 * frees up X too, and a model dragged diagonally into a wall should run along
 * it to the end rather than stop at the first contact.
 */
export function resolveFurnitureMove(
  from: PlanPoint,
  want: PlanPoint,
  box: OrientedFootprint,
  room: RoomBounds,
  others: readonly Obstacle[] = [],
  gap = 0,
): PlanPoint {
  const fits = (p: PlanPoint) => footprintFree(p, box, room, others, gap)
  if (fits(want)) return want
  if (!fits(from)) {
    // Standing in a wall or inside another model already — dropped there
    // before this rule existed, or scaled or turned into it. Let it move
    // freely as long as its origin stays on the floor, so it can be dragged
    // back out instead of being stuck there for good.
    return room.outline && pointInPolygon(want.x, want.z, room.outline) ? want : from
  }
  let p = slideTo(from, { x: want.x, z: from.z }, fits)
  p = slideTo(p, { x: p.x, z: want.z }, fits)
  p = slideTo(p, { x: want.x, z: p.z }, fits)
  return p
}

/**
 * How far a model may be shifted to make room for a turn, searched outward in
 * rings. The limit is the model's OWN reach — the distance from its origin to
 * its furthest corner — because that is the scale at which a turn can need
 * room: a wardrobe swinging side-on has to come off the wall by about its own
 * depth, and nothing bigger than that is giving way, it is running off.
 */
const NUDGE_RINGS = 8
const NUDGE_DIRECTIONS = 12

/**
 * Turning a model without putting it through a wall or another model.
 *
 * Turning in place is the answer whenever it fits. When it does not, a small
 * shift usually makes it fit — a table turned side-on against a wall has to
 * come off the wall a little to turn at all, and a user who could not do that
 * would find the model simply refusing to rotate near anything. Beyond the
 * last ring it does refuse: returns null, and the caller keeps the angle it
 * had, which is better than a model that teleports.
 */
export function resolveFurnitureRotation(
  at: PlanPoint,
  box: OrientedFootprint,
  rotation: number,
  room: RoomBounds,
  others: readonly Obstacle[] = [],
  gap = 0,
): { at: PlanPoint; rotation: number } | null {
  const turned: OrientedFootprint = { ...box, rotation }
  if (footprintFree(at, turned, room, others, gap)) return { at, rotation }
  const reach = Math.hypot(
    Math.max(Math.abs(box.minX), Math.abs(box.maxX)),
    Math.max(Math.abs(box.minZ), Math.abs(box.maxZ)),
  )
  for (let ring = 1; ring <= NUDGE_RINGS; ring++) {
    const r = (reach * ring) / NUDGE_RINGS
    for (let i = 0; i < NUDGE_DIRECTIONS; i++) {
      const a = (i * 2 * Math.PI) / NUDGE_DIRECTIONS
      const p = { x: at.x + Math.cos(a) * r, z: at.z + Math.sin(a) * r }
      if (footprintFree(p, turned, room, others, gap)) return { at: p, rotation }
    }
  }
  return null
}
