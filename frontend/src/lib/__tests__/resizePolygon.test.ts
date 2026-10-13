/**
 * "make L shaped room resize like others": any wall of a right-angled
 * polygon room moves straight in or out, its two neighbouring walls follow,
 * and everything in the room stays where it is in the flat.
 */
import { describe, expect, it } from 'vitest'
import { moveEdge, isRectilinear, polygonCentre } from '@/lib/resizePolygon'
import type { RoomGeometry, WallElement } from '@/store/roomStore'

const door = (position: number): WallElement => ({ id: 'd', type: 'eshik', width: 900, height: 2100, sill_height: 0, position, positionAuto: false })
// An L: x 0 … 4, z 0 … 3, with x 3 … 4, z 0 … 1.5 taken out (mm).
const L = (els: Record<number, WallElement[]> = {}): RoomGeometry => {
  const v: [number, number][] = [[0, 0], [3000, 0], [3000, 1500], [4000, 1500], [4000, 3000], [0, 3000]]
  return {
    vertices: v,
    walls: v.map((p, i) => {
      const q = v[(i + 1) % v.length]
      return { id: `W${i + 1}`, length: Math.hypot(q[0] - p[0], q[1] - p[1]), elements: els[i] ?? [] }
    }),
  }
}

describe('moveEdge', () => {
  it('knows a right-angled polygon', () => {
    expect(isRectilinear(L())).toBe(true)
  })

  it('moves a wall out: it keeps its length, its neighbours stretch', () => {
    // W4 runs x 4000, z 1500 → 3000 — the east end of the L's wide part.
    const r = moveEdge(L(), 3, 500)!
    expect(r.geometry.walls[3].length).toBe(1500)
    expect(r.geometry.walls[2].length).toBe(1500) // W3: 3000 → 4500
    expect(r.geometry.walls[4].length).toBe(4500) // W5: 4000 → 4500
  })

  it('reports how far the room\'s origin moved, so the rest of the room can stay put', () => {
    const before = polygonCentre(L())
    const r = moveEdge(L(), 3, 500)!
    const after = polygonCentre(r.geometry)
    // In the room's own frame the outline only grew east; the centre's move
    // in the flat is the mean of the vertices that moved.
    expect(r.shiftM.dx).toBeCloseTo((after.x - before.x) / 1000 + (r.rebaseMm.x / 1000))
    expect(r.shiftM.dx).toBeCloseTo(2 * 0.5 / 6)
    expect(r.shiftM.dz).toBeCloseTo(0)
  })

  it('keeps an opening on the wall after it where it is', () => {
    // W5 runs from (4000, 3000) to (0, 3000): its start moves 500 east, so a
    // door 1000 from its start must sit 1500 from the new start.
    const r = moveEdge(L({ 4: [door(1000)] }), 3, 500)!
    expect(r.geometry.walls[4].elements[0].position).toBe(1500)
  })

  it('will not shrink a wall below an opening on it, nor turn the room inside out', () => {
    // W3 (3000, 1500 → 4000, 1500) carries a door 50 mm from its start;
    // pulling W4 in by 200 leaves W3 800 long — too short for it.
    expect(moveEdge(L({ 2: [door(50)] }), 3, -200)).toBeNull()
    // Pulling W4 in past W2 would turn the room inside out.
    expect(moveEdge(L(), 3, -1200)).toBeNull()
  })
})
