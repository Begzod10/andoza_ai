/**
 * The style spec is the single source for the plan symbol, the picker
 * thumbnails and the 3D sashes, so the layout it produces has to stay exact:
 * panes tile the opening with no gaps and no overlap.
 */
import { describe, it, expect } from 'vitest'
import {
  WINDOW_STYLES,
  layoutPanes,
  mullionCount,
  resolveWindowStyle,
  findWindowStyle,
} from '../windowStyles'

describe('layoutPanes', () => {
  it('tiles the whole opening for every catalog style', () => {
    for (const style of WINDOW_STYLES) {
      const panes = layoutPanes(style)
      const area = panes.reduce((s, p) => s + p.w * p.h, 0)
      expect(area).toBeCloseTo(1, 6)
      for (const p of panes) {
        expect(p.x - p.w / 2).toBeGreaterThanOrEqual(-0.5 - 1e-9)
        expect(p.x + p.w / 2).toBeLessThanOrEqual(0.5 + 1e-9)
        expect(p.y - p.h / 2).toBeGreaterThanOrEqual(-0.5 - 1e-9)
        expect(p.y + p.h / 2).toBeLessThanOrEqual(0.5 + 1e-9)
      }
    }
  })

  it('stacks bands from the top down', () => {
    const panes = layoutPanes(findWindowStyle('transom_apron')!)
    // transom (1 pane), main (2), apron (2)
    expect(panes).toHaveLength(5)
    expect(panes[0].y).toBeGreaterThan(panes[1].y)
    expect(panes[1].y).toBeGreaterThan(panes[3].y)
    expect(panes[0].y + panes[0].h / 2).toBeCloseTo(0.5)
    expect(panes[4].y - panes[4].h / 2).toBeCloseTo(-0.5)
  })

  it('hinges a pair on opposite jambs so they meet in the middle', () => {
    const [left, right] = layoutPanes(findWindowStyle('double')!)
    expect(left.hinge).toBe('left')
    expect(right.hinge).toBe('right')
    expect(left.opens && right.opens).toBe(true)
  })

  it('keeps fixed panes fixed', () => {
    const panes = layoutPanes(findWindowStyle('panorama')!)
    expect(panes.map((p) => p.opens)).toEqual([true, false, true])
    // the centre light is the widest
    expect(panes[1].w).toBeGreaterThan(panes[0].w)
  })

  it('carries the band grid onto its panes', () => {
    const panes = layoutPanes(findWindowStyle('colonial')!)
    expect(panes.every((p) => p.grid?.[0] === 3 && p.grid?.[1] === 4)).toBe(true)
  })
})

describe('resolveWindowStyle', () => {
  it('uses the picked style', () => {
    expect(resolveWindowStyle({ styleId: 'arch_fan', width: 900 }).id).toBe('arch_fan')
  })

  it('falls back to the legacy sash count for windows saved before styles', () => {
    expect(resolveWindowStyle({ sashes: 1, width: 1400 }).id).toBe('single')
    expect(resolveWindowStyle({ sashes: 2, width: 600 }).id).toBe('double')
    // no sashes either: wide openings always carried two leaves
    expect(resolveWindowStyle({ width: 1400 }).id).toBe('double')
    expect(resolveWindowStyle({ width: 600 }).id).toBe('single')
  })

  it('ignores an unknown id instead of blanking the window', () => {
    expect(resolveWindowStyle({ styleId: 'from-a-newer-build', width: 600 }).id).toBe('single')
  })
})

describe('mullionCount', () => {
  it('counts the vertical divisions of the widest band', () => {
    expect(mullionCount(findWindowStyle('single')!)).toBe(0)
    expect(mullionCount(findWindowStyle('double')!)).toBe(1)
    expect(mullionCount(findWindowStyle('triple')!)).toBe(2)
    // the transom is one pane wide, the sash band below has two
    expect(mullionCount(findWindowStyle('transom_wide')!)).toBe(1)
  })
})

describe('catalog', () => {
  it('has unique ids', () => {
    expect(new Set(WINDOW_STYLES.map((s) => s.id)).size).toBe(WINDOW_STYLES.length)
  })
})
