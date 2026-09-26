/**
 * The arc has to stay inside the screen from a bottom-right anchor and scroll
 * along its own curve, so these check the geometry against the quarter it is
 * supposed to occupy — left is -x, up is -y, nothing sits right of or below the
 * corner button — and the scroll against what a finger sweeping the arc does.
 */
import { describe, it, expect } from 'vitest'
import {
  arcOffsets, arcCapacity, arcSlots, arcSlotStep, arcPoint,
  clampArcOffset, maxArcOffset, angleAt, slotsFromAngleDelta,
  ARC_RADIUS, ARC_RADIUS_OUTER, ARC_ITEM_OUTER, ARC_START_DEG, ARC_SWEEP_DEG,
} from '../arcMenu'

describe('arcOffsets', () => {
  it('runs from due left to straight up', () => {
    const [first, , last] = arcOffsets(3)
    expect(first.dx).toBeCloseTo(-ARC_RADIUS, 6)
    expect(first.dy).toBeCloseTo(0, 6)
    expect(last.dx).toBeCloseTo(0, 6)
    expect(last.dy).toBeCloseTo(-ARC_RADIUS, 6)
  })

  it('keeps every item inside the quarter, so none lands off-screen', () => {
    for (const n of [1, 2, 3, 4, 5, 8]) {
      for (const { dx, dy } of arcOffsets(n)) {
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
    expect(only.dx).toBeCloseTo(-ARC_RADIUS * Math.SQRT1_2, 6)
    expect(only.dy).toBeCloseTo(-ARC_RADIUS * Math.SQRT1_2, 6)
  })

  it('has no items to place when there are none', () => {
    expect(arcOffsets(0)).toEqual([])
    expect(arcOffsets(-1)).toEqual([])
  })
})

describe('arcCapacity', () => {
  it('holds more on the outer ring than the inner one', () => {
    expect(arcCapacity(ARC_RADIUS_OUTER, ARC_ITEM_OUTER))
      .toBeGreaterThan(arcCapacity(ARC_RADIUS, ARC_ITEM_OUTER))
  })

  it('leaves the buttons room to breathe', () => {
    const n = arcCapacity(ARC_RADIUS_OUTER, ARC_ITEM_OUTER)
    const pts = arcOffsets(n, ARC_RADIUS_OUTER)
    const gap = Math.hypot(pts[1].dx - pts[0].dx, pts[1].dy - pts[0].dy)
    expect(gap).toBeGreaterThanOrEqual(ARC_ITEM_OUTER)
  })

  it('always leaves room for at least one', () => {
    expect(arcCapacity(10, 90)).toBe(1)
  })
})

describe('arcSlots', () => {
  const CAP = 6

  it('shows a window onto a long list, not all of it', () => {
    const shown = arcSlots(87, CAP, 0, ARC_RADIUS_OUTER)
    // The whole library must never be laid out at once — that is the entire
    // reason the ring scrolls instead of trying to hold it.
    expect(shown.length).toBeLessThanOrEqual(CAP + 2)
    expect(shown.map((s) => s.index)).toContain(0)
  })

  it('advances the window as the ring is dragged', () => {
    const at0 = arcSlots(87, CAP, 0, ARC_RADIUS_OUTER).map((s) => s.index)
    const at10 = arcSlots(87, CAP, 10, ARC_RADIUS_OUTER).map((s) => s.index)
    expect(at0).not.toEqual(at10)
    expect(Math.min(...at10)).toBeGreaterThan(Math.max(...at0) - CAP)
    expect(at10).toContain(10)
  })

  it('keeps the pitch fixed while scrolling, so buttons do not slide about', () => {
    for (const offset of [0, 0.5, 3, 12.25]) {
      const s = arcSlots(87, CAP, offset, ARC_RADIUS_OUTER)
      const gaps = s.slice(1).map((p, i) => Math.hypot(p.dx - s[i].dx, p.dy - s[i].dy))
      for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 6)
    }
  })

  it('fades items out as they leave, rather than popping them', () => {
    const s = arcSlots(87, CAP, 0.5, ARC_RADIUS_OUTER)
    const leaving = s.find((x) => x.slot < 0)
    expect(leaving).toBeDefined()
    expect(leaving!.opacity).toBeGreaterThan(0)
    expect(leaving!.opacity).toBeLessThan(1)
    // ...while the ones on the arc proper stay fully opaque.
    const settled = s.find((x) => x.slot > 1 && x.slot < CAP - 2)
    expect(settled!.opacity).toBe(1)
  })

  it('keeps every visible item on the quarter, however far it is scrolled', () => {
    for (const offset of [0, 7.5, 81]) {
      for (const { dx, dy, opacity } of arcSlots(87, CAP, offset, ARC_RADIUS_OUTER)) {
        if (opacity === 0) continue
        // One slot of overshoot is allowed at each end for the fade, which is
        // what the tolerance covers.
        const deg = (Math.atan2(dy, dx) * 180) / Math.PI
        const unwrapped = deg < 0 ? deg + 360 : deg
        expect(unwrapped).toBeGreaterThanOrEqual(ARC_START_DEG - arcSlotStep(CAP) - 1e-6)
        expect(unwrapped).toBeLessThanOrEqual(ARC_START_DEG + ARC_SWEEP_DEG + arcSlotStep(CAP) + 1e-6)
      }
    }
  })
})

describe('offset limits', () => {
  it('does not scroll at all when everything already fits', () => {
    expect(maxArcOffset(4, 6)).toBe(0)
    expect(clampArcOffset(3, 4, 6)).toBe(0)
  })

  it('stops with the last item on the arc, never past it', () => {
    expect(maxArcOffset(87, 6)).toBe(81)
    expect(clampArcOffset(999, 87, 6)).toBe(81)
    // Scrolled all the way, the final item is the last one in the list.
    const end = arcSlots(87, 6, 81, ARC_RADIUS_OUTER)
    expect(Math.max(...end.map((s) => s.index))).toBe(86)
  })

  it('does not scroll back past the start', () => {
    expect(clampArcOffset(-5, 87, 6)).toBe(0)
  })
})

describe('drag to scroll', () => {
  it('reads the angle of a point around the corner button', () => {
    // Due left of the centre.
    expect(angleAt(100, 100, 0, 100)).toBeCloseTo(180, 6)
    // Straight up from it — in the same frame the slots use, not -90.
    expect(angleAt(100, 100, 100, 0)).toBeCloseTo(270, 6)
  })

  it('reads a sweep across the top of the arc as one continuous move', () => {
    // Just past straight up, atan2 flips sign; unwrapping has to keep the
    // angle next to where the finger already was, or the ring would fling.
    const before = angleAt(100, 100, 100, 0)
    const after = angleAt(100, 100, 110, 0)
    expect(Math.abs(after - before)).toBeLessThan(20)
  })

  it('carries the buttons with the finger', () => {
    const cap = 6
    // Sweeping toward the top of the arc (increasing angle) advances the list.
    expect(slotsFromAngleDelta(+arcSlotStep(cap), cap)).toBeCloseTo(-1, 6)
    expect(slotsFromAngleDelta(-arcSlotStep(cap), cap)).toBeCloseTo(1, 6)
  })

  it('moves one button per slot of arc swept', () => {
    const cap = 6
    // A full sweep of the quarter is the whole visible window.
    expect(slotsFromAngleDelta(-ARC_SWEEP_DEG, cap)).toBeCloseTo(cap - 1, 6)
  })
})

describe('arcPoint', () => {
  it('agrees with the even spread at the arc ends', () => {
    const [first, , last] = arcOffsets(3, ARC_RADIUS_OUTER)
    expect(arcPoint(ARC_START_DEG, ARC_RADIUS_OUTER).dx).toBeCloseTo(first.dx, 6)
    expect(arcPoint(ARC_START_DEG + ARC_SWEEP_DEG, ARC_RADIUS_OUTER).dy).toBeCloseTo(last.dy, 6)
  })
})
