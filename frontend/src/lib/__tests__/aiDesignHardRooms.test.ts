/**
 * The cases a tidy 4 x 3 room hides: a tiny room, an L-shaped one, a request for more pieces than fit.
 * Whatever the room, every piece is placed, inside it, and a door is kept clear if there is any way to.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useRoomStore } from '@/store/roomStore'
import type { RoomGeometry, WallElement } from '@/store/roomStore'
import type { AiDesignPlan, CatalogFurniture } from '@/lib/api'
import { ALL_PARTS, applyDesignPlan } from '../aiDesign'
import { rectBounds, roomModel, type Rect } from '../aiDesignLayout'

const el = (type: WallElement['type'], width: number, position: number): WallElement =>
  ({ id: `${type}-${position}`, type, width, height: 2000, sill_height: type === 'deraza' ? 900 : 0, position, positionAuto: false }) as WallElement

const item = (id: string, w: number, d: number, category: string, placement = 'pol'): CatalogFurniture => ({
  id, name_uz: id, category, store_id: null, store_name: null, room_type: null, placement: placement as CatalogFurniture['placement'],
  price_uzs: null, glb_url: 'x', thumbnail_url: null, footprint_w: w * 100, footprint_d: d * 100,
})
const CATALOG = [
  item('divan', 2.1, 0.9, 'divan'), item('stol', 1.1, 0.6, 'stol'), item('kreslo', 0.9, 0.9, 'kreslo'), item('tv', 1.5, 0.4, 'tv_tumba'),
  item('shkaf', 1.8, 0.6, 'shkaf'), item('karavot', 2.0, 1.6, 'karavot'), item('tumba', 0.5, 0.4, 'tumba'), item('stul', 0.45, 0.45, 'stul'),
]
const plan = (furniture: Array<[string, string]>): AiDesignPlan => ({
  title: 't', summary: '', warnings: [], walls: {}, floor: null, lights: [],
  furniture: furniture.map(([id, zone]) => ({ id, name: id, zone })),
})
const rectOf = (f: { x: number; y: number; rotation: number; furniture_id: string }): Rect => {
  const c = CATALOG.find((i) => i.id === f.furniture_id)!
  return { x: f.x / 1000, z: f.y / 1000, w: c.footprint_w! / 100, d: c.footprint_d! / 100, rotation: f.rotation }
}
const hits = (a: Rect, b: Rect) => { const p = rectBounds(a), q = rectBounds(b); return p.minX < q.maxX - 1e-9 && q.minX < p.maxX - 1e-9 && p.minZ < q.maxZ - 1e-9 && q.minZ < p.maxZ - 1e-9 }

function run(geometry: RoomGeometry, furniture: Array<[string, string]>) {
  useRoomStore.getState().resetRoom()
  useRoomStore.setState({ geometry, lights: [], furniture: [] })
  applyDesignPlan(plan(furniture), ALL_PARTS, CATALOG)
  const model = roomModel(geometry)
  return { placed: useRoomStore.getState().furniture, model, rects: useRoomStore.getState().furniture.map(rectOf) }
}
const doorZones = (m: ReturnType<typeof roomModel>) => m.clear.filter((z) => z.kind === 'door').map((z) => z.rect)

beforeEach(() => useRoomStore.getState().resetRoom())

describe('a tiny room: 2.4 x 2.0 m, door on one wall, window on another', () => {
  const tiny = (): RoomGeometry => ({
    walls: [
      { id: 'A', length: 2400, elements: [el('deraza', 1000, 700)] }, { id: 'B', length: 2000, elements: [el('eshik', 800, 1000)] },
      { id: 'C', length: 2400, elements: [] }, { id: 'D', length: 2000, elements: [] },
    ],
  }) as RoomGeometry

  it('places every piece it is asked for, inside the room', () => {
    const { placed, model, rects } = run(tiny(), [['karavot', 'wall_C'], ['shkaf', 'wall_D'], ['tumba', 'corner_C_D'], ['stul', 'center']])
    expect(placed).toHaveLength(4)
    for (const r of rects) expect(model.inside(r)).toBe(true)
  })

  it('keeps the door clear when there is somewhere else to put the piece', () => {
    const { rects, model } = run(tiny(), [['tv', 'wall_B'], ['stul', 'wall_B']])
    for (const r of rects) for (const z of doorZones(model)) expect(hits(r, z)).toBe(false)
  })

  it('does not lose a piece that cannot fit anywhere', () => {
    const { placed } = run(tiny(), [['karavot', 'wall_C'], ['divan', 'wall_A'], ['divan', 'wall_D'], ['shkaf', 'center']])
    expect(placed).toHaveLength(4)
    for (const f of placed) expect(Number.isFinite(f.x) && Number.isFinite(f.y)).toBe(true)
  })
})

describe('an L-shaped drawn room, door on its first wall', () => {
  // 5 x 4.5 m with a 2.5 x 2 m notch cut out (the same room the layout tests use), walls W1..W6.
  const lshape = (): RoomGeometry => ({
    walls: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6'].map((id, i) => ({ id, length: 3000, elements: i === 0 ? [el('eshik', 900, 800)] : i === 1 ? [el('deraza', 1200, 600)] : [] })),
    vertices: [[0, 0], [5000, 0], [5000, 2500], [2500, 2500], [2500, 4500], [0, 4500]],
  }) as unknown as RoomGeometry

  it('places pieces inside the L, not in the notch', () => {
    const { placed, model, rects } = run(lshape(), [['divan', 'wall_W6'], ['stol', 'center'], ['kreslo', 'corner_W5_W6'], ['tv', 'wall_W4']])
    expect(placed).toHaveLength(4)
    for (const r of rects) expect(model.inside(r)).toBe(true)
  })

  it('knows where the door and window are on a polygon room too', () => {
    const model = roomModel(lshape())
    expect(model.openings.map((o) => [o.wallId, o.kind])).toEqual([['W1', 'door'], ['W2', 'window']])
  })

  it('keeps the door of the L clear', () => {
    const { rects, model } = run(lshape(), [['tv', 'wall_W1'], ['divan', 'wall_W1'], ['kreslo', 'corner_W1_W2']])
    for (const r of rects) for (const z of doorZones(model)) expect(hits(r, z)).toBe(false)
  })
})

describe('more pieces than fit', () => {
  const room = (): RoomGeometry => ({
    walls: [
      { id: 'A', length: 4000, elements: [el('deraza', 1400, 1300)] }, { id: 'B', length: 3000, elements: [el('eshik', 900, 300)] },
      { id: 'C', length: 4000, elements: [] }, { id: 'D', length: 3000, elements: [] },
    ],
  }) as RoomGeometry

  it('places all of eight pieces, and the ones that fit clear of the door do not touch it', () => {
    const asked: Array<[string, string]> = [
      ['divan', 'wall_C'], ['tv', 'wall_B'], ['shkaf', 'wall_D'], ['kreslo', 'corner_A_B'], ['stol', 'center'],
      ['karavot', 'wall_A'], ['tumba', 'corner_C_D'], ['stul', 'wall_B'],
    ]
    const { placed, rects, model } = run(room(), asked)
    expect(placed).toHaveLength(8)
    for (const r of rects) expect(model.inside(r)).toBe(true)
    // the first four fit easily: none of them may stand in the door's swing
    for (const r of rects.slice(0, 4)) for (const z of doorZones(model)) expect(hits(r, z)).toBe(false)
  })

  it('never puts two pieces on top of one another while there is room', () => {
    const { rects } = run(room(), [['divan', 'wall_C'], ['tv', 'wall_B'], ['stol', 'center'], ['shkaf', 'wall_D']])
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(hits(rects[i], rects[j])).toBe(false)
  })
})
