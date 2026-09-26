/**
 * The arc has to stay inside the screen from a bottom-right anchor, so these
 * check the geometry against the quarter it is supposed to occupy: left is
 * -x, up is -y, and nothing may sit right of or below the corner button.
 */
import { describe, it, expect } from 'vitest'
import { arcOffsets, ARC_RADIUS } from '@/components/studio/QuarterArcMenu'

describe('arcOffsets', () => {
  it('runs from due left to straight up', () => {
    const [first, , last] = arcOffsets(3)
    // Due left: all the way out on -x, level with the button.
    expect(first.dx).toBeCloseTo(-ARC_RADIUS, 6)
    expect(first.dy).toBeCloseTo(0, 6)
    // Straight up: directly above it.
    expect(last.dx).toBeCloseTo(0, 6)
    expect(last.dy).toBeCloseTo(-ARC_RADIUS, 6)
  })

  it('keeps every item inside the quarter, so none lands off-screen', () => {
    for (const n of [1, 2, 3, 4, 5, 8]) {
      for (const { dx, dy } of arcOffsets(n)) {
        // Right of the corner button would run off the screen edge; below it
        // would run under the bottom.
        expect(dx).toBeLessThanOrEqual(1e-9)
        expect(dy).toBeLessThanOrEqual(1e-9)
      }
    }
  })

  it('puts every item at the same distance from the button', () => {
    for (const { dx, dy } of arcOffsets(5)) {
      expect(Math.hypot(dx, dy)).toBeCloseTo(ARC_RADIUS, 6)
    }
  })

  it('spaces items evenly along the arc', () => {
    const pts = arcOffsets(4)
    const gaps = pts.slice(1).map((p, i) => Math.hypot(p.dx - pts[i].dx, p.dy - pts[i].dy))
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 6)
  })

  it('centres a lone item in the quarter instead of parking it at one end', () => {
    const [only] = arcOffsets(1)
    // 225°: equally far left and up.
    expect(only.dx).toBeCloseTo(-ARC_RADIUS * Math.SQRT1_2, 6)
    expect(only.dy).toBeCloseTo(-ARC_RADIUS * Math.SQRT1_2, 6)
  })

  it('has no items to place when there are none', () => {
    expect(arcOffsets(0)).toEqual([])
    expect(arcOffsets(-1)).toEqual([])
  })

  it('scales with the radius it is given', () => {
    const [p] = arcOffsets(1, 200)
    expect(Math.hypot(p.dx, p.dy)).toBeCloseTo(200, 6)
  })
})
