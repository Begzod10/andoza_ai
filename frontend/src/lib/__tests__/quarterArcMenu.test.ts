/**
 * The arc has to stay inside the screen from a bottom-right anchor, so these
 * check the geometry against the quarter it is supposed to occupy: left is
 * -x, up is -y, and nothing may sit right of or below the corner button.
 */
import { describe, it, expect } from 'vitest'
import {
  arcOffsets, arcCapacity, outerRing,
  ARC_RADIUS, ARC_RADIUS_OUTER, ARC_ITEM_OUTER,
} from '@/components/studio/QuarterArcMenu'

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

describe('arcCapacity', () => {
  it('holds more on the outer ring than the inner one', () => {
    expect(arcCapacity(ARC_RADIUS_OUTER, ARC_ITEM_OUTER))
      .toBeGreaterThan(arcCapacity(ARC_RADIUS, ARC_ITEM_OUTER))
  })

  it('leaves the buttons room to breathe', () => {
    const radius = ARC_RADIUS_OUTER
    const size = ARC_ITEM_OUTER
    const n = arcCapacity(radius, size)
    // Neighbours must not overlap: the straight-line gap between two adjacent
    // slots has to clear the button diameter.
    const pts = arcOffsets(n, radius)
    const gap = Math.hypot(pts[1].dx - pts[0].dx, pts[1].dy - pts[0].dy)
    expect(gap).toBeGreaterThanOrEqual(size)
  })

  it('always leaves room for at least one', () => {
    expect(arcCapacity(10, 90)).toBe(1)
  })
})

describe('outerRing', () => {
  const items = (n: number) => Array.from({ length: n }, (_, i) => ({
    key: `i${i}`, label: `${i}`, onSelect: () => {},
  }))
  const more = { key: 'more', label: 'Yana', onSelect: () => {} }

  it('shows everything when it fits, with no "more" button', () => {
    const out = outerRing(items(4), more, 6)
    expect(out).toHaveLength(4)
    expect(out.some((i) => i.key === 'more')).toBe(false)
  })

  it('shows everything when it exactly fills the arc', () => {
    const out = outerRing(items(6), more, 6)
    expect(out).toHaveLength(6)
    expect(out.some((i) => i.key === 'more')).toBe(false)
  })

  it('never exceeds the arc once "more" is needed', () => {
    const out = outerRing(items(50), more, 6)
    expect(out).toHaveLength(6)
    expect(out[out.length - 1].key).toBe('more')
    // The "more" button costs a slot, so only 5 real items survive — adding it
    // after slicing would have made 7 and pushed one off the arc.
    expect(out.filter((i) => i.key !== 'more')).toHaveLength(5)
  })

  it('truncates rather than overflow when there is no "more" button', () => {
    const out = outerRing(items(50), null, 6)
    expect(out).toHaveLength(6)
    expect(out.map((i) => i.key)).toEqual(['i0', 'i1', 'i2', 'i3', 'i4', 'i5'])
  })
})
