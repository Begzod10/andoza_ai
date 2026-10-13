/**
 * Resizing a room by moving one wall (the user's request: "edit room size ...
 * like realtime wall moving and showing dimension that are changing"). The
 * opposite wall stays put; openings on the moved wall go with it, openings on
 * the side walls stay where they are in the room; it never shrinks past an
 * opening (trim included) or below 1 m.
 */
import { describe, expect, it } from 'vitest'
import { resizeGeometry, minSizeMm, resizeBox } from '@/lib/resizeRoom'
import type { RoomBox } from '@/lib/slideRoom'
import type { RoomGeometry, WallElement } from '@/store/roomStore'

const el = (id: string, position: number, extra: Partial<WallElement> = {}): WallElement =>
  ({ id, type: 'eshik', width: 900, height: 2100, sill_height: 0, position, positionAuto: false, ...extra })
// A at −z and C at +z run along x (length W); B at +x and D at −x along z (D).
const room = (): RoomGeometry => ({
  walls: [
    { id: 'A', length: 4000, elements: [el('a1', 2800)] },
    { id: 'B', length: 3000, elements: [el('b1', 1000)] },
    { id: 'C', length: 4000, elements: [] },
    { id: 'D', length: 3000, elements: [el('d1', 300)] },
  ],
  vertices: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]],
})
const wall = (g: RoomGeometry, id: string) => g.walls.find((w) => w.id === id)!

describe('resizeGeometry', () => {
  it('moving B (+x) out: the room widens east, side-wall openings stay', () => {
    const r = resizeGeometry(room(), 'B', 4500)
    expect(wall(r.geometry, 'A').length).toBe(4500)
    expect(wall(r.geometry, 'C').length).toBe(4500)
    expect(wall(r.geometry, 'A').elements[0].position).toBe(2800)
    expect(wall(r.geometry, 'B').elements[0].position).toBe(1000)
    expect(r.geometry.vertices).toEqual([[0, 0], [4500, 0], [4500, 3000], [0, 3000]])
    expect(r.shiftM).toEqual({ dx: 0.25, dz: 0 })
  })

  it('moving D (−x) out: walls A and C grow at their start, so their openings shift to stay put', () => {
    const r = resizeGeometry(room(), 'D', 4500)
    expect(wall(r.geometry, 'A').elements[0].position).toBe(3300)
    expect(wall(r.geometry, 'D').elements[0].position).toBe(300)
    expect(r.shiftM).toEqual({ dx: -0.25, dz: 0 })
  })

  it('moving C (+z) and A (−z) change the depth the same way', () => {
    const c = resizeGeometry(room(), 'C', 3600)
    expect(wall(c.geometry, 'B').length).toBe(3600)
    expect(wall(c.geometry, 'B').elements[0].position).toBe(1000)
    expect(c.shiftM).toEqual({ dx: 0, dz: 0.3 })
    const a = resizeGeometry(room(), 'A', 3600)
    expect(wall(a.geometry, 'B').elements[0].position).toBe(1600)
    expect(wall(a.geometry, 'D').elements[0].position).toBe(900)
    expect(a.shiftM).toEqual({ dx: 0, dz: -0.3 })
  })

  it('pins an auto-placed opening where it was drawn before moving the wall', () => {
    const g = room()
    g.walls[0].elements = [el('auto', 0, { positionAuto: true })]
    const r = resizeGeometry(g, 'D', 5000)
    // Drawn centred on the 4 m wall at 1550; the wall grew 1 m at its start.
    expect(wall(r.geometry, 'A').elements[0]).toMatchObject({ position: 2550, positionAuto: false })
  })
})

describe('minSizeMm', () => {
  it('stops short of a side-wall opening, trim included', () => {
    // A's door ends at 3700; pulling B in may not pass 3700 + 70.
    expect(minSizeMm(room(), 'B')).toBe(3770)
    // From the other side it may come in until 70 mm before the door's start.
    expect(minSizeMm(room(), 'D')).toBe(4000 - (2800 - 70))
  })

  it('never goes below a metre', () => {
    const g: RoomGeometry = { ...room(), walls: room().walls.map((w) => ({ ...w, elements: [] })) }
    expect(minSizeMm(g, 'B')).toBe(1000)
  })
})

describe('resizeBox', () => {
  const me: RoomBox = { id: 'a', cx: 0, cz: 0, w: 4, d: 3 }
  const east: RoomBox = { id: 'b', cx: 3.95, cz: 0, w: 3.5, d: 3 }
  it('moves the one edge, the opposite edge stays', () => {
    const b = resizeBox(me, 'B', 1.5, [], { minM: 1 })!
    expect(b.w).toBeCloseTo(3.5)
    expect(b.cx - b.w / 2).toBeCloseTo(-2)
  })

  it('stops at contact with a neighbour', () => {
    const b = resizeBox(me, 'B', 10, [east], { minM: 1 })!
    expect(b.cx + b.w / 2).toBeCloseTo(2.2)
  })

  it('stays within 500 mm of the nearest room when shrinking away from it', () => {
    const b = resizeBox(me, 'B', 0, [east], { minM: 1, snap: false })!
    expect(2.2 - (b.cx + b.w / 2)).toBeCloseTo(0.5)
  })

  it('keeps the minimum size', () => {
    expect(resizeBox(me, 'B', -5, [], { minM: 1.2 })!.w).toBeCloseTo(1.2)
  })

  it('snaps to whole centimetres while dragging', () => {
    const b = resizeBox(me, 'B', 1.234, [], { minM: 1 })!
    expect(b.cx + b.w / 2).toBeCloseTo(1.23)
  })
})
