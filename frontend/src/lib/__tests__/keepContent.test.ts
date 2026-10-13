/**
 * Resizing a room must not move what is in it: its origin moves (a
 * rectangle's centre, a polygon's vertex mean), and furniture, lights and
 * sockets are stored relative to things that moved.
 */
import { describe, expect, it } from 'vitest'
import { keepContentInPlace } from '@/lib/keepContent'

describe('keepContentInPlace', () => {
  it('furniture: from the origin, so it moves back by what the origin moved', () => {
    const r = keepContentInPlace({ furniture: [{ id: 'f', furniture_id: 'x', x: 1000, y: -500, rotation: 0 }] },
      { dx: 0.25, dz: 0 }, { W: 4, D: 3 }, { W: 4.5, D: 3 })
    expect(r.furniture![0]).toMatchObject({ x: 750, y: -500 })
  })

  it('lights: from the room\'s left/back edge (origin − half its size)', () => {
    // Room grew 500 east: origin +250, half-width +250 — the left edge is
    // where it was, so a light measured from it stays as it was.
    const r = keepContentInPlace({ lights: [{ id: 'l', xMm: 1200, zMm: 800 }] },
      { dx: 0.25, dz: 0 }, { W: 4, D: 3 }, { W: 4.5, D: 3 })
    expect(r.lights![0]).toMatchObject({ xMm: 1200, zMm: 800 })
    // Grown 500 west instead: origin −250, left edge −500.
    const w = keepContentInPlace({ lights: [{ id: 'l', xMm: 1200, zMm: 800 }] },
      { dx: -0.25, dz: 0 }, { W: 4, D: 3 }, { W: 4.5, D: 3 })
    expect(w.lights![0]).toMatchObject({ xMm: 1700 })
  })

  it('sockets: shifted along walls whose start moved', () => {
    const r = keepContentInPlace({ electricals: [{ id: 'e', type: 'socket1', wallId: 'A', positionMm: 300, heightMm: 300 }] },
      { dx: -0.25, dz: 0 }, { W: 4, D: 3 }, { W: 4.5, D: 3 }, { A: 500 })
    expect(r.electricals![0].positionMm).toBe(800)
  })
})
