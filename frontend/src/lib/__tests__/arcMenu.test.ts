/**
 * The arc has to stay inside the screen from a bottom-right anchor and scroll
 * along its own curve, so these check the geometry against the quarter it is
 * supposed to occupy — left is -x, up is -y, nothing sits right of or below the
 * corner button — and the scroll against what a finger sweeping the arc does.
 */
import { describe, it, expect } from 'vitest'
import {
  arcOffsets, arcCapacity, arcSlots, arcSlotStep, arcPoint,
  wrapArcOffset, maxArcOffset, angleAt, slotsFromAngleDelta, ringAtDistance,
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
    for (const offset of [0, 7.5, 81, 500, -20]) {
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

describe('the ring is endless', () => {
  it('does not scroll at all when everything already fits', () => {
    expect(maxArcOffset(4, 6)).toBe(0)
  })

  it('comes back round to the first item instead of stopping at the last', () => {
    const CAP = 6
    // Parked exactly on the last item of an 87-long list, the slots after it
    // are the start of the list again — not empty space, and not a dead stop.
    const atEnd = arcSlots(87, CAP, 86, ARC_RADIUS_OUTER)
    const indices = atEnd.map((s) => s.index)
    expect(indices).toContain(86)
    expect(indices).toContain(0)
    expect(indices).toContain(1)
  })

  it('keeps going however far it is swept, forwards or backwards', () => {
    for (const off of [-500, -3.5, 0, 12, 87, 200.25, 10_000]) {
      const slots = arcSlots(87, 6, off, ARC_RADIUS_OUTER)
      expect(slots.length).toBeGreaterThan(0)
      for (const s of slots) {
        // Always a real item, never off the end of the array.
        expect(s.index).toBeGreaterThanOrEqual(0)
        expect(s.index).toBeLessThan(87)
      }
    }
  })

  it('scrolls backwards past the start into the end of the list', () => {
    const slots = arcSlots(87, 6, -1, ARC_RADIUS_OUTER)
    expect(slots.map((s) => s.index)).toContain(86)
  })

  it('gives each visible button its own identity even when one comes round twice', () => {
    // A short list on a long arc shows an item at both ends at once; keying by
    // the item would collapse the two into one.
    const slots = arcSlots(5, 6, 0, ARC_RADIUS_OUTER)
    const keys = new Set(slots.map((s) => s.key))
    expect(keys.size).toBe(slots.length)
    const repeated = slots.filter((s) => s.index === 0)
    expect(repeated.length).toBeGreaterThan(1)
  })
})

describe('wrapArcOffset', () => {
  it('folds a long run of sweeps back into one lap', () => {
    expect(wrapArcOffset(87, 87)).toBe(0)
    expect(wrapArcOffset(90, 87)).toBe(3)
    expect(wrapArcOffset(10_000, 87)).toBe(10_000 % 87)
  })

  it('folds backwards sweeps round to the end', () => {
    expect(wrapArcOffset(-1, 87)).toBe(86)
    expect(wrapArcOffset(-88, 87)).toBe(86)
  })

  it('never reports a position outside the list', () => {
    for (const off of [-1000, -1, 0, 1, 86, 87, 5000]) {
      const w = wrapArcOffset(off, 87)
      expect(w).toBeGreaterThanOrEqual(0)
      expect(w).toBeLessThan(87)
    }
  })

  it('copes with an empty list', () => {
    expect(wrapArcOffset(5, 0)).toBe(0)
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

describe('ringAtDistance', () => {
  it('claims a touch on the inner ring for the categories', () => {
    expect(ringAtDistance(ARC_RADIUS)).toBe('inner')
  })

  it('claims a touch on the outer ring for the items', () => {
    expect(ringAtDistance(ARC_RADIUS_OUTER)).toBe('outer')
  })

  it('splits the empty gap down the middle rather than by the nearer button', () => {
    const mid = (ARC_RADIUS + ARC_RADIUS_OUTER) / 2
    expect(ringAtDistance(mid - 1)).toBe('inner')
    expect(ringAtDistance(mid + 1)).toBe('outer')
  })

  it('gives a press inside the corner button to the inner ring', () => {
    expect(ringAtDistance(0)).toBe('inner')
  })

  it('gives a press beyond the outer ring to the items', () => {
    expect(ringAtDistance(ARC_RADIUS_OUTER + 200)).toBe('outer')
  })
})

describe('both rings scroll', () => {
  it('holds four categories on the inner arc and turns through the rest', () => {
    const cap = arcCapacity(ARC_RADIUS, 52)
    expect(cap).toBe(4)
    // Six categories: Mebel, Rang, Chiroq, Pol, Plintus, Karniz. Every one of
    // them must be reachable by turning the ring, and it keeps turning.
    const seen = new Set<number>()
    for (let off = 0; off < 6; off++) {
      for (const s of arcSlots(6, cap, off, ARC_RADIUS)) seen.add(s.index)
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('leaves the rings far enough apart not to touch', () => {
    const gap = ARC_RADIUS_OUTER - ARC_RADIUS
    expect(gap).toBeGreaterThanOrEqual((52 + ARC_ITEM_OUTER) / 2)
  })

  it('keeps the inner buttons from overlapping each other', () => {
    const cap = arcCapacity(ARC_RADIUS, 52)
    const pts = arcOffsets(cap, ARC_RADIUS)
    const gap = Math.hypot(pts[1].dx - pts[0].dx, pts[1].dy - pts[0].dy)
    expect(gap).toBeGreaterThanOrEqual(52)
  })

  it('scrolls the two rings by the same gesture maths', () => {
    // Same sweep, different ring: each advances by its own slot pitch, so
    // neither feels heavier to push than the other.
    const innerCap = arcCapacity(ARC_RADIUS, 52)
    const outerCap = arcCapacity(ARC_RADIUS_OUTER, ARC_ITEM_OUTER)
    expect(slotsFromAngleDelta(-ARC_SWEEP_DEG, innerCap)).toBeCloseTo(innerCap - 1, 6)
    expect(slotsFromAngleDelta(-ARC_SWEEP_DEG, outerCap)).toBeCloseTo(outerCap - 1, 6)
  })
})
