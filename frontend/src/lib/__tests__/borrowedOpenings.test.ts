/**
 * "this door should work for the wall of another room" — an opening in either
 * face of a partition is an opening in both.
 *
 * Fixtures are the user's real flat (apartment aaa1448a…): room d8b46167 is a
 * 3 × 5.1 m rectangle at layout x = 102.776, room cd0e6ad8 a 3 × 4 m one at
 * x = 105.796, both at z = 65.185 — so d8b4's wall B and cd0e's wall D are 20 mm
 * apart (102.776 + 1.5 + 0.02 = 105.796 − 1.5). Both carry the CCW `vertices`
 * the server's `_normalize_polygon` fills in for every four-wall room, which is
 * what made walls C and D read backwards in the last three bugs.
 *
 * Every expected position below is worked out by hand from the layout, not by
 * the module, and the doors are deliberately OFF-CENTRE and against corners:
 * a door in the dead middle of a wall maps to itself whether or not a wall's
 * direction is mirrored, which is how the last mirroring bug survived.
 */
import { describe, expect, it } from 'vitest'
import {
  linedBorrowedOpeningsOnly,
  MIN_SHARED_LINING_MM,
  neighbourOpenings,
  ownOpeningsOnly,
  wallsAgainst,
  withNeighbourOpenings,
  type PlacedRoom,
} from '@/lib/borrowedOpenings'
import { siblingRoomView } from '@/lib/siblingRoomView'
import type { Room } from '@/lib/api'
import type { RoomGeometry, WallElement } from '@/store/roomStore'

let seq = 0
function door(position: number, width = 900, extra: Partial<WallElement> = {}): WallElement {
  return {
    id: `el${++seq}`, type: 'eshik', width, height: 2100, sill_height: 0,
    position, positionAuto: false, ...extra,
  }
}

/** A legacy rectangle exactly as it comes back from the server: walls A-D in
 *  order, plus the CCW vertex loop (0,0) → (w,0) → (w,d) → (0,d). */
function rect(wMm: number, dMm: number, els: Partial<Record<'A' | 'B' | 'C' | 'D', WallElement[]>> = {}): RoomGeometry {
  return {
    walls: [
      { id: 'A', length: wMm, elements: els.A ?? [] },
      { id: 'B', length: dMm, elements: els.B ?? [] },
      { id: 'C', length: wMm, elements: els.C ?? [] },
      { id: 'D', length: dMm, elements: els.D ?? [] },
    ],
    vertices: [[0, 0], [wMm, 0], [wMm, dMm], [0, dMm]],
  }
}

const place = (id: string, geometry: RoomGeometry, offsetXM: number, offsetZM: number): PlacedRoom =>
  ({ id, geometry, offsetXM, offsetZM })

// The real pair, in the frame of cd0e (the active room, at the origin).
const D8B4_X = 102.776 - 105.796 // −3.02

describe('the real partition between rooms d8b46167 and cd0e6ad8', () => {
  it('cuts d8b4\'s door into cd0e\'s wall D, where it physically is (fails before this module existed)', () => {
    // d8b4 wall B runs along +z from z = −2.55; a door 600 mm along it spans
    // z −1.95 … −1.05. cd0e wall D runs along +z from z = −2.00, so the same
    // door is 50 mm along it.
    const d8b4 = place('d8b4', rect(3000, 5100, { B: [door(600)] }), D8B4_X, 0)
    const cd0e = place('cd0e', rect(3000, 4000), 0, 0)
    const found = neighbourOpenings(cd0e, [d8b4])
    expect(found.borrowed.D).toHaveLength(1)
    expect(found.borrowed.D[0]).toMatchObject({ type: 'eshik', position: 50, width: 900, borrowedFrom: 'd8b4' })
    // The lining spans the real 20 mm gap — floored at the leaf's minimum.
    expect(found.borrowed.D[0].revealDepthMm).toBe(MIN_SHARED_LINING_MM)
    expect(found.dropped).toBe(0)
  })

  it('and the other way round: cd0e\'s door appears in d8b4\'s wall B', () => {
    // cd0e wall D, 3000 mm along (from z = −2.00): spans z 1.00 … 1.90.
    // d8b4 wall B from z = −2.55: 3550 mm along.
    const d8b4 = place('d8b4', rect(3000, 5100), D8B4_X, 0)
    const cd0e = place('cd0e', rect(3000, 4000, { D: [door(3000)] }), 0, 0)
    const found = neighbourOpenings(d8b4, [cd0e])
    expect(found.borrowed.B?.map((e) => e.position)).toEqual([3550])
  })

  it('borrows the two windows the user drew in that partition', () => {
    // From the API: wall B (5.1 m) has 0.9 m windows at centre fractions 0.242
    // and 0.554 → left edges 784 and 2375 mm (apiPositionToStoreMm).
    const d8b4 = place('d8b4', rect(3000, 5100, {
      B: [
        { ...door(784), type: 'deraza', height: 1500, sill_height: 900 },
        { ...door(2375), type: 'deraza', height: 1500, sill_height: 900 },
      ],
    }), D8B4_X, 0)
    const cd0e = place('cd0e', rect(3000, 4000), 0, 0)
    const found = neighbourOpenings(cd0e, [d8b4])
    // 550 mm of d8b4's wall B lies south of cd0e's wall D: 784 − 550, 2375 − 550.
    expect(found.borrowed.D?.map((e) => [e.type, e.position, e.sill_height])).toEqual([
      ['deraza', 234, 900],
      ['deraza', 1825, 900],
    ])
  })
})

describe('every wall of a rectangle, off-centre and hard against a corner', () => {
  // Receiving room R: 3 × 4 m at the origin (walls A z=−2, B x=+1.5, C z=+2,
  // D x=−1.5). A neighbour against each wall, at the three gaps this flat
  // really has (20, 100 and 200 mm), offset ALONG the wall too, so the two
  // walls of each pair do not share an end.
  const R = () => rect(3000, 4000)

  it('wall A (north neighbour, 200 mm, shifted 0.5 m east)', () => {
    // North room 4 × 3 m: centre z = −2 − 0.2 − 1.5 = −3.7, x = +0.5. Its wall C
    // (z = −2.2) runs along +x from x = −1.5. A door 300 mm along it spans
    // x −1.2 … −0.3; R's wall A runs from x = −1.5 → 300 mm. Hard against R's
    // corner: 0 mm along C at x = −1.5 → 0 on A.
    const north = place('n', rect(4000, 3000, { C: [door(300), door(2600, 800)] }), 0.5, -3.7)
    const found = neighbourOpenings(place('r', R(), 0, 0), [north])
    // 2600 along C is x 1.1 … 1.9: overhangs R's east end (1.5) → dropped.
    expect(found.borrowed.A?.map((e) => e.position)).toEqual([300])
    expect(found.dropped).toBe(1)
    expect(found.borrowed.A?.[0].revealDepthMm).toBe(200)
  })

  it('wall A, door flush in the corner', () => {
    const north = place('n', rect(4000, 3000, { C: [door(0)] }), 1.5, -3.7)
    // North wall C starts at x = −0.5; R's wall A at −1.5 → 1000.
    const found = neighbourOpenings(place('r', R(), 0, 0), [north])
    expect(found.borrowed.A?.map((e) => e.position)).toEqual([1000])
    // North wall C now starts at x = +0.5. 1000 along is x 1.5 … 2.4: wholly
    // past R's east end, so not on this partition at all — neither cut nor
    // counted as dropped.
    const past = place('n', rect(4000, 3000, { C: [door(1000)] }), 2.5, -3.7)
    expect(neighbourOpenings(place('r', R(), 0, 0), [past])).toMatchObject({ borrowed: {}, dropped: 0 })
    // 950 along is x 1.45 … 2.35: across the corner → dropped, not slid.
    const across = place('n', rect(4000, 3000, { C: [door(950)] }), 2.5, -3.7)
    expect(neighbourOpenings(place('r', R(), 0, 0), [across])).toMatchObject({ borrowed: {}, dropped: 1 })
    const fits = place('n', rect(4000, 3000, { C: [door(100)] }), 2.5, -3.7)
    // x 0.6 … 1.5 → 2100 on A, its right edge exactly on R's corner.
    expect(neighbourOpenings(place('r', R(), 0, 0), [fits]).borrowed.A?.map((e) => e.position)).toEqual([2100])
  })

  it('wall C (south neighbour, 100 mm, shifted 0.7 m west)', () => {
    // South room 3.5 × 3 m: centre z = 2 + 0.1 + 1.5 = 3.6, x = −0.7. Its wall
    // A (z = 2.1) runs along +x from x = −2.45. Door 1200 along: x −1.25 … −0.35.
    // R's wall C from x = −1.5 → 250.
    const south = place('s', rect(3500, 3000, { A: [door(1200)] }), -0.7, 3.6)
    const found = neighbourOpenings(place('r', R(), 0, 0), [south])
    expect(found.borrowed.C?.map((e) => e.position)).toEqual([250])
    expect(found.borrowed.C?.[0].revealDepthMm).toBe(100)
  })

  it('wall B (east neighbour, 20 mm, shifted 1 m south)', () => {
    // East room 3 × 5 m: centre x = 1.5 + 0.02 + 1.5 = 3.02, z = +1. Its wall D
    // (x = 1.52) runs along +z from z = −1.5. Door 200 along: z −1.3 … −0.4.
    // R's wall B from z = −2 → 700.
    const east = place('e', rect(3000, 5000, { D: [door(200)] }), 3.02, 1)
    const found = neighbourOpenings(place('r', R(), 0, 0), [east])
    expect(found.borrowed.B?.map((e) => e.position)).toEqual([700])
  })

  it('wall D (west neighbour, the real d8b4, 20 mm) — and back again into the neighbour', () => {
    const r = place('r', rect(3000, 4000, { D: [door(3100)] }), 0, 0)
    const west = place('w', rect(3000, 5100, { B: [door(4000, 800)] }), D8B4_X, 0)
    // West's wall B from z = −2.55, 4000 along: z 1.45 … 2.25 → overhangs R's
    // wall D (ends at z = 2) → dropped, not slid.
    const intoR = neighbourOpenings(r, [west])
    expect(intoR.borrowed.D).toBeUndefined()
    expect(intoR.dropped).toBe(1)
    // R's door: 3100 along D from z = −2 → z 1.1 … 2.0, hard in R's corner.
    // West's wall B from −2.55 → 3650.
    // (Against a west room with no door of its own there, or it would be the
    // already-on-both-sides case below.)
    const intoWest = neighbourOpenings(place('w', rect(3000, 5100), D8B4_X, 0), [r])
    expect(intoWest.borrowed.B?.map((e) => e.position)).toEqual([3650])
  })

  it('a corridor\'s width apart is not a partition', () => {
    const far = place('far', rect(3000, 4000, { D: [door(1000)] }), 3.0 + 0.9, 0)
    expect(neighbourOpenings(place('r', R(), 0, 0), [far]).borrowed).toEqual({})
  })

  it('two rooms stacked at one layout position do not borrow from each other', () => {
    // This flat has rooms 446d9751 and cd0e6ad8 both as plain 3 × 4 boxes;
    // stacked, their walls coincide but face the SAME way.
    const twin = place('twin', rect(3000, 4000, { A: [door(500)] }), 0, 0)
    expect(neighbourOpenings(place('r', R(), 0, 0), [twin]).borrowed).toEqual({})
  })
})

describe('a drawn (polygon) room, whose positions run in traversal order', () => {
  it('maps through an edge that runs the decreasing way', () => {
    // A clockwise-drawn 3 × 4 outline, walls "0".."3", centred on its vertex
    // mean. Edge 1 runs (3000,0)→(3000,4000)... reverse it: list the loop
    // (0,0) → (0,4000) → (3000,4000) → (3000,0), so edge 2 runs from
    // (3000,4000) DOWN to (3000,0) — the east wall, position growing toward −z.
    const poly: RoomGeometry = {
      walls: ['0', '1', '2', '3'].map((id) => ({ id, length: id === '0' || id === '2' ? 4000 : 3000, elements: [] })),
      vertices: [[0, 0], [0, 4000], [3000, 4000], [3000, 0]],
    }
    // East neighbour as in the wall-B case: its wall D door at z −1.3 … −0.4.
    const east = place('e', rect(3000, 5000, { D: [door(200)] }), 3.02, 1)
    const found = neighbourOpenings(place('p', poly, 0, 0), [east])
    // Edge 2 starts at z = +2 and runs toward −z: the door's z −0.4 … −1.3 is
    // 2400 … 3300 along it → left edge 2400.
    expect(found.borrowed['2']?.map((e) => e.position)).toEqual([2400])
  })
})

describe('a door that already exists on both sides', () => {
  it('is not cut a second time, and the room\'s own copy gets the partition\'s depth', () => {
    // The sharedOpenings creation path wrote a real copy into the new room.
    const own = door(50)
    const cd0e = place('cd0e', rect(3000, 4000, { D: [own] }), 0, 0)
    const d8b4 = place('d8b4', rect(3000, 5100, { B: [door(600)] }), D8B4_X, 0)
    const found = neighbourOpenings(cd0e, [d8b4])
    expect(found.borrowed).toEqual({})
    expect(found.sharedDepthMm[own.id]).toBe(MIN_SHARED_LINING_MM)
  })

  it('a hand-drawn near-match that merely overlaps is not doubled either', () => {
    const cd0e = place('cd0e', rect(3000, 4000, { D: [door(350)] }), 0, 0)
    const d8b4 = place('d8b4', rect(3000, 5100, { B: [door(600)] }), D8B4_X, 0)
    expect(neighbourOpenings(cd0e, [d8b4]).borrowed).toEqual({})
  })

  it('two stacked neighbours carrying the same door give one hole', () => {
    const cd0e = place('cd0e', rect(3000, 4000), 0, 0)
    const a = place('a', rect(3000, 5100, { B: [door(600)] }), D8B4_X, 0)
    const b = place('b', rect(3000, 5100, { B: [door(600)] }), D8B4_X, 0)
    expect(neighbourOpenings(cd0e, [a, b]).borrowed.D).toHaveLength(1)
  })
})

describe('the geometry a room is rendered from', () => {
  it('does not move the room\'s own auto-placed opening when a borrowed one joins its wall', () => {
    // One auto door on a 4 m wall is drawn centred (1550). Appending a second
    // element unresolved would make resolveElementPositions group the pair.
    const auto = door(0, 900, { positionAuto: true })
    const cd0e = place('cd0e', rect(3000, 4000, { D: [auto] }), 0, 0)
    const d8b4 = place('d8b4', rect(3000, 5100, { B: [door(3600)] }), D8B4_X, 0)
    // 3600 along d8b4's B is z 1.05 … 1.95 → 3050 along cd0e's D.
    const found = neighbourOpenings(cd0e, [d8b4])
    const g = withNeighbourOpenings(cd0e.geometry, found, { lineBorrowed: true })
    const wallD = g.walls.find((w) => w.id === 'D')!
    expect(wallD.elements.map((e) => [e.position, e.positionAuto, !!e.borrowedFrom])).toEqual([
      [1550, false, false],
      [3050, false, true],
    ])
  })

  it('marks borrowed openings bare in a sibling and lined in the active room', () => {
    const cd0e = place('cd0e', rect(3000, 4000), 0, 0)
    const d8b4 = place('d8b4', rect(3000, 5100, { B: [door(600, 900, { hinge: 'left', openAngle: 30 })] }), D8B4_X, 0)
    const found = neighbourOpenings(cd0e, [d8b4])
    const sibling = withNeighbourOpenings(cd0e.geometry, found, { lineBorrowed: false })
    const active = withNeighbourOpenings(cd0e.geometry, found, { lineBorrowed: true })
    expect(sibling.walls[3].elements[0].bare).toBe(true)
    const lined = active.walls[3].elements[0]
    expect(lined.bare).toBeUndefined()
    // Same physical jamb and swing, stated from the other face.
    expect(lined.hinge).toBe('right')
    expect(lined.openAngle).toBe(-30)
    // Editors and the room's own leaves never see it…
    expect(ownOpeningsOnly(active).walls[3].elements).toEqual([])
    // …the active room's scenery leaf layer sees only it.
    expect(linedBorrowedOpeningsOnly(active).walls[3].elements).toHaveLength(1)
    expect(linedBorrowedOpeningsOnly(sibling).walls[3].elements).toHaveLength(0)
  })

  it('is the very same object when there is nothing to borrow', () => {
    const g = rect(3000, 4000)
    expect(withNeighbourOpenings(g, neighbourOpenings(place('x', g, 0, 0), []), { lineBorrowed: true })).toBe(g)
  })

  it('never reaches the stored geometry', () => {
    const g = rect(3000, 4000)
    const before = JSON.stringify(g)
    const d8b4 = place('d8b4', rect(3000, 5100, { B: [door(600)] }), D8B4_X, 0)
    withNeighbourOpenings(g, neighbourOpenings(place('cd0e', g, 0, 0), [d8b4]), { lineBorrowed: true })
    expect(JSON.stringify(g)).toBe(before)
  })
})

describe('from the API, the way the sibling layer gets a room', () => {
  it('borrows through siblingRoomView-converted geometry (metres, centre fractions)', () => {
    // d8b4 as the API sends it: a door centred at fraction 0.2 of wall B
    // (5.1 m) → centre 1020 mm, left edge 570; cd0e's wall D from z = −2.00
    // while d8b4's starts at −2.55 → 20 mm along.
    const apiRoom = {
      id: 'd8b46167', name: 'x', ceiling_h: 2.7, state: {},
      geometry: {
        walls: [
          { id: 'A', length: 3, elements: [] },
          { id: 'B', length: 5.1, elements: [{ type: 'eshik', width: 0.9, height: 2.1, sill_height: 0, position: 0.2 }] },
          { id: 'C', length: 3, elements: [] },
          { id: 'D', length: 5.1, elements: [] },
        ],
        vertices: [[0, 0], [3, 0], [3, 5.1], [0, 5.1]],
      },
    } as unknown as Room
    const view = siblingRoomView(apiRoom, D8B4_X, 0)!
    const found = neighbourOpenings(place('cd0e', rect(3000, 4000), 0, 0), [
      place(view.id, view.geometry, view.offsetXM, view.offsetZM),
    ])
    expect(found.borrowed.D?.map((e) => [e.position, e.id])).toEqual([[20, 'borrowed:d8b46167:d8b46167:B:0']])
  })
})

describe('wallsAgainst', () => {
  it('finds the shared partition of a drawn room too', () => {
    const poly: RoomGeometry = {
      walls: ['0', '1', '2', '3'].map((id) => ({ id, length: 1, elements: [] })),
      vertices: [[0, 0], [0, 4000], [3000, 4000], [3000, 0]],
    }
    const east = place('e', rect(3000, 5000), 3.02, 1)
    expect([...wallsAgainst(place('p', poly, 0, 0), east)]).toEqual(['2'])
    expect([...wallsAgainst(east, place('p', poly, 0, 0))]).toEqual(['D'])
  })
})
