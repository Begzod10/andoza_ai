/**
 * A room's footprint in the flat — what moving, sliding and resizing test
 * against. A polygon room is drawn centred on its vertex mean, so its
 * footprint is NOT its outer rectangle centred on its position.
 */
import { describe, expect, it } from 'vitest'
import { flatBoxOf, flatBounds } from '@/lib/flatBoxes'
import type { RoomGeometry } from '@/store/roomStore'

describe('flatBoxOf', () => {
  it('a rectangle: centred on where it stands', () => {
    const g: RoomGeometry = { walls: ['A', 'B', 'C', 'D'].map((id) => ({ id, length: id === 'A' || id === 'C' ? 4000 : 3000, elements: [] })), vertices: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]] }
    expect(flatBoxOf('r', g, 1, 2)).toMatchObject({ cx: 1, cz: 2, w: 4, d: 3 })
  })

  it('an L: its outline placed by its vertex mean, made of its rectangles', () => {
    // x 0 … 4, z 0 … 3, with x 3 … 4, z 0 … 1.5 taken out.
    const v: [number, number][] = [[0, 0], [3000, 0], [3000, 1500], [4000, 1500], [4000, 3000], [0, 3000]]
    const g: RoomGeometry = { walls: v.map((_, i) => ({ id: `W${i + 1}`, length: 1, elements: [] })), vertices: v }
    const mean = { x: v.reduce((s, p) => s + p[0], 0) / 6 / 1000, z: v.reduce((s, p) => s + p[1], 0) / 6 / 1000 }
    const b = flatBoxOf('L', g, 10, 20)
    expect(b.w).toBeCloseTo(4)
    expect(b.d).toBeCloseTo(3)
    expect(b.cx).toBeCloseTo(10 + (2 - mean.x))
    expect(b.cz).toBeCloseTo(20 + (1.5 - mean.z))
    const area = b.parts!.reduce((s, p) => s + p.w * p.d, 0)
    expect(area).toBeCloseTo(12 - 1.5)
  })
})

describe('flatBounds', () => {
  // "max zoom is very far, scene rooms should fit display size fully": the
  // zoom-out limit fits the flat's real footprint — not twice the furthest
  // reach from the open room, which for a room at one end of the flat was
  // nearly double the flat.
  it('is the box round every room, wherever the open room is', () => {
    const b = flatBounds([
      { id: 'a', cx: 0, cz: 0, w: 4, d: 3 },
      { id: 'b', cx: 3.95, cz: 0, w: 3.5, d: 3 },
      { id: 'c', cx: 0.25, cz: 3.2, w: 3.5, d: 3 },
    ])
    expect(b.W).toBeCloseTo(5.7 + 2)      // x −2 … 5.7
    expect(b.D).toBeCloseTo(4.7 + 1.5)    // z −1.5 … 4.7
  })

  it('is the room itself for a one-room flat', () => {
    expect(flatBounds([{ id: 'a', cx: 1, cz: 2, w: 4, d: 3 }])).toEqual({ W: 4, D: 3 })
  })
})
