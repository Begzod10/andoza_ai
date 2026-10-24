/**
 * The whole room laid out group by group: the room's main group first, the others after it while
 * they fit and leave the way from the door open, and what did not fit named.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useRoomStore } from '@/store/roomStore'
import type { RoomGeometry, WallElement } from '@/store/roomStore'
import type { AiDesignPlan, CatalogFurniture } from '@/lib/api'
import { ALL_PARTS, applyDesignPlan } from '../aiDesign'
import { overlaps, roomModel, type Rect } from '../aiDesignLayout'
import { chairCount, type Piece } from '../furnitureGroups'
import { layoutFurniture, primaryGroup } from '../furnitureLayout'
import type { FurnitureRole } from '../furnitureRole'

const el = (type: WallElement['type'], width: number, position: number): WallElement =>
  ({ id: `${type}-${position}`, type, width, height: 2000, sill_height: type === 'deraza' ? 900 : 0, position, positionAuto: false }) as WallElement

const box = (W: number, D: number, open: Partial<Record<'A' | 'B' | 'C' | 'D', WallElement[]>> = {}): RoomGeometry => ({
  walls: [
    { id: 'A', length: W, elements: open.A ?? [] }, { id: 'B', length: D, elements: open.B ?? [] },
    { id: 'C', length: W, elements: open.C ?? [] }, { id: 'D', length: D, elements: open.D ?? [] },
  ],
}) as RoomGeometry

const item = (id: string, name: string, category: string, w: number | null, d: number | null): CatalogFurniture => ({
  id, name_uz: name, category, store_id: null, store_name: null, room_type: null, placement: 'pol',
  price_uzs: null, glb_url: 'x.glb', thumbnail_url: null, footprint_w: w, footprint_d: d,
})
const CATALOG = [
  item('sofa', 'Divan', 'divan', 230, 95), item('table', 'Ovqat stoli', 'stol', 140, 80), item('chair', 'Stul', 'stul', 45, 50),
  item('mystery', 'Noma\'lum', 'dekor', null, null),
]
const plan = (furniture: AiDesignPlan['furniture']): AiDesignPlan => ({
  title: 't', summary: '', warnings: [], walls: {}, floor: null, lights: [], furniture,
})
const sizeOf = (id: string) => {
  const c = CATALOG.find((i) => i.id === id)
  return c?.footprint_w && c.footprint_d ? { w: c.footprint_w / 100, d: c.footprint_d / 100 } : { w: 0.9, d: 0.7 }
}
const rectOf = (f: { x: number; y: number; rotation: number; furniture_id: string }): Rect =>
  ({ x: f.x / 1000, z: f.y / 1000, ...sizeOf(f.furniture_id), rotation: f.rotation })

const piece = (id: string, role: FurnitureRole, w: number, d: number): Piece => ({ id, name: id, role, w, d, tall: false })

beforeEach(() => {
  useRoomStore.getState().resetRoom()
  useRoomStore.setState({ lights: [], furniture: [] })
})

describe('primaryGroup', () => {
  it('follows the room type', () => {
    expect(primaryGroup('mehmonxona', ['bed', 'dining_table'])).toBe('lounge')
    expect(primaryGroup('oshxona', [])).toBe('dining')
    expect(primaryGroup('yotoqxona', [])).toBe('sleep')
  })

  it('without a room type, takes the main piece of the plan: a bed before a sofa, a table, a desk', () => {
    expect(primaryGroup(undefined, ['desk', 'bed'])).toBe('sleep')
    expect(primaryGroup(undefined, ['dining_table'])).toBe('dining')
    expect(primaryGroup('boshqa', ['desk', 'sofa'])).toBe('lounge')
    expect(primaryGroup(undefined, ['desk'])).toBe('work')
  })
})

describe('layoutFurniture', () => {
  it('a tiny room keeps the sofa and leaves the whole dining set out, naming the table and its chairs', () => {
    const model = roomModel(box(2400, 2200, { B: [el('eshik', 800, 100)] }))
    const pieces = [piece('Divan', 'sofa', 2.3, 0.95), piece('Ovqat stoli', 'dining_table', 1.4, 0.8), piece('Stul', 'dining_chair', 0.45, 0.5)]
    const { placed, dropped } = layoutFurniture(pieces, model, 'mehmonxona', [])
    expect(placed.map((p) => p.piece.role)).toEqual(['sofa'])
    expect(dropped).toEqual([{ name: 'Ovqat stoli', count: 1 }, { name: 'Stul', count: chairCount(1.4) }])
  })

  it('a dining table is never left standing without chairs', () => {
    const model = roomModel(box(2400, 2200, { B: [el('eshik', 800, 100)] }))
    const { placed } = layoutFurniture(
      [piece('Divan', 'sofa', 2.3, 0.95), piece('Ovqat stoli', 'dining_table', 1.4, 0.8), piece('Stul', 'dining_chair', 0.45, 0.5)],
      model, 'mehmonxona', [],
    )
    expect(placed.some((p) => p.piece.role === 'dining_table')).toBe(false)
  })

  it('the rug lies last, under the middle of the main group, turned with its anchor', () => {
    const model = roomModel(box(4500, 3200, { A: [el('eshik', 900, 500)] }))
    const { placed } = layoutFurniture(
      [piece('Gilam', 'rug', 2.0, 1.4), piece('Divan', 'sofa', 2.3, 0.95), piece('Jurnal stoli', 'coffee_table', 1.1, 0.6)],
      model, 'mehmonxona', [],
    )
    const rug = placed[placed.length - 1]
    expect(rug.piece.role).toBe('rug')
    const lounge = placed.filter((p) => p.piece.role !== 'rug')
    const cx = lounge.reduce((s, p) => s + p.rect.x, 0) / lounge.length, cz = lounge.reduce((s, p) => s + p.rect.z, 0) / lounge.length
    expect(rug.rect.x).toBeCloseTo(cx, 5)
    expect(rug.rect.z).toBeCloseTo(cz, 5)
    expect(rug.rect.rotation).toBeCloseTo(lounge[0].rect.rotation, 5)
  })

  it('a rug too big to lie there whole is moved toward the middle until it is inside the room', () => {
    const model = roomModel(box(4500, 3200, { A: [el('eshik', 900, 500)] }))
    const { placed } = layoutFurniture([piece('Divan', 'sofa', 2.3, 0.95), piece('Gilam', 'rug', 3.0, 2.4)], model, 'mehmonxona', [])
    const rug = placed.find((p) => p.piece.role === 'rug')!
    expect(model.inside(rug.rect)).toBe(true)
  })
})

describe('applyDesignPlan lays the furniture out in groups', () => {
  const living = () => box(4500, 3200, { A: [el('eshik', 900, 500)], C: [el('deraza', 1400, 1550)] })

  it('duplicate dining pieces collapse: a chair listed twice is still one set of chairs round the table', () => {
    useRoomStore.setState({ geometry: living() })
    applyDesignPlan(plan([
      { id: 'table', name: 'Ovqat stoli', role: 'dining_table' },
      { id: 'chair', name: 'Stul', role: 'dining_chair' }, { id: 'chair', name: 'Stul', role: 'dining_chair' },
    ]), ALL_PARTS, CATALOG, 'oshxona')
    const furniture = useRoomStore.getState().furniture
    const chairs = furniture.filter((f) => f.furniture_id === 'chair')
    expect(furniture.filter((f) => f.furniture_id === 'table')).toHaveLength(1)
    expect(chairs.length).toBeGreaterThanOrEqual(2)
    expect(chairs.length).toBeLessThanOrEqual(chairCount(1.4))
    // Each chair is its own piece in the room.
    expect(new Set(chairs.map((c) => c.id)).size).toBe(chairs.length)
  })

  it('a catalog piece with no footprint is laid out as 0.9 x 0.7 and placed', () => {
    useRoomStore.setState({ geometry: living() })
    const applied = applyDesignPlan(plan([{ id: 'mystery', name: 'Noma\'lum', role: 'decor' }]), ALL_PARTS, CATALOG, 'mehmonxona')
    expect(applied.furniture).toBe(1)
    const f = useRoomStore.getState().furniture[0]
    expect(roomModel(living()).inside(rectOf(f))).toBe(true)
  })

  it("the user's own furniture stays where it is and nothing is placed on it", () => {
    useRoomStore.setState({ geometry: living() })
    useRoomStore.getState().placeFurniture({ id: 'mine', furniture_id: 'sofa', x: 0, y: 1100, rotation: Math.PI })
    const mine = { ...useRoomStore.getState().furniture[0] }
    applyDesignPlan(plan([
      { id: 'sofa', name: 'Divan', role: 'sofa' }, { id: 'table', name: 'Ovqat stoli', role: 'dining_table' },
      { id: 'chair', name: 'Stul', role: 'dining_chair' },
    ]), ALL_PARTS, CATALOG, 'mehmonxona')
    const furniture = useRoomStore.getState().furniture
    expect(furniture.find((f) => f.id === 'mine')).toEqual(mine)
    for (const f of furniture.filter((x) => x.id !== 'mine')) expect(overlaps(rectOf(f), rectOf(mine), 0)).toBe(false)
  })

  it('counts what it left out, and skipped is their total', () => {
    useRoomStore.setState({ geometry: box(2400, 2200, { B: [el('eshik', 800, 100)] }) })
    const applied = applyDesignPlan(plan([
      { id: 'sofa', name: 'Divan', role: 'sofa' }, { id: 'table', name: 'Ovqat stoli', role: 'dining_table' },
      { id: 'chair', name: 'Stul', role: 'dining_chair' },
    ]), ALL_PARTS, CATALOG, 'mehmonxona')
    expect(applied.furniture).toBe(1)
    expect(applied.dropped).toEqual([{ name: 'Ovqat stoli', count: 1 }, { name: 'Stul', count: chairCount(1.4) }])
    expect(applied.skipped).toBe(1 + chairCount(1.4))
  })
})
