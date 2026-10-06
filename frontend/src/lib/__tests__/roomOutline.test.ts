/**
 * The ceiling designs are axis-aligned boxes built for a W x D room. Asking
 * whether an outline is one is what keeps them out of the rooms they would
 * cut through.
 */
import { describe, it, expect } from 'vitest'
import { isAxisAlignedRectangle, outlineSpan, type Outline, rectangleFrame } from '../roomOutline'

const rect: Outline = [[-2, -1.5], [2, -1.5], [2, 1.5], [-2, 1.5]]

describe('isAxisAlignedRectangle', () => {
  it('accepts a rectangle on the axes', () => {
    expect(isAxisAlignedRectangle(rect)).toBe(true)
  })

  it('accepts one a scan measured a few millimetres out', () => {
    const wonky: Outline = [[-2, -1.5], [2, -1.496], [2.003, 1.5], [-2, 1.498]]
    expect(isAxisAlignedRectangle(wonky)).toBe(true)
  })

  it('rejects a rectangle turned off the axes', () => {
    // The parts are axis-aligned boxes; a turned room is no more usable than
    // an L-shaped one.
    const turned: Outline = [[0, 0], [2, 1], [1, 3], [-1, 2]]
    expect(isAxisAlignedRectangle(turned)).toBe(false)
  })

  it('rejects an L-shaped room', () => {
    const ell: Outline = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 3], [0, 3]]
    expect(isAxisAlignedRectangle(ell)).toBe(false)
  })

  it('rejects a degenerate outline', () => {
    expect(isAxisAlignedRectangle([[0, 0], [0, 0], [1, 1], [1, 1]])).toBe(false)
    expect(isAxisAlignedRectangle([[0, 0], [1, 0], [1, 1]])).toBe(false)
    expect(isAxisAlignedRectangle([])).toBe(false)
  })
})

describe('outlineSpan', () => {
  it('measures the outline, wherever it sits', () => {
    expect(outlineSpan(rect)).toEqual({ W: 4, D: 3 })
    const moved: Outline = rect.map(([x, z]) => [x + 10, z - 5] as [number, number])
    expect(outlineSpan(moved)).toEqual({ W: 4, D: 3 })
  })

  it('answers zero for nothing', () => {
    expect(outlineSpan([])).toEqual({ W: 0, D: 0 })
  })
})

describe('rectangleFrame', () => {
  /** The outline as the drawn shell hands it over: centred on its vertex mean,
   *  in metres. */
  function centred(verticesMm: [number, number][]): [number, number][] {
    const n = verticesMm.length
    const cx = verticesMm.reduce((s, [x]) => s + x, 0) / n / 1000
    const cz = verticesMm.reduce((s, [, z]) => s + z, 0) / n / 1000
    return verticesMm.map(([x, z]) => [x / 1000 - cx, z / 1000 - cz])
  }

  /** Turn a local point by a yaw, as a three.js group with rotation-y does. */
  function turn([x, z]: [number, number], yaw: number): [number, number] {
    const c = Math.cos(yaw)
    const s = Math.sin(yaw)
    return [x * c + z * s, -x * s + z * c]
  }

  it('measures a plain axis-aligned room', () => {
    const f = rectangleFrame([[-2, -1.5], [2, -1.5], [2, 1.5], [-2, 1.5]])
    expect(f).not.toBeNull()
    expect(f!.W).toBeCloseTo(4, 9)
    expect(f!.D).toBeCloseTo(3, 9)
    expect(f!.yaw).toBeCloseTo(0, 9)
  })

  it("measures the user's own room, which the axis test refused", () => {
    // The room from the bug report: a true rectangle, drawn at an angle. The
    // old gate returned false for it and the ceiling design was never built,
    // so Shift turi saved a choice the room never showed.
    const outline = centred([[0, 2661], [5041, 0], [6838, 3405], [1797, 6065]])
    expect(isAxisAlignedRectangle(outline)).toBe(false)

    const f = rectangleFrame(outline)
    expect(f).not.toBeNull()
    expect(f!.W).toBeCloseTo(5.7, 2)
    expect(f!.D).toBeCloseTo(3.85, 2)
    expect((f!.yaw * 180) / Math.PI).toBeCloseTo(27.82, 1)
  })

  it('gives a yaw that lands the local frame back on the outline', () => {
    // The point of returning a frame: build the boxes for W x D as if the room
    // were square to the axes, turn the group, and the corners must come back
    // to the real ones. A sign error here would put the ceiling across the
    // room instead of along it.
    const outline = centred([[0, 2661], [5041, 0], [6838, 3405], [1797, 6065]])
    const f = rectangleFrame(outline)!
    const local: [number, number][] = [
      [-f.W / 2, -f.D / 2], [f.W / 2, -f.D / 2], [f.W / 2, f.D / 2], [-f.W / 2, f.D / 2],
    ]
    const got = local.map((p) => turn(p, f.yaw))
    // Same four corners, in some rotation of the same order.
    for (const [gx, gz] of got) {
      expect(outline.some(([x, z]) => Math.hypot(x - gx, z - gz) < 0.01)).toBe(true)
    }
  })

  it('refuses an L, which would put a ceiling through a wall', () => {
    expect(rectangleFrame([[0, 0], [6, 0], [6, 2], [2, 2], [2, 6], [0, 6]])).toBeNull()
  })

  it('refuses a parallelogram and a trapezium', () => {
    // Four corners and two pairs of equal sides, but not square: the boxes
    // would not meet the walls.
    expect(rectangleFrame([[0, 0], [4, 0], [5, 3], [1, 3]])).toBeNull()
    expect(rectangleFrame([[0, 0], [4, 0], [3, 3], [1, 3]])).toBeNull()
  })

  it('refuses a degenerate outline rather than calling it a rectangle', () => {
    expect(rectangleFrame([[0, 0], [0, 0], [4, 0], [4, 3]])).toBeNull()
    expect(rectangleFrame([[0, 0], [4, 0], [4, 3]])).toBeNull()
  })

  it('tolerates the wobble of a drawn or scanned room', () => {
    // A hand-drawn 4 x 3 whose corners are a few millimetres out is still a
    // rectangle as far as the ceiling is concerned.
    const f = rectangleFrame([[-2, -1.5], [2.004, -1.497], [1.998, 1.503], [-2.003, 1.498]])
    expect(f).not.toBeNull()
    expect(f!.W).toBeCloseTo(4, 2)
    expect(f!.D).toBeCloseTo(3, 2)
  })
})
