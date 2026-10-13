/**
 * Moving a room on the flat plan with X / Z arrows (the user's option A):
 * along either axis, never into another room, never more than 500 mm from
 * its nearest neighbour; a drag snaps to touching at the wall thickness and
 * to flush / centred on a neighbour.
 */
import { describe, expect, it } from 'vitest'
import { moveAlong, nearestNeighbour, MAX_DETACH_M } from '@/lib/moveRoom'
import type { RoomBox } from '@/lib/slideRoom'

const owner: RoomBox = { id: 'a', cx: 0, cz: 0, w: 4, d: 3 }
// 200 mm east of the owner: x 2.2 … 5.7.
const east: RoomBox = { id: 'b', cx: 3.95, cz: 0, w: 3.5, d: 3 }
const flat = [owner, east]

describe('moveAlong', () => {
  it('moves along the axis asked for and nothing else', () => {
    expect(moveAlong(east, 'z', 0.7, flat)).toEqual({ cx: 3.95, cz: 0.7 })
  })

  it('stops at contact instead of entering the neighbour', () => {
    // Pushed west into the owner: stops with its wall on the owner's (x 2).
    expect(moveAlong(east, 'x', 0, flat, { snap: false })!.cx).toBeCloseTo(2 + 1.75)
  })

  it('comes away from its neighbour by 500 mm at most', () => {
    expect(moveAlong(east, 'x', 10, flat, { snap: false })!.cx).toBeCloseTo(2 + MAX_DETACH_M + 1.75)
    expect(MAX_DETACH_M).toBe(0.5)
  })

  it('snaps to touching at the wall thickness when close', () => {
    // 230 mm gap asked for; the room's walls are 200 mm: snaps to 200.
    expect(moveAlong(east, 'x', 2.23 + 1.75, flat, { wallThicknessM: 0.2 })!.cx).toBeCloseTo(2.2 + 1.75)
  })

  it('snaps flush with the neighbour along the shared wall', () => {
    const short: RoomBox = { ...east, d: 2 }
    // Owner spans z −1.5 … 1.5; flush with its −z end puts the centre at −0.5.
    expect(moveAlong(short, 'z', -0.44, [owner, short])!.cz).toBeCloseTo(-0.5)
  })

  it('does not snap a typed figure', () => {
    expect(moveAlong(east, 'z', 0.05, flat, { snap: false })!.cz).toBeCloseTo(0.05)
  })

  it('cannot go round the end of a neighbour and lose it', () => {
    // Slid 10 m north it would stand alone: it stops 500 mm clear at most.
    const p = moveAlong(east, 'z', -10, flat, { snap: false })!
    const clear = Math.abs(p.cz) - (owner.d / 2 + east.d / 2)
    expect(clear).toBeLessThanOrEqual(MAX_DETACH_M + 1e-6)
  })
})

describe('nearestNeighbour', () => {
  it('names the closest room and the gap to it', () => {
    const n = nearestNeighbour(east, flat)!
    expect(n.room.id).toBe('a')
    expect(n.gapM).toBeCloseTo(0.2)
  })
})

describe('an L-shaped neighbour', () => {
  // After a cut: an L whose outer rectangle is x −2 … 2, z −1.5 … 1.5, with
  // its +x −z corner (x 1 … 2, z −1.5 … 0) gone — and a room sitting in it.
  const L: RoomBox = {
    id: 'L', cx: 0, cz: 0, w: 4, d: 3,
    parts: [
      { id: 'L', cx: -0.5, cz: 0, w: 3, d: 3 },
      { id: 'L', cx: 1.5, cz: 0.75, w: 1, d: 1.5 },
    ],
  }
  const inNotch: RoomBox = { id: 'r', cx: 1.6, cz: -0.85, w: 0.6, d: 0.9 }

  it('is not an obstacle where its corner was cut away', () => {
    const p = moveAlong(inNotch, 'x', 1.7, [L, inNotch], { snap: false })
    expect(p).not.toBeNull()
    expect(p!.cx).toBeCloseTo(1.7)
  })

  it('is measured to its nearest part, not its outer rectangle', () => {
    // x 1.3 … 1.9 against the main part ending at x 1: 0.3 m — the outer
    // rectangle would have said 0.
    expect(nearestNeighbour(inNotch, [L])!.gapM).toBeCloseTo(0.3)
  })
})
