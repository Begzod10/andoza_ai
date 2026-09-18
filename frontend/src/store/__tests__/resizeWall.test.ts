import { describe, it, expect } from 'vitest'
import { resizeWall, computeFloorArea, type RoomGeometry } from '@/store/roomStore'

const rect: RoomGeometry = {
  walls: [
    { id: 'A', length: 4000, elements: [] },
    { id: 'B', length: 3000, elements: [] },
    { id: 'C', length: 4000, elements: [] },
    { id: 'D', length: 3000, elements: [] },
  ],
  vertices: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]],
}

/** 5-wall LiDAR polygon, shaped like the real scan (mm). */
const polygon: RoomGeometry = {
  walls: [
    { id: '0', length: 6000, elements: [] },
    { id: '1', length: 5000, elements: [] },
    { id: '2', length: 5000, elements: [] },
    { id: '3', length: 1000, elements: [] },
    { id: '4', length: 4123, elements: [] },
  ],
  vertices: [[0, 0], [6000, 0], [6000, 5000], [1000, 5000], [0, 4000]],
}

describe('resizeWall', () => {
  it('writes the length on a legacy ABCD rectangle and drops its stale vertices', () => {
    const out = resizeWall(rect, 'A', 5000)
    expect(out.walls.find((w) => w.id === 'A')!.length).toBe(5000)
    expect(out.walls.find((w) => w.id === 'C')!.length).toBe(4000) // pairing is the sheet's job
    expect(out.vertices).toBeUndefined()
  })

  it('moves a polygon outline so the rendered shape follows the number', () => {
    const out = resizeWall(polygon, '0', 7000)
    expect(out.walls[0].length).toBeCloseTo(7000, 6)
    expect(out.vertices![0]).toEqual([0, 0])        // start vertex pinned
    expect(out.vertices![1]).toEqual([7000, 0])     // stretched along the edge
    expect(out.vertices![4]).toEqual([0, 4000])     // previous vertex pinned
    // Every edge between the carried vertices keeps its exact length.
    expect(out.walls[1].length).toBeCloseTo(polygon.walls[1].length, 6)
    expect(out.walls[2].length).toBeCloseTo(polygon.walls[2].length, 6)
    expect(computeFloorArea(out)).toBeGreaterThan(computeFloorArea(polygon))
  })

  it('keeps a 4-edge polygon rectangular — opposite edges grow together', () => {
    const poly4: RoomGeometry = {
      walls: ['0', '1', '2', '3'].map((id) => ({ id, length: 0, elements: [] })),
      vertices: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]],
    }
    const out = resizeWall(poly4, '0', 5000)
    expect(out.walls[0].length).toBeCloseTo(5000, 6)
    expect(out.walls[2].length).toBeCloseTo(5000, 6)
    expect(out.walls[1].length).toBeCloseTo(3000, 6)
    expect(out.walls[3].length).toBeCloseTo(3000, 6)
  })

  it('is a no-op for an unknown wall id', () => {
    expect(resizeWall(polygon, 'Z', 9000)).toBe(polygon)
  })
})
