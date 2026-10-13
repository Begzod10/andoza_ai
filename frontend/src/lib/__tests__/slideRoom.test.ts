/**
 * "make room move along the wall of the neighbourhood room because ... not
 * always room is located on the same line" — option 1: a room slides along
 * the neighbour wall it stands against, keeping its gap; it cannot drift off
 * the neighbour or into another room, and it snaps flush or centred.
 */
import { describe, expect, it } from 'vitest'
import { slideAxisAgainst, slideTo, slideEdges, type RoomBox } from '@/lib/slideRoom'

// The user's flat: a 4 x 3 room, a 3.5 x 3 room 200 mm east of it, and a
// third room well away to the south.
const owner: RoomBox = { id: 'a', cx: 0, cz: 0, w: 4, d: 3 }
const east: RoomBox = { id: 'b', cx: 3.95, cz: 0, w: 3.5, d: 3 }
const far: RoomBox = { id: 'c', cx: 0, cz: 8, w: 4, d: 3 }

describe('slideAxisAgainst', () => {
  it('finds the neighbour a room stands against and slides along their shared wall', () => {
    const s = slideAxisAgainst(east, [owner, far])!
    expect(s.neighbour.id).toBe('a')
    // Side by side in x, so the shared wall runs along z.
    expect(s.axis).toBe('z')
  })

  it('works the other way round for rooms one behind the other', () => {
    const south: RoomBox = { id: 's', cx: 0.5, cz: 3.2, w: 3, d: 3 }
    expect(slideAxisAgainst(south, [owner])!.axis).toBe('x')
  })

  it('offers nothing for a room standing on its own', () => {
    expect(slideAxisAgainst(far, [owner, east])).toBeNull()
  })
})

describe('slideTo', () => {
  const s = slideAxisAgainst(east, [owner, far])!
  it('moves along the wall only, keeping the gap', () => {
    const p = slideTo(east, s, 0.8, [owner, far])
    expect(p).toEqual({ cx: 3.95, cz: 0.8 })
  })

  it('stays touching the neighbour, by at least 300 mm', () => {
    // owner spans z −1.5 … 1.5; east is 3 deep, so its centre may go to
    // 1.5 + 1.5 − 0.3 = 2.7 at most.
    expect(slideTo(east, s, 10, [owner, far]).cz).toBeCloseTo(2.7)
    expect(slideTo(east, s, -10, [owner, far]).cz).toBeCloseTo(-2.7)
  })

  it('snaps flush and centred when close', () => {
    const tall: RoomBox = { ...east, d: 2 }
    const st = slideAxisAgainst(tall, [owner])!
    // Flush with the owner's −z end: centre at −1.5 + 1 = −0.5.
    expect(slideTo(tall, st, -0.45, [owner]).cz).toBeCloseTo(-0.5)
    // Centred.
    expect(slideTo(tall, st, 0.06, [owner]).cz).toBeCloseTo(0)
    // Flush with the +z end: 1.5 − 1 = 0.5.
    expect(slideTo(tall, st, 0.58, [owner]).cz).toBeCloseTo(0.5)
    // Not close to anything: left where it was put.
    expect(slideTo(tall, st, 0.25, [owner]).cz).toBeCloseTo(0.25)
  })

  it('puts a typed figure exactly where it says, without snapping', () => {
    const tall: RoomBox = { ...east, d: 2 }
    const st = slideAxisAgainst(tall, [owner])!
    // 50 mm off centre: a drag would snap it back, a typed 300 mm must not.
    expect(slideTo(tall, st, 0.05, [owner], { snap: false }).cz).toBeCloseTo(0.05)
  })

  it('will not slide into a third room', () => {
    // A room just south of the east room's path.
    const blocker: RoomBox = { id: 'x', cx: 3.95, cz: 3.4, w: 3.5, d: 2 }
    const p = slideTo(east, s, 1.5, [owner, blocker])
    expect(p).toBeNull()
  })
})

describe('slideEdges', () => {
  it('measures the two ends against the neighbour, in millimetres', () => {
    const tall: RoomBox = { ...east, d: 2, cz: 0.25 }
    const st = slideAxisAgainst(tall, [owner])!
    // tall spans z −0.75 … 1.25; owner −1.5 … 1.5.
    expect(slideEdges(tall, st)).toEqual({ startMm: 750, endMm: 250 })
  })
})
