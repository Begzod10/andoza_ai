/**
 * One door, two rooms.
 *
 * Everything that can go wrong here goes wrong quietly and looks fine in a
 * screenshot: the door lands in the new room's FAR wall (a door to nowhere, in
 * a room still sealed off), or at the right fraction of the wrong-length wall
 * (so the two halves of one doorway are metres apart), or mirrored end-for-end
 * on a drawn room whose outline happens to be wound the other way. None of
 * those throw. Hence the arithmetic is pinned here in real millimetres.
 */
import { describe, it, expect } from 'vitest'
import { facingWallIdFor, sharedOpeningsFor, SHARED_OPENING_TYPES } from '../sharedOpenings'
import { newRoomGeometry } from '../newRoomFromWall'
import { apiPositionToStoreMm } from '../wallPositions'
import type { RoomGeometry, WallElement } from '@/store/roomStore'

/** A door on a wall, store units: millimetres, `position` the LEFT edge. */
function door(position: number, width = 900, extra: Partial<WallElement> = {}): WallElement {
  return {
    id: `d${position}`,
    type: 'eshik',
    width,
    height: 2100,
    sill_height: 0,
    position,
    positionAuto: false,
    ...extra,
  }
}

/** A legacy A-B-C-D room, 5 x 4 m, store millimetres. `on` hangs elements on
 *  one wall; the ids follow the convention A/C = width, B/D = depth. */
function legacy(on: Partial<Record<'A' | 'B' | 'C' | 'D', WallElement[]>> = {}): RoomGeometry {
  return {
    walls: [
      { id: 'A', length: 5000, elements: on.A ?? [] },
      { id: 'B', length: 4000, elements: on.B ?? [] },
      { id: 'C', length: 5000, elements: on.C ?? [] },
      { id: 'D', length: 4000, elements: on.D ?? [] },
    ],
  } as unknown as RoomGeometry
}

/** A drawn (polygon) room from mm vertices; wall ids are '0'..'n-1', matching
 *  the edge order `planPolygon` walks them in. */
function drawn(
  verts: [number, number][],
  on: Record<string, WallElement[]> = {},
): RoomGeometry {
  return {
    vertices: verts,
    walls: verts.map((_, i) => ({
      id: String(i),
      length: Math.round(Math.hypot(
        verts[(i + 1) % verts.length][0] - verts[i][0],
        verts[(i + 1) % verts.length][1] - verts[i][1],
      )),
      elements: on[String(i)] ?? [],
    })),
  } as unknown as RoomGeometry
}

/** Undo the API conversion, so an assertion can be written in the same
 *  millimetres the input was written in. */
function leftEdgeMm(fraction: number, facingLenMm: number, widthM: number): number {
  return apiPositionToStoreMm(fraction, facingLenMm, widthM * 1000)
}

describe('facingWallIdFor', () => {
  it('maps the side the room went to, to the wall that faces back', () => {
    // A room placed EAST meets the old room with its WEST wall — getting this
    // the wrong way round puts the door in the far wall of the new room.
    expect(facingWallIdFor('east')).toBe('D')
    expect(facingWallIdFor('west')).toBe('B')
    expect(facingWallIdFor('north')).toBe('C')
    expect(facingWallIdFor('south')).toBe('A')
  })

  it('never answers with the wall on the same side as the new room', () => {
    // A-B-C-D is north-east-south-west, so this is the real failure mode:
    // 'east' → 'B' would be a door into the new room's outer wall.
    expect(facingWallIdFor('east')).not.toBe('B')
    expect(facingWallIdFor('north')).not.toBe('A')
  })
})

describe('sharedOpeningsFor — which wall, in a legacy room', () => {
  for (const [tapped, facing] of [['A', 'C'], ['B', 'D'], ['C', 'A'], ['D', 'B']] as const) {
    it(`a room through wall ${tapped} gets its door in wall ${facing}`, () => {
      const g = legacy({ [tapped]: [door(0, 900, { positionAuto: true })] })
      const out = sharedOpeningsFor(g, tapped, { widthMm: 5000, depthMm: 4000 })!
      expect(out.wallId).toBe(facing)
      expect(out.elements).toHaveLength(1)
      expect(out.dropped).toBe(0)
    })
  }

  it('says nothing about a wall it cannot place', () => {
    expect(sharedOpeningsFor(legacy(), 'Z', { widthMm: 3500, depthMm: 3000 })).toBeNull()
  })

  it('returns an empty list, not null, for a blank wall', () => {
    const out = sharedOpeningsFor(legacy(), 'B', { widthMm: 3500, depthMm: 3000 })!
    expect(out.elements).toEqual([])
    expect(out.dropped).toBe(0)
  })
})

describe('sharedOpeningsFor — where along the wall', () => {
  it('centres a centred door, whatever the two walls measure', () => {
    // The one case fractions get right by accident, which is why the rest of
    // this block exists. An auto-placed door renders centred and still reads
    // position 0 until it is resolved.
    const g = legacy({ B: [door(0, 900, { positionAuto: true })] })
    const out = sharedOpeningsFor(g, 'B', { widthMm: 3500, depthMm: 3000 })!
    expect(out.elements[0].position).toBeCloseTo(0.5, 9)
  })

  it('keeps an off-centre door the same distance from the shared centre', () => {
    // Tapped wall 4000 long, door centred at 1450 — 550 mm toward the
    // position-0 end of the shared centre at 2000. The facing wall is 3000
    // long, so the same door belongs at 1500 - 550 = 950.
    const g = legacy({ B: [door(1000)] })
    const out = sharedOpeningsFor(g, 'B', { widthMm: 3500, depthMm: 3000 })!
    const facingLenMm = 3000
    expect(leftEdgeMm(out.elements[0].position!, facingLenMm, out.elements[0].width))
      .toBeCloseTo(500, 6)
  })

  it('does NOT reuse the fraction — that is the bug this replaces', () => {
    // At fraction 0.3625 of a 4 m wall a door sits 1450 mm along; on a 3 m
    // wall the same fraction is 1087.5 mm — 362 mm away from the doorway it
    // is supposed to be the other half of.
    const g = legacy({ B: [door(1000)] })
    const out = sharedOpeningsFor(g, 'B', { widthMm: 3500, depthMm: 3000 })!
    expect(out.elements[0].position).not.toBeCloseTo(1450 / 4000, 4)
  })

  it('is the identity when the two walls are the same length', () => {
    const g = legacy({ B: [door(1000)] })
    const out = sharedOpeningsFor(g, 'B', { widthMm: 3500, depthMm: 4000 })!
    expect(leftEdgeMm(out.elements[0].position!, 4000, out.elements[0].width))
      .toBeCloseTo(1000, 6)
  })

  it('carries two doors across independently', () => {
    const g = legacy({ B: [door(400), door(2400, 800)] })
    const out = sharedOpeningsFor(g, 'B', { widthMm: 3500, depthMm: 4000 })!
    expect(out.elements).toHaveLength(2)
    expect(leftEdgeMm(out.elements[0].position!, 4000, out.elements[0].width)).toBeCloseTo(400, 6)
    expect(leftEdgeMm(out.elements[1].position!, 4000, out.elements[1].width)).toBeCloseTo(2400, 6)
  })

  it('resolves a pair of auto-placed doors before mapping them', () => {
    // Two unresolved placeholders both read position 0. Mapped raw they would
    // land on top of each other at the start corner instead of either side of
    // the middle, where they are actually drawn.
    const g = legacy({
      B: [door(0, 900, { positionAuto: true }), door(0, 900, { positionAuto: true })],
    })
    const out = sharedOpeningsFor(g, 'B', { widthMm: 3500, depthMm: 4000 })!
    const lefts = out.elements.map((e) => leftEdgeMm(e.position!, 4000, e.width))
    expect(lefts[0]).not.toBeCloseTo(lefts[1], 3)
    // Centred as a pair with the 400 mm gap resolveElementPositions uses.
    expect(lefts[1] - lefts[0]).toBeCloseTo(900 + 400, 3)
  })

  it('reads every side of a legacy room from the right axis', () => {
    // North/south walls run along the WIDTH, east/west along the DEPTH. Taking
    // the wrong one measures the offset against a wall length the door was
    // never placed on.
    const north = sharedOpeningsFor(legacy({ A: [door(1500)] }), 'A',
      { widthMm: 5000, depthMm: 3000 })!
    expect(leftEdgeMm(north.elements[0].position!, 5000, north.elements[0].width))
      .toBeCloseTo(1500, 6)
    const south = sharedOpeningsFor(legacy({ C: [door(1500)] }), 'C',
      { widthMm: 5000, depthMm: 3000 })!
    expect(leftEdgeMm(south.elements[0].position!, 5000, south.elements[0].width))
      .toBeCloseTo(1500, 6)
  })
})

describe('sharedOpeningsFor — a door that will not fit', () => {
  it('drops a door that would hang off the end of a shorter wall', () => {
    // 4 m wall, door hard against the position-0 corner: its centre is 1550 mm
    // off the shared centre, and a 3 m facing wall only reaches 1500.
    const g = legacy({ B: [door(0)] })
    const out = sharedOpeningsFor(g, 'B', { widthMm: 3500, depthMm: 3000 })!
    expect(out.elements).toEqual([])
    expect(out.dropped).toBe(1)
  })

  it('never clamps a door onto the wall instead', () => {
    // Sliding it back would leave the two halves of one doorway in different
    // places, and a doorway cut across a corner cannot be built at all. So
    // nothing is emitted at a position the door was not actually at.
    const g = legacy({ B: [door(0)] })
    const out = sharedOpeningsFor(g, 'B', { widthMm: 3500, depthMm: 3000 })!
    expect(out.elements.length).toBe(0)
  })

  it('keeps the doors that do fit and counts only the ones that do not', () => {
    const g = legacy({ B: [door(0), door(1550)] })
    const out = sharedOpeningsFor(g, 'B', { widthMm: 3500, depthMm: 3000 })!
    expect(out.elements).toHaveLength(1)
    expect(out.dropped).toBe(1)
    expect(out.elements[0].position).toBeCloseTo(0.5, 6)
  })

  it('still takes a door that reaches exactly to the corner', () => {
    // Facing wall 3000, door 900 wide whose centre lands 1050 off the shared
    // centre: left edge 0, flush with the corner. Buildable, so kept — the
    // millimetre of slack is for the fraction round-trip, not for sloppiness.
    const g = legacy({ B: [door(2000 - 1050 - 450)] })
    const out = sharedOpeningsFor(g, 'B', { widthMm: 3500, depthMm: 3000 })!
    expect(out.dropped).toBe(0)
    expect(leftEdgeMm(out.elements[0].position!, 3000, out.elements[0].width)).toBeCloseTo(0, 3)
  })

  it('drops rather than emits when the facing wall is absurdly narrow', () => {
    const g = legacy({ B: [door(1550, 900, { positionAuto: true })] })
    const out = sharedOpeningsFor(g, 'B', { widthMm: 3500, depthMm: 800 })!
    expect(out.elements).toEqual([])
    expect(out.dropped).toBe(1)
  })
})

describe('sharedOpeningsFor — doors only', () => {
  it('copies no windows', () => {
    // A window in that wall was looking OUTSIDE; a room built against it does
    // not turn it into a window between two rooms. Copying it would invent an
    // interior window nobody asked for.
    const window: WallElement = {
      id: 'w', type: 'deraza', width: 1400, height: 1500, sill_height: 900,
      position: 1300, positionAuto: false,
    }
    const out = sharedOpeningsFor(legacy({ B: [window] }), 'B',
      { widthMm: 3500, depthMm: 4000 })!
    expect(out.elements).toEqual([])
    // Not "dropped" either — it was never a candidate, and reporting it would
    // make a caller tell the user a door went missing.
    expect(out.dropped).toBe(0)
  })

  it('copies no balcony openings', () => {
    const balcony: WallElement = {
      id: 'b', type: 'balkon', width: 1800, height: 2100, sill_height: 0,
      position: 1100, positionAuto: false,
    }
    const out = sharedOpeningsFor(legacy({ B: [balcony] }), 'B',
      { widthMm: 3500, depthMm: 4000 })!
    expect(out.elements).toEqual([])
    expect(out.dropped).toBe(0)
  })

  it('takes the door out of a wall that also has a window', () => {
    const window: WallElement = {
      id: 'w', type: 'deraza', width: 1000, height: 1500, sill_height: 900,
      position: 2600, positionAuto: false,
    }
    const out = sharedOpeningsFor(legacy({ B: [door(400), window] }), 'B',
      { widthMm: 3500, depthMm: 4000 })!
    expect(out.elements.map((e) => e.type)).toEqual(['eshik'])
  })

  it('states its decision as data, so changing it is one line and a test', () => {
    expect([...SHARED_OPENING_TYPES]).toEqual(['eshik'])
  })
})

describe('sharedOpeningsFor — API units', () => {
  it('writes metres, not millimetres', () => {
    const g = legacy({ B: [door(1000, 900, { sill_height: 0 })] })
    const out = sharedOpeningsFor(g, 'B', { widthMm: 3500, depthMm: 4000 })!
    expect(out.elements[0].width).toBeCloseTo(0.9, 9)
    expect(out.elements[0].height).toBeCloseTo(2.1, 9)
  })

  it('writes position as a 0..1 centre fraction of the FACING wall', () => {
    const g = legacy({ B: [door(1000)] })
    const out = sharedOpeningsFor(g, 'B', { widthMm: 3500, depthMm: 3000 })!
    // Centre 950 of 3000.
    expect(out.elements[0].position).toBeCloseTo(950 / 3000, 9)
    expect(out.elements[0].position!).toBeGreaterThanOrEqual(0)
    expect(out.elements[0].position!).toBeLessThanOrEqual(1)
  })

  it('keeps sill height, style and sashes so the two sides match', () => {
    // Without these the new room gets a door of the right size in the right
    // place that is visibly a different door.
    const g = legacy({
      B: [door(1000, 1200, { sill_height: 150, styleId: 'door-glazed-2', sashes: 2 })],
    })
    const out = sharedOpeningsFor(g, 'B', { widthMm: 3500, depthMm: 4000 })!
    expect(out.elements[0].sill_height).toBeCloseTo(0.15, 9)
    expect(out.elements[0].width).toBeCloseTo(1.2, 9)
    expect(out.elements[0].style_id).toBe('door-glazed-2')
    expect(out.elements[0].sashes).toBe(2)
  })

  it('writes nulls rather than undefined for a plain door', () => {
    // The API columns are nullable; `undefined` drops the key, which reads as
    // "unchanged" on some paths rather than "none".
    const out = sharedOpeningsFor(legacy({ B: [door(1000)] }), 'B',
      { widthMm: 3500, depthMm: 4000 })!
    expect(out.elements[0].style_id).toBeNull()
    expect(out.elements[0].sashes).toBeNull()
  })
})

describe('sharedOpeningsFor — drawn rooms', () => {
  // The same 5 x 4 m rectangle, wound the two possible ways. Its east wall is
  // edge '1' one way round and edge '2' the other, and `position` runs from
  // the opposite corner in each — so a door at the same stored position is at
  // opposite ends of the room in the two.
  const CW = drawn([[0, 0], [5000, 0], [5000, 4000], [0, 4000]], { 1: [door(1000)] })
  const CCW = drawn([[0, 0], [0, 4000], [5000, 4000], [5000, 0]], { 2: [door(1000)] })

  it('reads a drawn east wall the same way as a legacy one', () => {
    const out = sharedOpeningsFor(CW, '1', { widthMm: 3500, depthMm: 3000 })!
    expect(out.wallId).toBe('D')
    expect(out.elements[0].position).toBeCloseTo(950 / 3000, 6)
  })

  it('mirrors the door when the outline is wound the other way', () => {
    // Not a cosmetic difference: `position` grows from `vertices[i]`, so the
    // two stored doors are at opposite ends of the same physical wall, and the
    // shared door has to follow. Taking the position at face value would put
    // the new room's door 1.1 m from where the old room's door is.
    const a = sharedOpeningsFor(CW, '1', { widthMm: 3500, depthMm: 4000 })!
    const b = sharedOpeningsFor(CCW, '2', { widthMm: 3500, depthMm: 4000 })!
    const la = leftEdgeMm(a.elements[0].position!, 4000, a.elements[0].width)
    const lb = leftEdgeMm(b.elements[0].position!, 4000, b.elements[0].width)
    expect(la).toBeCloseTo(1000, 3)
    expect(lb).toBeCloseTo(4000 - 1000 - 900, 3)
  })

  it('answers for every wall of an L-shaped room', () => {
    const L = drawn(
      [[0, 0], [6000, 0], [6000, 2000], [2000, 2000], [2000, 6000], [0, 6000]],
      { 0: [door(0, 900, { positionAuto: true })] },
    )
    for (const id of ['0', '1', '2', '3', '4', '5']) {
      const out = sharedOpeningsFor(L, id, { widthMm: 3500, depthMm: 3000 })
      expect(out).not.toBeNull()
      expect(['A', 'B', 'C', 'D']).toContain(out!.wallId)
    }
  })

  it('projects a slanted wall onto the axis the new room is on', () => {
    // The user's own room: a rectangle turned 27.8 degrees. The new room is
    // axis-aligned at a fixed plan coordinate, so the only meaningful offset
    // is the door's distance along that axis — and it must still land inside
    // the facing wall rather than off its end.
    const tilted = drawn(
      [[0, 2661], [5041, 0], [6838, 3405], [1797, 6065]],
      { 1: [door(0, 900, { positionAuto: true })] },
    )
    const out = sharedOpeningsFor(tilted, '1', { widthMm: 3500, depthMm: 3000 })!
    expect(out.dropped).toBe(0)
    // A centred door stays centred however far the wall leans: the projection
    // scales the offset, and the offset is zero.
    expect(out.elements[0].position).toBeCloseTo(0.5, 6)
  })
})

describe('newRoomGeometry carrying the shared door', () => {
  it('puts the openings in the named wall and leaves the other three blank', () => {
    const shared = sharedOpeningsFor(legacy({ B: [door(1000)] }), 'B',
      { widthMm: 3500, depthMm: 4000 })!
    const g = newRoomGeometry(3500, 4000, shared)
    const by = Object.fromEntries(g.walls.map((w) => [w.id, w.elements]))
    expect(by.D).toHaveLength(1)
    expect([by.A, by.B, by.C].every((e) => e.length === 0)).toBe(true)
  })

  it('leaves every wall blank when nothing is shared', () => {
    for (const g of [newRoomGeometry(3500, 3000), newRoomGeometry(3500, 3000, null)]) {
      expect(g.walls.every((w) => w.elements.length === 0)).toBe(true)
    }
  })

  it('gives each wall its own array', () => {
    // One shared `[]` across four walls would let a later push land on every
    // wall of the room at once.
    const g = newRoomGeometry(3500, 3000)
    expect(g.walls[0].elements).not.toBe(g.walls[1].elements)
  })

  it('still reports lengths in metres with the door attached', () => {
    const shared = sharedOpeningsFor(legacy({ B: [door(1000)] }), 'B',
      { widthMm: 3500, depthMm: 4000 })!
    expect(newRoomGeometry(3500, 4000, shared).walls.map((w) => w.length))
      .toEqual([3.5, 4, 3.5, 4])
  })
})
