import { describe, it, expect } from 'vitest'
import { riserBoxes, type ServiceFeature } from '../serviceFeatures'

const riser = (over: Partial<ServiceFeature> = {}): ServiceFeature => ({
  kind: 'riser', confidence: 'high', source: 'storage', x: 6.2, y: 2, width: 0.4, depth: 0.33, height: 2.28, rotation_rad: 0.7, ...over,
})

// A 4 x 3 m room in the scan plane: centroid (2, 1.5) m.
const VERTS: [number, number][] = [[0, 0], [4000, 0], [4000, 3000], [0, 3000]]

describe('riserBoxes', () => {
  it('places a riser relative to the centre of the room and flips the turn', () => {
    const [b] = riserBoxes([riser({ x: 3.8, y: 0.2 })], VERTS)
    expect(b.x).toBeCloseTo(1.8)
    expect(b.z).toBeCloseTo(-1.3)
    expect(b.rotationY).toBeCloseTo(-0.7)
    expect(b).toMatchObject({ width: 0.4, depth: 0.33, height: 2.28, confidence: 'high' })
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
  })

  it('ignores garbage numbers', () => {
    expect(riserBoxes([riser({ x: NaN }), riser({ width: 0 })], VERTS)).toEqual([])
  })
})
