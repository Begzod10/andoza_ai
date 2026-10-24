/**
 * The living room from the screenshot that started this: 4.5 x 3.2 m, the door on one long wall, a
 * window across from it, and a plan asking for a sofa, a dining set, armchairs, a pouf and a wardrobe.
 * The sofa must stand on a wall facing in, nothing may stand on anything else, the way from the door
 * to the sofa must stay open, and whatever did not fit is named in the notice.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import i18n from '@/i18n'
import { useRoomStore } from '@/store/roomStore'
import type { RoomGeometry, WallElement } from '@/store/roomStore'
import type { AiDesignPlan, CatalogFurniture } from '@/lib/api'
import { ALL_PARTS, applyDesignPlan, droppedNotice } from '../aiDesign'
import { overlaps, roomModel, type Rect } from '../aiDesignLayout'
import { doorEntries, walkable } from '../walkway'

const el = (type: WallElement['type'], width: number, position: number): WallElement =>
  ({ id: `${type}-${position}`, type, width, height: 2000, sill_height: type === 'deraza' ? 900 : 0, position, positionAuto: false }) as WallElement

const ROOM: RoomGeometry = {
  walls: [
    { id: 'A', length: 4500, elements: [el('eshik', 900, 500)] }, { id: 'B', length: 3200, elements: [] },
    { id: 'C', length: 4500, elements: [el('deraza', 1400, 1550)] }, { id: 'D', length: 3200, elements: [] },
  ],
} as RoomGeometry

const item = (id: string, name: string, category: string, w: number, d: number): CatalogFurniture => ({
  id, name_uz: name, category, store_id: null, store_name: null, room_type: null, placement: 'pol',
  price_uzs: null, glb_url: 'x.glb', thumbnail_url: null, footprint_w: w, footprint_d: d,
})
const CATALOG = [
  item('sofa', 'Divan', 'divan', 230, 95), item('table', 'Ovqat stoli', 'stol', 140, 80), item('chair', 'Stul', 'stul', 45, 50),
  item('arm', 'Kreslo', 'kreslo', 75, 75), item('pouf', 'Puf', 'dekor', 50, 50), item('wardrobe', 'Shkaf', 'shkaf', 120, 60),
]
const PLAN: AiDesignPlan = {
  title: 't', summary: '', warnings: [], walls: {}, floor: null, lights: [],
  furniture: [
    { id: 'sofa', name: 'Divan', role: 'sofa' }, { id: 'table', name: 'Ovqat stoli', role: 'dining_table' },
    { id: 'chair', name: 'Stul', role: 'dining_chair' }, { id: 'arm', name: 'Kreslo', role: 'armchair' },
    { id: 'arm', name: 'Kreslo', role: 'armchair' }, { id: 'pouf', name: 'Puf', role: 'decor' },
    { id: 'wardrobe', name: 'Shkaf', role: 'wardrobe' },
  ],
}
const rectOf = (f: { x: number; y: number; rotation: number; furniture_id: string }): Rect => {
  const c = CATALOG.find((i) => i.id === f.furniture_id)!
  return { x: f.x / 1000, z: f.y / 1000, w: c.footprint_w! / 100, d: c.footprint_d! / 100, rotation: f.rotation }
}
const front = (r: Rect): [number, number] => [Math.sin(r.rotation), Math.cos(r.rotation)]

beforeEach(() => {
  useRoomStore.getState().resetRoom()
  useRoomStore.setState({ geometry: ROOM, lights: [], furniture: [] })
})

describe('the screenshot living room', () => {
  it('stands the sofa with its back on a wall, facing into the room', () => {
    applyDesignPlan(PLAN, ALL_PARTS, CATALOG, 'mehmonxona')
    const sofa = useRoomStore.getState().furniture.find((f) => f.furniture_id === 'sofa')
    expect(sofa).toBeDefined()
    const r = rectOf(sofa!)
    const f = front(r)
    const back: [number, number] = [r.x - f[0] * r.d / 2, r.z - f[1] * r.d / 2]
    const { box } = roomModel(ROOM)
    const gap = Math.min(back[0] - box.minX, box.maxX - back[0], back[1] - box.minZ, box.maxZ - back[1])
    expect(gap).toBeLessThanOrEqual(0.06)
    expect(f[0] * -r.x + f[1] * -r.z).toBeGreaterThan(0)
  })

  it('stands nothing on anything else (a chair may tuck under its table)', () => {
    applyDesignPlan(PLAN, ALL_PARTS, CATALOG, 'mehmonxona')
    const placed = useRoomStore.getState().furniture
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const pair = [placed[i].furniture_id, placed[j].furniture_id].sort().join('+')
        if (pair === 'chair+table') continue
        expect(overlaps(rectOf(placed[i]), rectOf(placed[j]), 0), pair).toBe(false)
      }
    }
  })

  it('keeps a way open from the door to the front of the sofa', () => {
    applyDesignPlan(PLAN, ALL_PARTS, CATALOG, 'mehmonxona')
    const placed = useRoomStore.getState().furniture
    const sofa = rectOf(placed.find((f) => f.furniture_id === 'sofa')!)
    const f = front(sofa)
    const target: [number, number] = [sofa.x + f[0] * (sofa.d / 2 + 0.5), sofa.z + f[1] * (sofa.d / 2 + 0.5)]
    const model = roomModel(ROOM)
    expect(walkable(model, placed.map(rectOf), doorEntries(model), [target])).toBe(true)
  })

  it('names what it left out, and the notice says there was not enough room', () => {
    const applied = applyDesignPlan(PLAN, ALL_PARTS, CATALOG, 'mehmonxona')
    const asked = PLAN.furniture.length - 1 + 4 // one chair line stands for the four a 1.4 m table seats
    expect(applied.furniture + applied.skipped).toBe(asked)
    expect(applied.skipped).toBe(applied.dropped.reduce((s, d) => s + d.count, 0))
    if (applied.skipped > 0) {
      expect(applied.dropped.length).toBeGreaterThan(0)
      expect(droppedNotice(applied.dropped, i18n.t)).toContain('Joy yetmadi')
    }
  })
})

describe('droppedNotice', () => {
  it('lists each piece with how many, joined with commas', () => {
    expect(droppedNotice([{ name: 'Ovqat stoli', count: 1 }, { name: 'stul', count: 4 }], i18n.t))
      .toBe("Joy yetmadi: Ovqat stoli, 4 ta stul qo'yilmadi.")
  })

  it('is empty when everything fitted', () => {
    expect(droppedNotice([], i18n.t)).toBe('')
  })
})
