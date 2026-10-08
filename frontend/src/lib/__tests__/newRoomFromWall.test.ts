/**
 * Adding a room through a wall.
 *
 * Two things here would be wrong in a way that still looks plausible on
 * screen. A wall mapped to the opposite side puts the new room behind the
 * user instead of through the wall they tapped — and the layout arithmetic
 * already caused real overlapping rooms once when a second copy of it drifted
 * from the first, which is why this module exists rather than a third copy.
 */
import { describe, it, expect } from 'vitest'
import {
  wallSideOf, newRoomLayoutPos, newRoomGeometry, clampRoomDimension, isometricRoom,
  NEW_ROOM_DEFAULT_MM, NEW_ROOM_LIMITS_MM, ROOM_LAYOUT_GAP_M,
} from '../newRoomFromWall'
import type { RoomGeometry } from '@/store/roomStore'

/** A 5 x 4 m room as a drawn polygon, vertices clockwise from the origin. */
function polygonRoom(verts: [number, number][]): RoomGeometry {
  return {
    vertices: verts,
    walls: verts.map((_, i) => ({
      id: String(i),
      length: Math.hypot(
        verts[(i + 1) % verts.length][0] - verts[i][0],
        verts[(i + 1) % verts.length][1] - verts[i][1],
      ),
      elements: [],
    })),
  } as unknown as RoomGeometry
}

/** A legacy room: four walls, no outline. */
const LEGACY = {
  walls: [
    { id: 'A', length: 5000, elements: [] },
    { id: 'B', length: 4000, elements: [] },
    { id: 'C', length: 5000, elements: [] },
    { id: 'D', length: 4000, elements: [] },
  ],
} as unknown as RoomGeometry

describe('wallSideOf', () => {
  it('reads all four sides off a plain drawn rectangle', () => {
    // Plan frame: +x east, +z south. Walking 0,0 → 5,0 → 5,4 → 0,4, the edges
    // are the north, east, south and west walls in that order.
    const room = polygonRoom([[0, 0], [5000, 0], [5000, 4000], [0, 4000]])
    expect(wallSideOf(room, '0')).toBe('north')
    expect(wallSideOf(room, '1')).toBe('east')
    expect(wallSideOf(room, '2')).toBe('south')
    expect(wallSideOf(room, '3')).toBe('west')
  })

  it('gives four different answers — never two walls on one side', () => {
    const room = polygonRoom([[0, 0], [5000, 0], [5000, 4000], [0, 4000]])
    const sides = ['0', '1', '2', '3'].map((id) => wallSideOf(room, id))
    expect(new Set(sides).size).toBe(4)
  })

  it('still answers for a room drawn at an angle', () => {
    // The user's own room: a true rectangle turned 27.8 degrees. Each wall
    // leans towards one compass direction, and that is the only answer a
    // four-sided layout model can give.
    const room = polygonRoom([[0, 2661], [5041, 0], [6838, 3405], [1797, 6065]])
    const sides = ['0', '1', '2', '3'].map((id) => wallSideOf(room, id))
    expect(sides.every((s) => s !== null)).toBe(true)
    expect(new Set(sides).size).toBe(4)
  })

  it('falls back to the A-B-C-D convention when there is no outline', () => {
    expect(wallSideOf(LEGACY, 'A')).toBe('north')
    expect(wallSideOf(LEGACY, 'B')).toBe('east')
    expect(wallSideOf(LEGACY, 'C')).toBe('south')
    expect(wallSideOf(LEGACY, 'D')).toBe('west')
  })

  it('says it cannot tell rather than guessing', () => {
    expect(wallSideOf(LEGACY, 'Z')).toBeNull()
    const room = polygonRoom([[0, 0], [5000, 0], [5000, 4000], [0, 4000]])
    expect(wallSideOf(room, 'nope')).toBeNull()
  })
})

describe('newRoomLayoutPos', () => {
  const self = { widthM: 5, depthM: 4 }
  const added = { widthM: 3.5, depthM: 3 }
  const anchor = { x: 0, z: 0 }

  it('puts the new room through the wall, on the far side', () => {
    expect(newRoomLayoutPos(anchor, 'east', self, added).x).toBeGreaterThan(0)
    expect(newRoomLayoutPos(anchor, 'west', self, added).x).toBeLessThan(0)
    expect(newRoomLayoutPos(anchor, 'north', self, added).z).toBeLessThan(0)
    expect(newRoomLayoutPos(anchor, 'south', self, added).z).toBeGreaterThan(0)
  })

  it('leaves the two rooms touching, not overlapping and not gapped', () => {
    // The edges must sit exactly one wall-thickness apart: an overlap is two
    // rooms inside each other, and a real gap reads as a rendering bug.
    const p = newRoomLayoutPos(anchor, 'east', self, added)
    const myEdge = anchor.x + self.widthM / 2
    const theirEdge = p.x - added.widthM / 2
    expect(theirEdge - myEdge).toBeCloseTo(ROOM_LAYOUT_GAP_M, 9)
  })

  it('only ever moves along one axis', () => {
    // The sibling-layout reader decides which side a room is on by whichever
    // axis has the larger offset; moving both would make that ambiguous.
    expect(newRoomLayoutPos(anchor, 'east', self, added).z).toBe(anchor.z)
    expect(newRoomLayoutPos(anchor, 'north', self, added).x).toBe(anchor.x)
  })

  it('measures from wherever this room already sits', () => {
    const away = { x: 12, z: -7 }
    const p = newRoomLayoutPos(away, 'south', self, added)
    expect(p.x).toBe(12)
    expect(p.z).toBeCloseTo(-7 + 2 + ROOM_LAYOUT_GAP_M + 1.5, 9)
  })
})

describe('clampRoomDimension', () => {
  it('keeps a sane number as it is', () => {
    expect(clampRoomDimension(3200, 'width')).toBe(3200)
  })

  it('holds each dimension inside its own limits', () => {
    for (const key of ['width', 'depth', 'height'] as const) {
      const { min, max } = NEW_ROOM_LIMITS_MM[key]
      expect(clampRoomDimension(-999, key)).toBe(min)
      expect(clampRoomDimension(999999, key)).toBe(max)
    }
  })

  it('falls back to the default rather than passing NaN through', () => {
    // An empty or half-typed field parses to NaN, and a NaN wall length
    // reaches the API as null and fails the room create.
    expect(clampRoomDimension(Number.NaN, 'depth')).toBe(NEW_ROOM_DEFAULT_MM.depth)
  })

  it('rounds to the millimetre', () => {
    expect(clampRoomDimension(3200.6, 'width')).toBe(3201)
  })
})

describe('newRoomGeometry', () => {
  it('writes wall lengths in METRES, as the API takes them', () => {
    const g = newRoomGeometry(3500, 3000)
    expect(g.walls.map((w) => w.length)).toEqual([3.5, 3, 3.5, 3])
  })

  it('pairs opposite walls', () => {
    const g = newRoomGeometry(4200, 2800)
    const by = Object.fromEntries(g.walls.map((w) => [w.id, w.length]))
    expect(by.A).toBe(by.C)
    expect(by.B).toBe(by.D)
  })

  it('carries no outline — a plain rectangle is not a drawn room', () => {
    expect('vertices' in newRoomGeometry(3000, 3000)).toBe(false)
  })

  it('clamps before it serialises', () => {
    expect(newRoomGeometry(99999, 10).walls[0].length)
      .toBe(NEW_ROOM_LIMITS_MM.width.max / 1000)
  })
})

describe('isometricRoom', () => {
  const frame = { width: 240, height: 180 }

  it('draws four points per visible face', () => {
    const r = isometricRoom(3500, 3000, 2700, frame)
    for (const face of [r.top, r.left, r.right]) {
      expect(face.split(' ')).toHaveLength(4)
    }
  })

  it('stays inside the frame at any proportion', () => {
    // A 6 x 2 corridor and a 2 x 6 one must both fit the same little box.
    for (const [w, d, h] of [[6000, 2000, 2700], [2000, 6000, 2700], [3000, 3000, 4500]]) {
      const r = isometricRoom(w, d, h, frame)
      const nums = [r.top, r.left, r.right].join(' ').split(/[ ,]/).map(Number)
      const xs = nums.filter((_, i) => i % 2 === 0)
      const ys = nums.filter((_, i) => i % 2 === 1)
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(-0.1)
      expect(Math.max(...xs)).toBeLessThanOrEqual(frame.width + 0.1)
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(-0.1)
      expect(Math.max(...ys)).toBeLessThanOrEqual(frame.height + 0.1)
    }
  })

  it('shows proportion, not just a cube', () => {
    // The preview's whole job: a long room must LOOK long. The LEFT face is
    // the wall running along the width, so widening the room must grow it
    // relative to the depth wall on the right.
    const span = (points: string) => {
      const xs = points.split(' ').map((p) => Number(p.split(',')[0]))
      return Math.max(...xs) - Math.min(...xs)
    }
    const square = isometricRoom(3000, 3000, 2700, frame)
    const wide = isometricRoom(9000, 3000, 2700, frame)
    expect(span(square.left) / span(square.right)).toBeCloseTo(1, 6)
    expect(span(wide.left) / span(wide.right)).toBeGreaterThan(2.5)
  })

  it('turns the box the other way when the depth is the long side', () => {
    const span = (points: string) => {
      const xs = points.split(' ').map((p) => Number(p.split(',')[0]))
      return Math.max(...xs) - Math.min(...xs)
    }
    const deep = isometricRoom(3000, 9000, 2700, frame)
    expect(span(deep.right) / span(deep.left)).toBeGreaterThan(2.5)
  })

  it('reports a viewBox matching the frame it was given', () => {
    expect(isometricRoom(3000, 3000, 2700, frame).viewBox).toBe('0 0 240 180')
  })

  it('survives a zero or negative dimension mid-typing', () => {
    const r = isometricRoom(0, -5, 2700, frame)
    expect(r.top.split(' ')).toHaveLength(4)
    expect([r.top, r.left, r.right].join(' ')).not.toContain('NaN')
  })
})
