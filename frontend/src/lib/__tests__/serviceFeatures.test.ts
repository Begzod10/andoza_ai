import { describe, it, expect } from 'vitest'
import { riserBoxes, type ServiceFeature } from '../serviceFeatures'

const riser = (over: Partial<ServiceFeature> = {}): ServiceFeature => ({
  kind: 'riser', confidence: 'high', source: 'storage', x: 6.2, y: 2, width: 0.4, depth: 0.33, height: 2.28, rotation_rad: 0.7, ...over,
})

// A 4 x 3 m room in the scan plane: centroid (2, 1.5) m.
const VERTS: [number, number][] = [[0, 0], [4000, 0], [4000, 3000], [0, 3000]]

describe('riserBoxes', () => {
  it('stands a riser flush against the nearest wall, inside the room', () => {
    // Raw position is 0.2 m off the top wall (z=0) near the right corner.
    const [b] = riserBoxes([riser({ x: 3.8, y: 0.2 })], VERTS)
    expect(b.x).toBeCloseTo(1.8)
    expect(b.z).toBeCloseTo(-1.5 + 0.33 / 2) // wall at z=-1.5, half its depth inward
    expect(Math.abs(b.rotationY)).toBeCloseTo(0)
    expect(b).toMatchObject({ width: 0.4, depth: 0.33, height: 2.28, confidence: 'high' })
  })

  it('pulls a riser that landed outside the outline back inside', () => {
    const [b] = riserBoxes([riser({ x: 6.2, y: 1.5 })], VERTS)
    expect(b.x).toBeCloseTo(2 - 0.33 / 2) // right wall at x=2, inward
    expect(b.z).toBeCloseTo(0)
    expect(Math.abs(b.rotationY)).toBeCloseTo(Math.PI / 2)
  })

  it('works the same for a clockwise outline', () => {
    const cw: [number, number][] = [...VERTS].reverse()
    const [b] = riserBoxes([riser({ x: 6.2, y: 1.5 })], cw)
    expect(b.x).toBeCloseTo(2 - 0.33 / 2)
  })

  it('shows risers only, not wall boxes or low-confidence guesses', () => {
    const out = riserBoxes([
      riser(),
      riser({ kind: 'wall_box', confidence: 'low' }),
      riser({ confidence: 'low' }),
      riser({ confidence: 'medium' }),
    ], VERTS)
    expect(out.map((b) => b.confidence)).toEqual(['high', 'medium'])
  })

  it('gives a piece of wall (no depth) a sensible depth', () => {
    const [b] = riserBoxes([riser({ source: 'short_wall', depth: null, width: 0.236, height: 2.85 })], VERTS)
    expect(b.depth).toBeCloseTo(0.236 < 0.2 ? 0.2 : 0.236)
  })

  it('copes with nothing to show and with a room without vertices', () => {
    expect(riserBoxes(undefined, VERTS)).toEqual([])
    expect(riserBoxes([], VERTS)).toEqual([])
    const [b] = riserBoxes([riser({ x: 1, y: 1 })], null)
    expect(b.x).toBe(1)
    expect(b.z).toBe(1)
    expect(b.rotationY).toBeCloseTo(-0.7)
  })

  it('ignores garbage numbers', () => {
    expect(riserBoxes([riser({ x: NaN }), riser({ width: 0 })], VERTS)).toEqual([])
  })
})
