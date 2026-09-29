/**
 * The patch of floor inside a doorway. It has to land on its own wall, cover
 * the opening, and run from the wall face back into the reveal — a rectangle
 * anywhere else is floor laid inside a wall.
 */
import { describe, it, expect } from 'vitest'
import { doorwayNiches, type NicheWall } from '../doorwayNiches'

const REVEAL = 0.2
const W = 4
const D = 3

const door = { id: 'd1', type: 'eshik', position: 1000, width: 900 }
const window_ = { id: 'w1', type: 'deraza', position: 2000, width: 1200 }

const walls: NicheWall[] = [
  { id: 'A', elements: [door, window_] },
  { id: 'B', elements: [] },
]

describe('doorwayNiches', () => {
  it('gives a rectangle per door, and none for a window', () => {
    const out = doorwayNiches(walls, W, D, {}, REVEAL)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ wallId: 'A', elId: 'd1' })
    expect(out[0].polygon).toHaveLength(4)
  })

  it('sits on the wall it belongs to, spanning the opening', () => {
    // Wall A runs along X at z = -D/2, so the niche straddles that line.
    const [poly] = doorwayNiches(walls, W, D, {}, REVEAL).map((n) => n.polygon)
    const zs = poly.map(([, z]) => z)
    expect(Math.max(...zs)).toBeCloseTo(-D / 2 + 0.01, 6)
    expect(Math.min(...zs)).toBeCloseTo(-D / 2 - REVEAL - 0.01, 6)

    // ...and covers the opening's 900 mm, plus a hair each side.
    const xs = poly.map(([x]) => x)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.9 + 0.02, 6)
  })

  it('runs back into the wall, never into the room', () => {
    // The room side of wall A is +z. Nothing may reach past the wall face
    // into the room, or the patch would lie on top of the room's own floor.
    for (const n of doorwayNiches(walls, W, D, {}, REVEAL)) {
      for (const [, z] of n.polygon) expect(z).toBeLessThan(-D / 2 + 0.02)
    }
  })

  it('puts a door on wall B against that wall instead', () => {
    const [n] = doorwayNiches([{ id: 'B', elements: [door] }], W, D, {}, REVEAL)
    const xs = n.polygon.map(([x]) => x)
    // Wall B runs along Z at x = W/2, with the room on its -x side, so the
    // niche runs the other way — outward.
    expect(Math.min(...xs)).toBeCloseTo(W / 2 - 0.01, 6)
    expect(Math.max(...xs)).toBeCloseTo(W / 2 + REVEAL + 0.01, 6)
  })

  it('has nothing to do with a room whose walls carry no doors', () => {
    expect(doorwayNiches([{ id: 'A' }], W, D, {}, REVEAL)).toEqual([])
  })
})
