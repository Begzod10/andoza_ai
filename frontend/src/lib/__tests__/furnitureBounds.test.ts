/**
 * A model must not end up inside a wall, in either editor. These run the clamp
 * against a real L-shaped outline — the shape that exposed the bug, since its
 * bounding box contains a notch that is not part of the room at all — as well
 * as against a plain rectangle.
 */
import { describe, it, expect } from 'vitest'
import {
  clampFootprintToRoom, halfExtentsToBounds, rotatedHalfExtents, FUR_WALL_GAP,
  worldToPlan, planToWorld, type RoomBounds,
} from '../furnitureBounds'
import { pointInPolygon } from '../planPolygon'

/**
 * 5 m x 4 m overall, with the top-right 2.5 x 2 m cut away — so (3750, 3000)
 * sits inside the BOUNDING BOX but outside the room.
 *
 *   0                     5000
 *   +----------------------+  0
 *   |                      |
 *   |          +-----------+  2000
 *   |          |   notch
 *   +----------+             4000
 *             2500
 */
const L_OUTLINE: [number, number][] = [
  [0, 0], [5000, 0], [5000, 2000], [2500, 2000], [2500, 4000], [0, 4000],
]
/** The same shape pulled in by the wall gap, as offsetPolygon would give. */
const L_INNER: [number, number][] = [
  [FUR_WALL_GAP, FUR_WALL_GAP],
  [5000 - FUR_WALL_GAP, FUR_WALL_GAP],
  [5000 - FUR_WALL_GAP, 2000 - FUR_WALL_GAP],
  [2500 - FUR_WALL_GAP, 2000 - FUR_WALL_GAP],
  [2500 - FUR_WALL_GAP, 4000 - FUR_WALL_GAP],
  [FUR_WALL_GAP, 4000 - FUR_WALL_GAP],
]

const L_ROOM: RoomBounds = { W: 5000, D: 4000, inner: L_INNER, outline: L_OUTLINE }
const RECT_ROOM: RoomBounds = { W: 4000, D: 3000, inner: null, outline: null }

/** A 600 x 600 mm model centred on its origin. */
const SMALL = halfExtentsToBounds(300, 300)

/** Every corner of the footprint within the room's walls. */
function inside(p: { x: number; z: number }, b: typeof SMALL): boolean {
  return [
    [p.x + b.minX, p.z + b.minZ], [p.x + b.maxX, p.z + b.minZ],
    [p.x + b.maxX, p.z + b.maxZ], [p.x + b.minX, p.z + b.maxZ],
  ].every(([x, z]) => pointInPolygon(x, z, L_INNER))
}

describe('clampFootprintToRoom, drawn room', () => {
  it('refuses the notch — inside the bounding box, outside the room', () => {
    // (3750, 3000) is in the cut-away corner: within the 5000 x 4000 bounding
    // box the old clamp used, but not in the room. From the upper-left leg
    // neither the full move nor the x-only move is legal, so it may only
    // travel in z.
    const inRoom = { x: 1000, z: 2600 }
    const intoNotch = { x: 3750, z: 3000 }
    const got = clampFootprintToRoom(intoNotch, inRoom, SMALL, L_ROOM)
    expect(got).not.toEqual(intoNotch)
    expect(inside(got, SMALL)).toBe(true)
  })

  it('never lands the footprint outside the room, wherever it is dragged', () => {
    // Sweep the whole bounding box — including everything in the notch — from
    // a few starting points. The clamp's one job is that nothing gets through.
    const starts = [{ x: 1000, z: 1000 }, { x: 1000, z: 3000 }, { x: 4000, z: 1000 }]
    for (const current of starts) {
      for (let x = 0; x <= 5000; x += 250) {
        for (let z = 0; z <= 4000; z += 250) {
          const got = clampFootprintToRoom({ x, z }, current, SMALL, L_ROOM)
          expect(inside(got, SMALL)).toBe(true)
        }
      }
    }
  })

  it('allows a spot that is genuinely inside', () => {
    const want = { x: 1200, z: 2600 }
    expect(clampFootprintToRoom(want, { x: 1000, z: 1000 }, SMALL, L_ROOM)).toEqual(want)
  })

  it('slides along the wall it ran into instead of sticking to it', () => {
    // Sitting in the lower-left leg, dragged right (into the notch) and down.
    // The x move is blocked, the z move is not, so it should travel in z.
    const current = { x: 1500, z: 2600 }
    const want = { x: 4000, z: 3200 }
    const got = clampFootprintToRoom(want, current, SMALL, L_ROOM)
    expect(got.x).toBe(current.x)
    expect(got.z).toBe(want.z)
  })

  it('keeps the whole footprint in, not just its origin', () => {
    // Origin inside the room but close enough to the notch that the model's
    // right edge would cross the wall.
    const origin = { x: 2400, z: 2600 }
    const big = halfExtentsToBounds(400, 200)
    const got = clampFootprintToRoom(origin, { x: 1000, z: 2600 }, big, L_ROOM)
    expect(got).not.toEqual(origin)
  })

  it('lets a model already stuck in a wall be dragged back out', () => {
    // Left there by an older build, or turned into the wall. It must still be
    // movable, or it is stranded for good.
    const stuck = { x: 2450, z: 2100 }
    const big = halfExtentsToBounds(400, 400)
    const towardOpenFloor = { x: 1200, z: 2600 }
    const got = clampFootprintToRoom(towardOpenFloor, stuck, big, L_ROOM)
    expect(got).toEqual(towardOpenFloor)
  })

  it('will not let a stuck model be dragged clean outside the room', () => {
    const stuck = { x: 2450, z: 2100 }
    const big = halfExtentsToBounds(400, 400)
    const outside = { x: 4500, z: 3500 }
    expect(clampFootprintToRoom(outside, stuck, big, L_ROOM)).toEqual(stuck)
  })
})

describe('clampFootprintToRoom, rectangular room', () => {
  it('leaves a spot well inside alone', () => {
    const want = { x: 2000, z: 1500 }
    expect(clampFootprintToRoom(want, { x: 1000, z: 1000 }, SMALL, RECT_ROOM)).toEqual(want)
  })

  it('stops the footprint at the wall, gap included', () => {
    const got = clampFootprintToRoom({ x: -5000, z: -5000 }, { x: 1000, z: 1000 }, SMALL, RECT_ROOM)
    // Left edge of the model lands exactly one gap off the wall.
    expect(got.x + SMALL.minX).toBeCloseTo(FUR_WALL_GAP, 6)
    expect(got.z + SMALL.minZ).toBeCloseTo(FUR_WALL_GAP, 6)
  })

  it('stops it at the far walls too', () => {
    const got = clampFootprintToRoom({ x: 99999, z: 99999 }, { x: 1000, z: 1000 }, SMALL, RECT_ROOM)
    expect(got.x + SMALL.maxX).toBeCloseTo(RECT_ROOM.W - FUR_WALL_GAP, 6)
    expect(got.z + SMALL.maxZ).toBeCloseTo(RECT_ROOM.D - FUR_WALL_GAP, 6)
  })

  it('parks a model wider than the room against one wall rather than flipping it across', () => {
    const huge = halfExtentsToBounds(5000, 100)
    const got = clampFootprintToRoom({ x: 2000, z: 1500 }, { x: 2000, z: 1500 }, huge, RECT_ROOM)
    expect(Number.isFinite(got.x)).toBe(true)
    expect(got.x + huge.minX).toBeCloseTo(FUR_WALL_GAP, 6)
  })

  it('keeps the gap it is given, literally', () => {
    // Asserted against a number, not against FUR_WALL_GAP: comparing the
    // result to the same constant the clamp used would pass even if the gap
    // were dropped entirely.
    const got = clampFootprintToRoom({ x: -5000, z: -5000 }, { x: 1000, z: 1000 }, SMALL, RECT_ROOM, 120)
    expect(got.x + SMALL.minX).toBeCloseTo(120, 6)
    expect(got.z + SMALL.minZ).toBeCloseTo(120, 6)
    const far = clampFootprintToRoom({ x: 99999, z: 99999 }, { x: 1000, z: 1000 }, SMALL, RECT_ROOM, 120)
    expect(far.x + SMALL.maxX).toBeCloseTo(RECT_ROOM.W - 120, 6)
  })

  it('leaves a real gap between the model and the wall by default', () => {
    const got = clampFootprintToRoom({ x: -5000, z: -5000 }, { x: 1000, z: 1000 }, SMALL, RECT_ROOM)
    expect(got.x + SMALL.minX).toBeGreaterThan(0)
    expect(got.z + SMALL.minZ).toBeGreaterThan(0)
  })

  it('handles an origin that is not the model centre', () => {
    // Authored with its origin at the back-left corner.
    const offset = { minX: 0, maxX: 800, minZ: 0, maxZ: 400 }
    const got = clampFootprintToRoom({ x: -100, z: -100 }, { x: 1000, z: 1000 }, offset, RECT_ROOM)
    expect(got.x).toBeCloseTo(FUR_WALL_GAP, 6)
    expect(got.z).toBeCloseTo(FUR_WALL_GAP, 6)
  })
})

describe('rotatedHalfExtents', () => {
  it('leaves an unrotated box alone', () => {
    expect(rotatedHalfExtents(400, 200, 0)).toEqual({ hw: 400, hd: 200 })
  })

  it('swaps the axes at a quarter turn', () => {
    const r = rotatedHalfExtents(400, 200, Math.PI / 2)
    expect(r.hw).toBeCloseTo(200, 6)
    expect(r.hd).toBeCloseTo(400, 6)
  })

  it('grows the footprint on the diagonal, never shrinks it', () => {
    for (const deg of [15, 30, 45, 60, 75]) {
      const r = rotatedHalfExtents(400, 200, (deg * Math.PI) / 180)
      expect(r.hw).toBeGreaterThanOrEqual(200 - 1e-9)
      expect(r.hd).toBeGreaterThanOrEqual(200 - 1e-9)
      expect(Math.max(r.hw, r.hd)).toBeLessThanOrEqual(600 + 1e-9)
    }
  })

  it('stops a long model turned sideways from being pushed through a wall', () => {
    // 2 m long, 0.4 m deep, turned 90° so it now spans 2 m across the room.
    const { hw, hd } = rotatedHalfExtents(1000, 200, Math.PI / 2)
    const bounds = halfExtentsToBounds(hw, hd)
    const got = clampFootprintToRoom({ x: 2000, z: 99999 }, { x: 2000, z: 1500 }, bounds, RECT_ROOM)
    expect(got.z + bounds.maxZ).toBeLessThanOrEqual(RECT_ROOM.D - FUR_WALL_GAP + 1e-6)
  })
})

describe('world <-> plan frames', () => {
  const room = { W: 5000, D: 4000 }

  it('puts the room centre at the middle of the plan', () => {
    expect(worldToPlan({ x: 0, z: 0 }, room)).toEqual({ x: 2500, z: 2000 })
  })

  it('agrees with how the 2D plan derives its own coordinates', () => {
    // MebelPlanView computes planX = item.x + W / 2 from store millimetres,
    // and the store's millimetres are world metres x 1000. If these two ever
    // disagree, the editors clamp against different strips of floor.
    const storeMm = { x: -1200, y: -800 }
    const fromPlanView = { x: storeMm.x + room.W / 2, z: storeMm.y + room.D / 2 }
    expect(worldToPlan({ x: storeMm.x / 1000, z: storeMm.y / 1000 }, room)).toEqual(fromPlanView)
  })

  it('round-trips', () => {
    for (const p of [{ x: 0, z: 0 }, { x: -1.2, z: 0.8 }, { x: 2.49, z: -1.99 }]) {
      const back = planToWorld(worldToPlan(p, room), room)
      expect(back.x).toBeCloseTo(p.x, 9)
      expect(back.z).toBeCloseTo(p.z, 9)
    }
  })

  it('keeps a 3D drag out of the notch, in the 3D view own units', () => {
    // The couch sits in the lower-left leg; the drag wants the cut-away corner.
    const here = { x: -1.2, z: -0.8 }
    const intoNotch = { x: 1.25, z: 1.0 }
    const bounds = halfExtentsToBounds(1050, 450)
    const fitted = clampFootprintToRoom(
      worldToPlan(intoNotch, L_ROOM), worldToPlan(here, L_ROOM), bounds, L_ROOM,
    )
    const got = planToWorld(fitted, L_ROOM)
    const plan = worldToPlan(got, L_ROOM)
    expect(plan.x > 2500 && plan.z > 2000).toBe(false)
  })
})
