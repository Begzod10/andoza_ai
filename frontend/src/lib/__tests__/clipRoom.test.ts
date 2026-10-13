/**
 * A room whose wall is pushed into its neighbour cuts the neighbour, which
 * keeps the partition offset and changes shape — "rectangular room could
 * change into 6 corner room after another room comes inside it". Doors and
 * windows stay where they are; furniture in the cut-off part moves inside.
 */
import { describe, expect, it } from 'vitest'
import { clipRoom, type RoomContent } from '@/lib/clipRoom'
import type { RoomGeometry, WallElement } from '@/store/roomStore'

const el = (id: string, position: number, extra: Partial<WallElement> = {}): WallElement =>
  ({ id, type: 'eshik', width: 900, height: 2100, sill_height: 0, position, positionAuto: false, ...extra })
const rect = (w: number, d: number, els: Partial<Record<'A' | 'B' | 'C' | 'D', WallElement[]>> = {}): RoomGeometry => ({
  walls: (['A', 'B', 'C', 'D'] as const).map((id) => ({ id, length: id === 'A' || id === 'C' ? w : d, elements: els[id] ?? [] })),
  vertices: [[0, 0], [w, 0], [w, d], [0, d]],
})
// A 4 x 3 room centred at the origin: x −2 … 2, z −1.5 … 1.5.
const room = (els: Parameters<typeof rect>[2] = {}, extra: Partial<RoomContent> = {}): RoomContent =>
  ({ geometry: rect(4000, 3000, els), centre: { x: 0, z: 0 }, ...extra })

describe('clipRoom', () => {
  it('leaves a room the cutter does not reach alone', () => {
    expect(clipRoom(room(), { x0: 3, x1: 5, z0: -1, z1: 1 }).kind).toBe('unchanged')
  })

  it('cuts a corner: a 6-corner room that keeps the rest of its floor', () => {
    // The cutter takes x 1 … 3, z −2 … 0: the +x −z corner.
    const r = clipRoom(room(), { x0: 1, x1: 3, z0: -2, z1: 0 })
    expect(r.kind).toBe('cut')
    if (r.kind !== 'cut') return
    expect(r.content.geometry.walls).toHaveLength(6)
    expect(r.content.geometry.vertices).toHaveLength(6)
    // Floor: 12 m² less the 1 x 1.5 corner.
    const v = r.content.geometry.vertices!
    let a = 0
    for (let i = 0; i < v.length; i++) { const [x1, z1] = v[i]; const [x2, z2] = v[(i + 1) % v.length]; a += x1 * z2 - x2 * z1 }
    expect(Math.abs(a) / 2 / 1e6).toBeCloseTo(12 - 1.5)
  })

  it('takes a whole side as a plain resize, still a rectangle', () => {
    const r = clipRoom(room(), { x0: 1, x1: 3, z0: -2, z1: 2 })
    expect(r.kind).toBe('cut')
    if (r.kind !== 'cut') return
    expect(r.content.geometry.walls.map((w) => w.id)).toEqual(['A', 'B', 'C', 'D'])
    expect(r.content.geometry.walls[0].length).toBe(3000)
    expect(r.content.centre.x).toBeCloseTo(-0.5)
  })

  it('refuses to split a room in two, or to leave a hole', () => {
    expect(clipRoom(room(), { x0: -0.5, x1: 0.5, z0: -2, z1: 2 })).toMatchObject({ kind: 'refused', reason: 'split' })
    expect(clipRoom(room(), { x0: -0.5, x1: 0.5, z0: -0.5, z1: 0.5 })).toMatchObject({ kind: 'refused', reason: 'hole' })
  })

  it('takes a strip that would be left thinner than a metre along with the cut', () => {
    // The corner cut would leave x 1 … 2, z 0.8 … 1.5 — 0.7 m. That strip
    // goes too, so the room is simply shorter: x −2 … 1, still a rectangle.
    // (Refusing instead blocked nearly every cut in the user's tight flat.)
    const r = clipRoom(room(), { x0: 1, x1: 3, z0: -2, z1: 0.8 })
    expect(r.kind).toBe('cut')
    if (r.kind !== 'cut') return
    expect(r.content.geometry.walls.map((w) => w.id)).toEqual(['A', 'B', 'C', 'D'])
    expect(r.content.geometry.walls[0].length).toBe(3000)
  })

  it("takes a sliver beside the cut too, the user's real case", () => {
    // 2 m deep room; the cut leaves 1 cm along one edge.
    const r = clipRoom(room(), { x0: 1, x1: 3, z0: -1.49, z1: 2 })
    expect(r.kind).toBe('cut')
    if (r.kind !== 'cut') return
    expect(r.content.geometry.walls[0].length).toBe(3000)
  })

  it('refuses to cut through a door, trim included', () => {
    // A door on wall A (z −1.5) at x −2 + 2.5 … 3.4 = 0.5 … 1.4.
    expect(clipRoom(room({ A: [el('d', 2500)] }), { x0: 1, x1: 3, z0: -2, z1: 0 }))
      .toMatchObject({ kind: 'refused', reason: 'opening' })
  })

  it('keeps a door where it is on what is left of its wall', () => {
    // Door on wall A at x −1.6 … −0.7; the corner cut starts at x 1.
    const r = clipRoom(room({ A: [el('d', 400)] }), { x0: 1, x1: 3, z0: -2, z1: 0 })
    if (r.kind !== 'cut') throw new Error(r.kind)
    const g = r.content.geometry
    const v = g.vertices!
    const c = r.content.centre
    // Find it and put it back in world coordinates.
    const wall = g.walls.find((w) => w.elements.length)!
    const i = g.walls.indexOf(wall)
    const [x1, z1] = v[i], [x2, z2] = v[(i + 1) % v.length]
    const len = Math.hypot(x2 - x1, z2 - z1)
    const mean = { x: v.reduce((s, p) => s + p[0], 0) / v.length, z: v.reduce((s, p) => s + p[1], 0) / v.length }
    const p = wall.elements[0].position
    const sx = (x1 + (x2 - x1) * (p / len) - mean.x) / 1000 + c.x
    const ex = (x1 + (x2 - x1) * ((p + 900) / len) - mean.x) / 1000 + c.x
    const sz = (z1 - mean.z) / 1000 + c.z
    expect(Math.min(sx, ex)).toBeCloseTo(-1.6)
    expect(Math.max(sx, ex)).toBeCloseTo(-0.7)
    expect(sz).toBeCloseTo(-1.5)
  })

  it('carries the wall finish of the wall each piece came from', () => {
    const designState = { wallCoverings: { ALL: { kind: 'paint' }, A: { kind: 'wallpaper' } } } as unknown as RoomContent['designState']
    const r = clipRoom(room({}, { designState }), { x0: 1, x1: 3, z0: -2, z1: 0 })
    if (r.kind !== 'cut') throw new Error(r.kind)
    const v = r.content.geometry.vertices!
    const ids = r.content.geometry.walls.map((w) => w.id)
    // The piece of wall A is the edge along z = 0 (local) from x 0.
    const aIdx = v.findIndex(([x, z], i) => z === 0 && v[(i + 1) % v.length][1] === 0)
    const covs = r.content.designState!.wallCoverings as Record<string, unknown>
    expect(covs[ids[aIdx]]).toEqual({ kind: 'wallpaper' })
    expect(covs.A).toBeUndefined()
  })

  it('moves furniture out of the part that is cut off, and keeps the rest where it was', () => {
    const furniture = [
      { id: 'in', furniture_id: 'f', x: -1000, y: 1000, rotation: 0 },
      { id: 'cut', furniture_id: 'f', x: 1800, y: -1300, rotation: 0 },
    ]
    const r = clipRoom(room({}, { furniture }), { x0: 1, x1: 3, z0: -2, z1: 0 })
    if (r.kind !== 'cut') throw new Error(r.kind)
    const c = r.content.centre
    const world = (f: { x: number; y: number }) => ({ x: c.x + f.x / 1000, z: c.z + f.y / 1000 })
    const kept = world(r.content.furniture!.find((f) => f.id === 'in')!)
    expect(kept.x).toBeCloseTo(-1)
    expect(kept.z).toBeCloseTo(1)
    const moved = world(r.content.furniture!.find((f) => f.id === 'cut')!)
    const inside = (moved.x < 1 - 0.2 && moved.z > -1.5) || (moved.z > 0 + 0.2 && moved.x < 2)
    expect(inside).toBe(true)
  })
})
