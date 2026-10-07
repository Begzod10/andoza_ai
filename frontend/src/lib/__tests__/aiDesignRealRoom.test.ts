/**
 * A real scanned room, as it is stored: four walls called "0".."3" (not A-D), turned about 29 degrees,
 * 5.7 x 3.85 m. The first AI design applied to it piled the sofa, table and rug on top of one another,
 * because wall names A-D meant nothing there and every piece fell back to "next to the middle".
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useRoomStore } from '@/store/roomStore'
import type { RoomGeometry } from '@/store/roomStore'
import type { AiDesignPlan, CatalogFurniture } from '@/lib/api'
import { ALL_PARTS, applyDesignPlan } from '../aiDesign'

const REAL: RoomGeometry = {
  walls: [
    { id: '0', length: 5700, elements: [] }, { id: '1', length: 3850, elements: [] },
    { id: '2', length: 5700, elements: [] }, { id: '3', length: 3850, elements: [] },
  ],
  vertices: [[0, 2661], [5041, 0], [6838, 3405], [1797, 6065]],
} as unknown as RoomGeometry

const item = (id: string, w: number, d: number): CatalogFurniture => ({
  id, name_uz: id, category: id, store_id: null, store_name: null, room_type: null, placement: 'pol',
  price_uzs: null, glb_url: 'x.glb', thumbnail_url: null, footprint_w: w, footprint_d: d,
})
// The real catalog's sizes, centimetres.
const catalog = [item('divan', 258, 108), item('kreslo', 72, 71), item('stol', 152, 91), item('gilam', 218, 299)]

type Pt = [number, number]
const centroid = (vs: number[][]): Pt => [vs.reduce((s, v) => s + v[0], 0) / vs.length, vs.reduce((s, v) => s + v[1], 0) / vs.length]
const WORLD: Pt[] = (() => {
  const [cx, cz] = centroid(REAL.vertices as unknown as number[][])
  return (REAL.vertices as unknown as number[][]).map(([x, z]) => [(x - cx) / 1000, (z - cz) / 1000] as Pt)
})()

function corners(f: { x: number; y: number; rotation: number; furniture_id: string }): Pt[] {
  const c = catalog.find((i) => i.id === f.furniture_id)!
  const w = c.footprint_w! / 100, d = c.footprint_d! / 100
  const cx = f.x / 1000, cz = f.y / 1000
  const fx = Math.sin(f.rotation), fz = Math.cos(f.rotation) // front
  const rx = Math.cos(f.rotation), rz = -Math.sin(f.rotation) // along the width
  return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => [cx + rx * w / 2 * a + fx * d / 2 * b, cz + rz * w / 2 * a + fz * d / 2 * b] as Pt)
}
function inPolygon([x, z]: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j]
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}
/** Separating-axis test for two convex quadrilaterals. */
function intersect(a: Pt[], b: Pt[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < 4; i++) {
      const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % 4]
      const ax = -(z2 - z1), az = x2 - x1
      const proj = (p: Pt[]) => p.map(([x, z]) => x * ax + z * az)
      const pa = proj(a), pb = proj(b)
      if (Math.max(...pa) < Math.min(...pb) - 1e-9 || Math.max(...pb) < Math.min(...pa) - 1e-9) return false
    }
  }
  return true
}

const plan = (): AiDesignPlan => ({
  title: 'T', summary: 's', warnings: [], walls: {}, floor: null, lights: [],
  furniture: [
    { id: 'gilam', name: 'Gilam', zone: 'center' }, { id: 'stol', name: 'Stol', zone: 'center' },
    { id: 'divan', name: 'Divan', zone: 'wall_0' }, { id: 'kreslo', name: 'Kreslo', zone: 'corner_0_1' },
    { id: 'kreslo', name: 'Kreslo', zone: 'corner_1_2' },
  ],
})

beforeEach(() => {
  useRoomStore.getState().resetRoom()
  useRoomStore.setState({ geometry: REAL, lights: [], furniture: [] })
})

describe('an AI design in the real scanned room', () => {
  it('places every piece wholly inside the room', () => {
    applyDesignPlan(plan(), ALL_PARTS, catalog)
    for (const f of useRoomStore.getState().furniture) {
      for (const p of corners(f)) expect(inPolygon(p, WORLD)).toBe(true)
    }
  })

  it('leaves no two solid pieces on top of one another (the rug lies under the table)', () => {
    applyDesignPlan(plan(), ALL_PARTS, catalog)
    const solid = useRoomStore.getState().furniture.filter((f) => f.furniture_id !== 'gilam')
    expect(solid).toHaveLength(4)
    for (let i = 0; i < solid.length; i++) {
      for (let j = i + 1; j < solid.length; j++) {
        expect(intersect(corners(solid[i]), corners(solid[j]))).toBe(false)
      }
    }
  })

  it('stands the sofa with its back against wall 0 and its front into the room', () => {
    applyDesignPlan(plan(), ALL_PARTS, catalog)
    const sofa = useRoomStore.getState().furniture.find((f) => f.furniture_id === 'divan')!
    const wall = { a: WORLD[0], b: WORLD[1] } // wall "0" runs from vertex 0 to vertex 1
    const [ex, ez] = [wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]]
    const len = Math.hypot(ex, ez)
    // Distance of the sofa's centre from the wall line: half its depth plus the gap.
    const dist = Math.abs(((sofa.x / 1000 - wall.a[0]) * -ez + (sofa.y / 1000 - wall.a[1]) * ex) / len)
    expect(dist).toBeCloseTo(1.08 / 2 + 0.04, 1)
    // Its front points away from the wall, toward the middle of the room.
    const front: Pt = [Math.sin(sofa.rotation), Math.cos(sofa.rotation)]
    const toMiddle: Pt = [-sofa.x, -sofa.y]
    expect(front[0] * toMiddle[0] + front[1] * toMiddle[1]).toBeGreaterThan(0)
  })

  it('puts the corner armchairs near their corners, not in the middle', () => {
    applyDesignPlan(plan(), ALL_PARTS, catalog)
    const chairs = useRoomStore.getState().furniture.filter((f) => f.furniture_id === 'kreslo')
    expect(chairs).toHaveLength(2)
    for (const c of chairs) expect(Math.hypot(c.x, c.y)).toBeGreaterThan(1500)
  })
})
