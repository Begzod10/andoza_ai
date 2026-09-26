/**
 * Keeping a placed model inside the room's walls.
 *
 * Both editors move furniture — the 2D plan by dragging its symbol, the 3D
 * viewport by dragging the model itself — and both have to stop it at the
 * same walls. They did not: the plan tested the real outline, while the 3D
 * drag clamped to the room's bounding RECTANGLE, which is the room only when
 * the room happens to be one. In a drawn or scanned room a model could be
 * pushed into the notch of an L and straight through two walls.
 *
 * The maths lives here, in the plan's own frame (millimetres, origin at the
 * room's top-left corner — what `planPolygon` produces), so the two editors
 * share one answer instead of each having their own.
 */
import { offsetPolygon, planPolygon, pointInPolygon } from '@/lib/planPolygon'
import { roomExtents } from '@/lib/roomDims'
import type { RoomGeometry } from '@/store/roomStore'

/** Clearance kept between a model and the wall it is pushed against, mm. */
export const FUR_WALL_GAP = 50

export interface PlanPoint { x: number; z: number }

/**
 * A model's extents around its own origin, mm, already rotated. Asymmetric
 * because a real model's origin is wherever it was authored, not its centre.
 */
export interface FootprintBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface RoomBounds {
  /** Bounding size of the room, mm. Used for a plain rectangular room. */
  W: number
  D: number
  /**
   * The room outline pulled in by the wall gap. A footprint's four corners
   * must all fall inside it. Null for a legacy rectangle, which needs no
   * polygon test.
   */
  inner: [number, number][] | null
  /** The outline itself — only used to free an item already stuck in a wall. */
  outline: [number, number][] | null
}

/**
 * The 3D viewport works in world metres about the room's centre; the clamp and
 * the outline work in the plan's millimetres from the room's corner. These are
 * the bridge, and they must agree with how the 2D plan derives its own plan
 * coordinates (`item.x + W / 2`) or the two editors would fence off different
 * strips of floor.
 */
export function worldToPlan(p: { x: number; z: number }, room: { W: number; D: number }): PlanPoint {
  return { x: p.x * 1000 + room.W / 2, z: p.z * 1000 + room.D / 2 }
}

export function planToWorld(p: PlanPoint, room: { W: number; D: number }): { x: number; z: number } {
  return { x: (p.x - room.W / 2) / 1000, z: (p.z - room.D / 2) / 1000 }
}

/** Symmetric half-extents → the bounds shape, for callers measuring a box. */
export function halfExtentsToBounds(hw: number, hd: number): FootprintBounds {
  return { minX: -hw, maxX: hw, minZ: -hd, maxZ: hd }
}

/**
 * Rotate half-extents into the world axes. A model authored long along Z and
 * turned 90° occupies X instead, and testing it unrotated locks its free axis
 * against the walls.
 */
export function rotatedHalfExtents(hw: number, hd: number, rotation: number): { hw: number; hd: number } {
  const c = Math.abs(Math.cos(rotation))
  const s = Math.abs(Math.sin(rotation))
  return { hw: hw * c + hd * s, hd: hw * s + hd * c }
}

/** Does the whole footprint sit inside the outline at this spot? */
function footprintFits(p: PlanPoint, b: FootprintBounds, outline: [number, number][]): boolean {
  return (
    pointInPolygon(p.x + b.minX, p.z + b.minZ, outline) &&
    pointInPolygon(p.x + b.maxX, p.z + b.minZ, outline) &&
    pointInPolygon(p.x + b.maxX, p.z + b.maxZ, outline) &&
    pointInPolygon(p.x + b.minX, p.z + b.maxZ, outline)
  )
}

/**
 * Where a model may actually go, given where the drag wants to put it.
 *
 * `want` and `current` are the model's origin in plan millimetres; `b` is its
 * footprint around that origin. Returns the nearest spot the whole footprint
 * fits — which may be exactly `current` when nothing does.
 */
export function clampFootprintToRoom(
  want: PlanPoint,
  current: PlanPoint,
  b: FootprintBounds,
  room: RoomBounds,
  gap = FUR_WALL_GAP,
): PlanPoint {
  if (room.inner) {
    if (footprintFits(want, b, room.inner)) return want
    // The wanted spot doesn't fit. Try each axis on its own so the model
    // slides ALONG the wall it ran into rather than sticking dead to it.
    if (footprintFits({ x: want.x, z: current.z }, b, room.inner)) return { x: want.x, z: current.z }
    if (footprintFits({ x: current.x, z: want.z }, b, room.inner)) return { x: current.x, z: want.z }
    // Already overlapping a wall — dropped there before this rule existed, or
    // scaled or turned into it. Let it move as long as its origin stays on
    // the floor, so it can be dragged back out instead of being stuck for good.
    if (
      room.outline &&
      !footprintFits(current, b, room.inner) &&
      pointInPolygon(want.x, want.z, room.outline)
    ) return want
    return current
  }

  // Legacy rectangle. The outer Math.max keeps the range valid for a model
  // wider than the room: it then sits against one wall rather than the clamp
  // inverting and throwing it to the far side.
  return {
    x: Math.min(Math.max(want.x, gap - b.minX), Math.max(gap - b.minX, room.W - gap - b.maxX)),
    z: Math.min(Math.max(want.z, gap - b.minZ), Math.max(gap - b.minZ, room.D - gap - b.maxZ)),
  }
}


/**
 * The walls a room actually has, ready to clamp against. A drawn or scanned
 * room gets its real outline; a legacy A-B-C-D rectangle has none and falls
 * back to the plain per-axis clamp.
 *
 * The extents come from the same `roomExtents` call `planPolygon` makes, so
 * the frame this describes is the frame the outline is expressed in.
 */
export function roomBoundsFromGeometry(geometry: RoomGeometry, fallback?: { W: number; D: number }): RoomBounds {
  const poly = planPolygon(geometry)
  const ext = poly ? roomExtents(geometry) : roomExtents(geometry, fallback)
  return {
    W: ext.W * 1000,
    D: ext.D * 1000,
    inner: poly ? offsetPolygon(poly, -FUR_WALL_GAP) : null,
    outline: poly ? poly.vertices : null,
  }
}

/**
 * Somewhere in the room a new model can actually stand.
 *
 * The middle of the bounding box is the obvious answer and the wrong one: for
 * an L-shaped room that point can be in the cut-away corner, outside the room
 * entirely, so a model dropped there starts life inside a wall. Search instead
 * for the spot nearest the middle where the whole footprint fits.
 */
export function interiorAnchor(room: RoomBounds, b: FootprintBounds): PlanPoint {
  const centre = { x: room.W / 2, z: room.D / 2 }
  if (!room.inner) return centre
  if (footprintFits(centre, b, room.inner)) return centre

  const STEPS = 40
  const stepX = room.W / STEPS
  const stepZ = room.D / STEPS
  let best: PlanPoint | null = null
  let bestDist = Infinity
  for (let i = 0; i <= STEPS; i++) {
    for (let j = 0; j <= STEPS; j++) {
      const p = { x: i * stepX, z: j * stepZ }
      if (!footprintFits(p, b, room.inner)) continue
      const dist = (p.x - centre.x) ** 2 + (p.z - centre.z) ** 2
      if (dist < bestDist) { bestDist = dist; best = p }
    }
  }
  // Nothing fits — a model bigger than the room. Leave it at the middle so it
  // is at least visible and can be scaled down, rather than flung somewhere.
  return best ?? centre
}

/**
 * Where the *n*th model of its kind should land, in plan millimetres.
 *
 * Staggered off the ones before it so a run of the same item doesn't stack
 * into a single invisible pile, then clamped, so the stagger can't walk the
 * model into a wall in a small or awkwardly shaped room.
 */
export function placementSpot(room: RoomBounds, b: FootprintBounds, existingCount: number): PlanPoint {
  const anchor = interiorAnchor(room, b)
  const stagger = (existingCount * 300) % 1000
  return clampFootprintToRoom({ x: anchor.x + stagger, z: anchor.z + stagger }, anchor, b, room)
}
