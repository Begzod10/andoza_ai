/**
 * The eval's narrow rooms after #70 (backend/scripts/eval_ai_design.py, kept as a fixture): a 3 x 1.4 m
 * balcony with its door in four places (C in the middle, B, C at 0.2 and C at 0.8), and the 3 x 2.6 m
 * small room. Every ready-made style is applied the way the studio applies it.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useRoomStore } from '@/store/roomStore'
import type { CatalogFurniture } from '@/lib/api'
import { lightType } from '@/lib/lightCatalog'
import { ALL_PARTS, applyDesignPlan } from '../aiDesign'
import { overlaps, roomModel, type Rect } from '../aiDesignLayout'
import { DESIGN_PRESETS, presetPlan, roomSizeOf } from '../aiDesignPresets'
import data from './fixtures/aiEvalAfter70.json'

const catalog: CatalogFurniture[] = data.catalog.map((c) => ({
  ...c, store_id: null, store_name: null, price_uzs: null, glb_url: 'x', thumbnail_url: null,
}) as CatalogFurniture)
const byId = new Map(catalog.map((c) => [c.id, c]))
type RoomId = keyof typeof data.rooms
const BALCONIES: RoomId[] = ['balcony', 'balconyB', 'balconyC2', 'balconyC8']
const PRESETS = DESIGN_PRESETS.map((p) => p.id)
const LAMP = lightType('floor_lamp').sizeM

function applyPreset(presetId: string, roomId: RoomId) {
  const room = data.rooms[roomId]
  useRoomStore.getState().resetRoom()
  useRoomStore.getState().loadRoom({ geometry: { walls: room.walls }, ceiling_h: 2.7 } as never)
  useRoomStore.setState({ lights: [], furniture: [] })
  const geometry = useRoomStore.getState().geometry
  const plan = presetPlan(presetId, catalog, room.room_type, undefined, roomSizeOf(geometry))!
  const applied = applyDesignPlan(plan, ALL_PARTS, catalog, room.room_type)
  const model = roomModel(geometry)
  const placed = useRoomStore.getState().furniture.map((f) => {
    const c = byId.get(f.furniture_id)!
    return { c, rect: { x: f.x / 1000, z: f.y / 1000, w: c.footprint_w! / 100, d: c.footprint_d! / 100, rotation: f.rotation } as Rect }
  })
  const lamps = useRoomStore.getState().lights.filter((l) => l.type === 'floor_lamp').map((l): Rect => ({
    x: (l.xMm - model.offsetMm.x) / 1000, z: (l.zMm - model.offsetMm.z) / 1000, ...LAMP, rotation: 0,
  }))
  return { plan, applied, model, placed, lamps }
}

beforeEach(() => useRoomStore.getState().resetRoom())

describe('a floor lamp on the 3 x 1.4 m balcony', () => {
  for (const roomId of BALCONIES) {
    it.each(PRESETS)(`${roomId}: %s's lamp, when there is one, stands clear of the furniture, the door and the walls`, (id) => {
      const { model, placed, lamps } = applyPreset(id, roomId)
      const solid = placed.filter((p) => !/gilam/i.test(p.c.name_uz)).map((p) => p.rect)
      const doors = model.clear.filter((z) => z.kind === 'door').map((z) => z.rect)
      for (const lamp of lamps) {
        expect(model.inside(lamp)).toBe(true)
        expect(solid.some((r) => overlaps(lamp, r, 0))).toBe(false)
        expect(doors.some((r) => overlaps(lamp, r, 0))).toBe(false)
      }
    })
  }
})

describe('the ready-made set for a balcony under 1.8 m across', () => {
  const tableArea = (c: CatalogFurniture) => c.footprint_w! * c.footprint_d!
  for (const roomId of BALCONIES) {
    it.each(PRESETS)(`${roomId}: %s takes one seat and the smallest small table, and drops neither`, (id) => {
      const { plan, applied } = applyPreset(id, roomId)
      const seats = plan.furniture.filter((f) => f.role === 'armchair' || f.role === 'dining_chair')
      expect(seats).toHaveLength(1)
      const tables = plan.furniture.filter((f) => f.role === 'coffee_table')
      expect(tables).toHaveLength(1)
      const smallest = Math.min(...catalog.filter((c) => c.category === 'stol' && /jurnal/i.test(c.name_uz)).map(tableArea))
      expect(tableArea(byId.get(tables[0].id)!)).toBe(smallest)
      expect(applied.dropped.filter((d) => d.role === 'armchair' || d.role === 'dining_chair')).toEqual([])
    })
  }

  it('a balcony 1.8 m across or more keeps its two seats and the style\'s own table', () => {
    const wide = presetPlan('klassik', catalog, 'balkon', undefined, { area: 5.4, minSide: 1.8 })!
    expect(wide.furniture.filter((f) => f.role === 'armchair' || f.role === 'dining_chair')).toHaveLength(2)
    expect(wide.furniture.find((f) => f.role === 'coffee_table')!.name).toBe('ZZ Jurnal stoli zarhal')
  })
})

describe('a rug that fits the room', () => {
  const rugOf = (r: ReturnType<typeof applyPreset>) => r.placed.filter((p) => p.c.name_uz.includes('Gilam'))
  it.each(PRESETS)('the 3 x 2.6 m room: %s lays a rug inside the room, or none', (id) => {
    const r = applyPreset(id, 'small')
    for (const rug of rugOf(r)) expect(r.model.inside(rug.rect), rug.c.name_uz).toBe(true)
  })

  it.each(['milliy', 'klassik'])("the 3 x 2.6 m room: %s's ready-made set takes a rug that leaves 0.3 m round it", (id) => {
    const r = applyPreset(id, 'small')
    const rug = byId.get(r.plan.furniture.find((f) => f.role === 'rug')!.id)!
    const [short, long] = [rug.footprint_w!, rug.footprint_d!].sort((a, b) => a - b)
    expect(short).toBeLessThanOrEqual(260 - 60)
    expect(long).toBeLessThanOrEqual(300 - 60)
  })

  it.each([['milliy', 'ZZ Gilam Buxoro naqshli'], ['klassik', 'ZZ Gilam Fors']])('the 4.5 x 3.2 m living room keeps %s\'s own 200 x 300 rug', (id, name) => {
    const r = applyPreset(id, 'living45')
    expect(rugOf(r).map((p) => p.c.name_uz)).toEqual([name])
    expect(r.model.inside(rugOf(r)[0].rect)).toBe(true)
  })

  it('with no rug that fits, the smallest is taken; with no room size, the pick is as before', () => {
    const tiny = { area: 2, minSide: 1 }
    expect(presetPlan('milliy', catalog, 'yotoqxona', undefined, tiny)!.furniture.find((f) => f.role === 'rug')!.name).toMatch(/jun och|kulrang/)
    expect(presetPlan('milliy', catalog, 'yotoqxona')!.furniture.find((f) => f.role === 'rug')!.name).toBe('ZZ Gilam Buxoro naqshli')
  })
})

describe('a rug the layout cannot lay inside the room', () => {
  const piece = (name: string, role: string) => ({ id: catalog.find((c) => c.name_uz === name)!.id, name, role })
  const BUXORO = piece('ZZ Gilam Buxoro naqshli', 'rug')
  function applyPlan(roomId: RoomId, roomType: string, furniture: ReturnType<typeof piece>[], cat = catalog) {
    useRoomStore.getState().resetRoom()
    useRoomStore.getState().loadRoom({ geometry: { walls: data.rooms[roomId].walls }, ceiling_h: 2.7 } as never)
    useRoomStore.setState({ lights: [], furniture: [] })
    const applied = applyDesignPlan({ title: 't', summary: '', warnings: [], walls: {}, floor: null, lights: [], furniture }, ALL_PARTS, cat, roomType)
    const model = roomModel(useRoomStore.getState().geometry)
    const rugs = useRoomStore.getState().furniture.flatMap((f) => {
      const c = byId.get(f.furniture_id)!
      return /gilam/i.test(c.name_uz) ? [{ name: c.name_uz, rect: { x: f.x / 1000, z: f.y / 1000, w: c.footprint_w! / 100, d: c.footprint_d! / 100, rotation: f.rotation } }] : []
    })
    return { applied, model, rugs }
  }
  const BEDROOM = [piece('ZZ Bir kishilik karavot', 'bed'), piece('ZZ Tumbochka Nord', 'nightstand'), BUXORO]
  // The eval's 200 x 300 rug fits the 3 x 2.6 m room turned, wall to wall: a 250 x 350 one fits neither way.
  const bigRug = catalog.map((c) => (c.name_uz === BUXORO.name ? { ...c, footprint_w: 250, footprint_d: 350 } : c))

  it('the 3 x 2.6 m bedroom: a 250 x 350 rug gives way to a smaller one for every room', () => {
    const anyRoom = bigRug.map((c) => (c.name_uz === 'ZZ Gilam kulrang' ? { ...c, room_type: null } : c))
    const r = applyPlan('small', 'yotoqxona', BEDROOM, anyRoom)
    expect(r.applied.swapped).toEqual([{ from: 'ZZ Gilam Buxoro naqshli', to: 'ZZ Gilam kulrang', count: 1 }])
    expect(r.rugs.map((x) => x.name)).toEqual(['ZZ Gilam kulrang'])
    expect(r.model.inside(r.rugs[0].rect)).toBe(true)
    expect(r.applied.dropped).toEqual([])
  })

  it('the 3 x 2.6 m bedroom, with no smaller rug made for it: a 250 x 350 rug is left out and named', () => {
    const r = applyPlan('small', 'yotoqxona', BEDROOM, bigRug)
    expect(r.rugs).toEqual([])
    expect(r.applied.dropped).toEqual([{ name: 'ZZ Gilam Buxoro naqshli', count: 1, role: 'rug' }])
  })

  it('the 4.5 x 3.2 m living room keeps the 200 x 300 rug', () => {
    const r = applyPlan('living45', 'mehmonxona', [piece('ZZ Divan Samarqand', 'sofa'), piece("ZZ Jurnal stoli o'ymakor", 'coffee_table'), BUXORO])
    expect(r.rugs.map((x) => x.name)).toEqual(['ZZ Gilam Buxoro naqshli'])
    expect(r.model.inside(r.rugs[0].rect)).toBe(true)
    expect(r.applied.swapped).toEqual([])
  })
})

describe('a floor lamp left out is said to be', () => {
  it("the balcony with zamonaviy's two seats: the lamp is in droppedLights, not in placedLights", () => {
    useRoomStore.getState().resetRoom()
    useRoomStore.getState().loadRoom({ geometry: { walls: data.rooms.balcony.walls }, ceiling_h: 2.7 } as never)
    useRoomStore.setState({ lights: [], furniture: [] })
    // No room size: the two-seat set, which leaves the lamp nowhere clear.
    const plan = presetPlan('zamonaviy', catalog, 'balkon')!
    const applied = applyDesignPlan(plan, ALL_PARTS, catalog, 'balkon')
    expect(applied.droppedLights).toEqual([{ type: 'floor_lamp', count: 1 }])
    expect(applied.placedLights).toEqual(plan.lights.filter((l) => l.type !== 'floor_lamp'))
    expect(applied.lights).toBe(applied.placedLights.length)
  })
})
