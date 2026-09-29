/**
 * The panel outlines are shared by the 3D moulding and the thumbnail, so what
 * matters is that they are closed, sit inside the leaf, and differ from one
 * another — a style that draws the same shape as its neighbour is a style the
 * user cannot pick between.
 */
import { describe, it, expect } from 'vitest'
import {
  DOOR_STYLES, doorStyle, panelOutline, panelFlutes, DEFAULT_DOOR_STYLE,
} from '../doorStyles'

describe('the catalogue', () => {
  it('carries the sheet, with its own codes', () => {
    expect(DOOR_STYLES.length).toBe(18)
    expect(DOOR_STYLES.map((s) => s.label)).toContain('MY-P005')
    expect(new Set(DOOR_STYLES.map((s) => s.id)).size).toBe(DOOR_STYLES.length)
  })

  it('falls back to a real style for a door saved without one', () => {
    expect(doorStyle(undefined).id).toBe(DEFAULT_DOOR_STYLE)
    expect(doorStyle('nonsense').id).toBe(DEFAULT_DOOR_STYLE)
  })

  it('keeps one flush door, since not every door is panelled', () => {
    expect(DOOR_STYLES.some((s) => s.panels.length === 0)).toBe(true)
  })

  it('draws every style differently', () => {
    const drawn = DOOR_STYLES.map((s) =>
      JSON.stringify(s.panels.map((p) => panelOutline(p, 6))))
    expect(new Set(drawn).size).toBe(DOOR_STYLES.length)
  })
})

describe('panel outlines', () => {
  const all = DOOR_STYLES.flatMap((s) => s.panels)

  it('stay inside the leaf, clear of its edges', () => {
    for (const p of all) {
      for (const [x, y] of panelOutline(p)) {
        // A panel that reached the leaf's edge would have no stile beside it.
        expect(Math.abs(x)).toBeLessThan(0.46)
        expect(Math.abs(y)).toBeLessThan(0.47)
      }
    }
  })

  it('gives every panel enough points to be a shape', () => {
    for (const p of all) expect(panelOutline(p).length).toBeGreaterThanOrEqual(4)
  })

  it('springs an arch from the panel, not above it', () => {
    const arch = { x: 0, y: 0, w: 0.7, h: 0.8, shape: 'arch' as const }
    const ys = panelOutline(arch).map(([, y]) => y)
    expect(Math.max(...ys)).toBeCloseTo(0.4, 5)
    expect(Math.min(...ys)).toBeCloseTo(-0.4, 5)
  })

  it('rounds a stadium at both ends and a dome only at the foot', () => {
    const box = { x: 0, y: 0, w: 0.6, h: 0.8 }
    const corners = (shape: 'rect' | 'stadium' | 'dome') =>
      panelOutline({ ...box, shape }).filter(([x, y]) =>
        Math.abs(Math.abs(x) - 0.3) < 1e-9 && Math.abs(Math.abs(y) - 0.4) < 1e-9).length
    expect(corners('rect')).toBe(4)
    expect(corners('stadium')).toBe(0)
    // A dome keeps its two square top corners.
    expect(corners('dome')).toBe(2)
  })
})

describe('fluting', () => {
  it('runs the grooves inside the panel', () => {
    const panel = { x: 0, y: 0, w: 0.7, h: 0.8, shape: 'rect' as const, fluted: true }
    for (const f of panelFlutes(panel)) {
      expect(Math.abs(f.x)).toBeLessThan(0.35)
      expect(f.y1).toBeGreaterThan(f.y0)
      expect(f.y1).toBeLessThan(0.4)
    }
  })

  it('stops an arched panel\'s grooves below the springing', () => {
    const arch = { x: 0, y: 0, w: 0.7, h: 0.8, shape: 'arch' as const, fluted: true }
    const rect = { ...arch, shape: 'rect' as const }
    expect(panelFlutes(arch)[0].y1).toBeLessThan(panelFlutes(rect)[0].y1)
  })
})
