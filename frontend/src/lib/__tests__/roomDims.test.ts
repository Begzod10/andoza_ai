/**
 * One orientation rule, asserted once: X is wall A, Z is wall B.
 *
 * Getting this backwards transposed the 3D room against the 2D plan (an 8×5
 * room rendered as 5×8), so the interesting case here is the non-square room —
 * a square one passes either way.
 */
import { describe, it, expect } from 'vitest'
import { roomExtents } from '../roomDims'
import type { RoomGeometry } from '@/store/roomStore'

function abcd(a: number, b: number): RoomGeometry {
  return {
    walls: [
      { id: 'A', length: a, elements: [] },
      { id: 'B', length: b, elements: [] },
      { id: 'C', length: a, elements: [] },
      { id: 'D', length: b, elements: [] },
    ],
  }
}

describe('roomExtents', () => {
  it('takes X from wall A and Z from wall B', () => {
    expect(roomExtents(abcd(8000, 5000))).toEqual({ W: 8, D: 5 })
  })

  it('does not transpose a portrait room either', () => {
    expect(roomExtents(abcd(3000, 6000))).toEqual({ W: 3, D: 6 })
  })

  it('ignores the synthetic room fields when walls exist', () => {
    // room.width is wall B and room.length is wall A — passing them swapped
    // (as every caller must) must not change the answer
    expect(roomExtents(abcd(8000, 5000), { W: 5, D: 8 })).toEqual({ W: 8, D: 5 })
  })

  it('falls back when the geometry has no A/B pair', () => {
    const geometry: RoomGeometry = { walls: [] }
    expect(roomExtents(geometry, { W: 7, D: 2 })).toEqual({ W: 7, D: 2 })
    expect(roomExtents(geometry)).toEqual({ W: 4, D: 3 })
  })

  it('uses the polygon bounding box for N-wall rooms', () => {
    const geometry: RoomGeometry = {
      walls: [
        { id: 'W1', length: 3000, elements: [] },
        { id: 'W2', length: 2000, elements: [] },
        { id: 'W3', length: 3000, elements: [] },
        { id: 'W4', length: 1000, elements: [] },
        { id: 'W5', length: 1000, elements: [] },
      ],
      vertices: [
        [0, 0],
        [4000, 0],
        [4000, 2500],
        [0, 2500],
      ],
    }
    expect(roomExtents(geometry)).toEqual({ W: 4, D: 2.5 })
  })

  it('rejects degenerate wall lengths instead of collapsing the room', () => {
    expect(roomExtents(abcd(0, 5000), { W: 6, D: 5 })).toEqual({ W: 6, D: 5 })
  })
})
