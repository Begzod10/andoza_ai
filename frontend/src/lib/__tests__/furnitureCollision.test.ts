/**
 * Sliding a model to contact.
 *
 * The three things the user actually sees are asserted here as distances:
 * the model ENDS ON the wall rather than near it, a diagonal drag into a wall
 * keeps travelling along it, and a model turned to any angle still reaches the
 * wall — which an axis-aligned bounding box cannot do, since at 45 degrees it
 * is half again as wide as the model inside it.
 */
import { describe, it, expect } from 'vitest'
import {
  footprintsOverlap, footprintInside, footprintFree, slideTo,
  resolveFurnitureMove, resolveFurnitureRotation,
  type OrientedFootprint, type Obstacle,
} from '../furnitureCollision'
import { halfExtentsToBounds, type RoomBounds } from '../furnitureBounds'

/** 5 x 4 m, as a plain rectangle (no outline) and as its own polygon. */
const RECT: RoomBounds = { W: 5000, D: 4000, inner: null, outline: null }
const RECT_POLY: [number, number][] = [[0, 0], [5000, 0], [5000, 4000], [0, 4000]]
const POLY_ROOM: RoomBounds = { W: 5000, D: 4000, inner: RECT_POLY, outline: RECT_POLY }

/** An L: the 2.5 x 2 m bottom-right quarter is cut away. */
const L: [number, number][] = [[0, 0], [5000, 0], [5000, 2000], [2500, 2000], [2500, 4000], [0, 4000]]
const L_ROOM: RoomBounds = { W: 5000, D: 4000, inner: L, outline: L }

function box(hw: number, hd: number, rotation = 0): OrientedFootprint {
  return { ...halfExtentsToBounds(hw, hd), rotation }
}

const TABLE = box(600, 300)   // 1.2 x 0.6 m
const DEG = Math.PI / 180

describe('footprintsOverlap', () => {
  const a = box(500, 500)

  it('separates two boxes that merely touch', () => {
    // Edge to edge at x = 1000: not overlapping, which is what lets a model
    // come to rest against another instead of stopping short of it.
    expect(footprintsOverlap(a, { x: 500, z: 500 }, a, { x: 1500, z: 500 })).toBe(false)
  })

  it('catches them a millimetre further in', () => {
    expect(footprintsOverlap(a, { x: 500, z: 500 }, a, { x: 1499, z: 500 })).toBe(true)
  })

  it('keeps a demanded gap', () => {
    // Touching is too close when 30 mm is demanded; 30 mm apart is not.
    expect(footprintsOverlap(a, { x: 500, z: 500 }, a, { x: 1530, z: 500 }, 30)).toBe(false)
    expect(footprintsOverlap(a, { x: 500, z: 500 }, a, { x: 1520, z: 500 }, 30)).toBe(true)
    expect(footprintsOverlap(a, { x: 500, z: 500 }, a, { x: 1500, z: 500 }, 30)).toBe(true)
  })

  it('sees the gap a bounding box would miss', () => {
    // Two 2.4 x 0.2 m bars, both turned 45°, offset 700 mm along X. Parallel,
    // so the offset is 495 mm along their thin axis — they are nowhere near
    // each other. Their bounding boxes are 919 mm across and overlap heavily,
    // so a box test would fence off floor that is in fact free.
    const bar = box(1200, 100, 45 * DEG)
    expect(footprintsOverlap(bar, { x: 0, z: 0 }, bar, { x: 700, z: 0 })).toBe(false)
    const asBoxes = box(919, 919)
    expect(footprintsOverlap(asBoxes, { x: 0, z: 0 }, asBoxes, { x: 700, z: 0 })).toBe(true)
  })
})

describe('footprintInside', () => {
  it('allows a model resting exactly on the wall line', () => {
    expect(footprintInside(TABLE, { x: 600, z: 300 }, RECT_POLY)).toBe(true)
  })

  it('refuses one a millimetre through it', () => {
    expect(footprintInside(TABLE, { x: 599, z: 300 }, RECT_POLY)).toBe(false)
  })

  it("catches a room's own corner poking into the middle of a model", () => {
    // Centred on the L's inner corner: all four of the model's corners are on
    // open floor, and the notch is inside it. Corner-in-polygon alone says
    // yes; the edge crossings say no, correctly.
    expect(footprintInside(box(1200, 1200), { x: 2500, z: 2000 }, L)).toBe(false)
  })
})

describe('resolveFurnitureMove, against a wall', () => {
  it('goes straight there when the way is clear', () => {
    const want = { x: 2000, z: 1500 }
    expect(resolveFurnitureMove({ x: 1000, z: 1000 }, want, TABLE, POLY_ROOM)).toEqual(want)
  })

  it('stops ON the wall, not short of it', () => {
    // Dragged a metre past the left wall. Its left edge should end on x = 0.
    const got = resolveFurnitureMove({ x: 2000, z: 1500 }, { x: -1000, z: 1500 }, TABLE, POLY_ROOM)
    expect(got.x + TABLE.minX).toBeCloseTo(0, 1)
    expect(got.z).toBeCloseTo(1500, 6)
  })

  it('stops on the wall of a plain rectangular room too', () => {
    const got = resolveFurnitureMove({ x: 2000, z: 1500 }, { x: 9999, z: 1500 }, TABLE, RECT)
    expect(got.x + TABLE.maxX).toBeCloseTo(RECT.W, 1)
  })

  it('slides along the wall it ran into', () => {
    // Pushed into the left wall AND along it: the X it cannot have must not
    // cost it the Z it can.
    const got = resolveFurnitureMove({ x: 2000, z: 1500 }, { x: -1000, z: 3000 }, TABLE, POLY_ROOM)
    expect(got.x + TABLE.minX).toBeCloseTo(0, 1)
    expect(got.z).toBeCloseTo(3000, 6)
  })

  it('reaches the wall at any angle', () => {
    // The point of the oriented test: at 45° a bounding box is 1.27 m wide
    // where the table is 0.6, so a box clamp would leave a third of a metre of
    // floor showing. Every angle must end flush.
    for (let deg = 0; deg < 180; deg += 15) {
      const turned = box(600, 300, deg * DEG)
      const got = resolveFurnitureMove({ x: 2500, z: 2000 }, { x: -5000, z: 2000 }, turned, POLY_ROOM)
      const leftmost = Math.min(...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => {
        const c = Math.cos(turned.rotation), s = Math.sin(turned.rotation)
        return got.x + (sx * 600) * c + (sz * 300) * s
      })))
      expect(leftmost).toBeCloseTo(0, 1)
    }
  })

  it('lets a model already stuck in a wall be dragged back out', () => {
    const stuck = { x: -200, z: 1500 }
    const got = resolveFurnitureMove(stuck, { x: 1000, z: 1500 }, TABLE, POLY_ROOM)
    expect(got).toEqual({ x: 1000, z: 1500 })
  })

  it('refuses to take a stuck model clean out of the room', () => {
    const stuck = { x: -200, z: 1500 }
    expect(resolveFurnitureMove(stuck, { x: -9000, z: 1500 }, TABLE, POLY_ROOM)).toEqual(stuck)
  })

  it('never lets the model leave the room, wherever the finger goes', () => {
    // Starting on open floor: the L's inner corner itself is not, and a model
    // that starts stuck is allowed to move freely until it is out.
    let at = { x: 1200, z: 1000 }
    for (const want of [{ x: -9e4, z: 2000 }, { x: 9e4, z: -9e4 }, { x: 0, z: 9e4 }, { x: 2500, z: 2000 }]) {
      at = resolveFurnitureMove(at, want, TABLE, L_ROOM)
      expect(footprintFree(at, TABLE, L_ROOM)).toBe(true)
    }
  })
})

describe('resolveFurnitureMove, against another model', () => {
  const other: Obstacle = { at: { x: 3000, z: 1500 }, box: box(500, 500) }

  it('stops with the two models touching', () => {
    const got = resolveFurnitureMove({ x: 1000, z: 1500 }, { x: 3000, z: 1500 }, TABLE, POLY_ROOM, [other])
    // The table's right edge against the other's left edge, at x = 2500.
    expect(got.x + TABLE.maxX).toBeCloseTo(2500, 1)
  })

  it('slides past it rather than sticking to it', () => {
    const got = resolveFurnitureMove({ x: 1000, z: 1500 }, { x: 3000, z: 3000 }, TABLE, POLY_ROOM, [other])
    expect(got.z).toBeCloseTo(3000, 6)
    expect(got.x).toBeCloseTo(3000, 6)  // past the obstacle's Z, so X is free again
  })

  it('keeps a demanded clearance when one is asked for', () => {
    const got = resolveFurnitureMove({ x: 1000, z: 1500 }, { x: 3000, z: 1500 }, TABLE, POLY_ROOM, [other], 100)
    expect(got.x + TABLE.maxX).toBeCloseTo(2400, 1)
  })
})

describe('slideTo', () => {
  it('returns the target when it fits', () => {
    const to = { x: 5, z: 5 }
    expect(slideTo({ x: 0, z: 0 }, to, () => true)).toEqual(to)
  })

  it('lands within a thousandth of the boundary', () => {
    const got = slideTo({ x: 0, z: 0 }, { x: 1000, z: 0 }, (p) => p.x <= 400)
    expect(got.x).toBeLessThanOrEqual(400)
    expect(got.x).toBeGreaterThan(399.99)
  })
})

describe('resolveFurnitureRotation', () => {
  it('turns in place when there is room', () => {
    const got = resolveFurnitureRotation({ x: 2500, z: 2000 }, TABLE, 90 * DEG, POLY_ROOM)
    expect(got).toEqual({ at: { x: 2500, z: 2000 }, rotation: 90 * DEG })
  })

  it('comes off the wall by as little as will do', () => {
    // Long side against the left wall: turning 90° needs 600 mm of X it has
    // not got, so it must shift right — and still be inside afterwards.
    const at = { x: 300, z: 2000 }
    const got = resolveFurnitureRotation(at, box(300, 600), 90 * DEG, POLY_ROOM)
    expect(got).not.toBeNull()
    expect(got!.at.x).toBeGreaterThan(at.x)
    expect(footprintFree(got!.at, box(300, 600, 90 * DEG), POLY_ROOM)).toBe(true)
  })

  it('refuses a turn that cannot be made at all', () => {
    // A model longer than the room is wide can never lie across it.
    const tooLong = box(400, 3000)
    expect(resolveFurnitureRotation({ x: 2500, z: 2000 }, tooLong, 90 * DEG, POLY_ROOM)).toBeNull()
  })

  it('will not turn into another model', () => {
    const neighbour: Obstacle = { at: { x: 2500, z: 1100 }, box: box(500, 500) }
    const at = { x: 2500, z: 2000 }
    const got = resolveFurnitureRotation(at, box(300, 600), 90 * DEG, POLY_ROOM, [neighbour])
    expect(got).not.toBeNull()
    expect(footprintFree(got!.at, box(300, 600, 90 * DEG), POLY_ROOM, [neighbour])).toBe(true)
  })
})
