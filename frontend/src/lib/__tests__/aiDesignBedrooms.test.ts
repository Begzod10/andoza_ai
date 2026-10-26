/**
 * Two bedrooms from a real AI run (backend/scripts/eval_ai_design.py), kept as a fixture: a 4 x 3.5 m
 * one asked for a double bed, a wardrobe, a desk and its chair; a 3 x 2.6 m one asked for a single bed
 * and a wardrobe. A bedroom without a wardrobe is the wrong way round: when only one of the desk and
 * the wardrobe fits, the wardrobe is placed.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useRoomStore } from '@/store/roomStore'
import type { AiDesignPlan, CatalogFurniture } from '@/lib/api'
import { ALL_PARTS, applyDesignPlan } from '../aiDesign'
import { rectBounds, roomModel, type Rect } from '../aiDesignLayout'
import { doorEntries, walkable, type Pt } from '../walkway'
import data from './fixtures/aiEvalBedrooms.json'

const catalog: CatalogFurniture[] = data.catalog.map((c) => ({
  ...c, store_id: null, store_name: null, price_uzs: null, glb_url: 'x', thumbnail_url: null,
}) as CatalogFurniture)
const byId = new Map(catalog.map((c) => [c.id, c]))
const hits = (a: Rect, b: Rect) => {
  const p = rectBounds(a), q = rectBounds(b)
  return p.minX < q.maxX - 1e-9 && q.minX < p.maxX - 1e-9 && p.minZ < q.maxZ - 1e-9 && q.minZ < p.maxZ - 1e-9
}

function run(planId: keyof typeof data.plans, furniture?: AiDesignPlan['furniture']) {
  const p = data.plans[planId]
  const room = data.rooms[p.room as keyof typeof data.rooms]
  useRoomStore.getState().resetRoom()
  useRoomStore.getState().loadRoom({ geometry: { walls: room.walls }, ceiling_h: 2.7 } as never)
  useRoomStore.setState({ lights: [], furniture: [] })
  const plan: AiDesignPlan = { title: 't', summary: '', warnings: [], walls: {}, floor: null, lights: [], furniture: furniture ?? p.furniture }
  const applied = applyDesignPlan(plan, ALL_PARTS, catalog, 'yotoqxona')
  const model = roomModel(useRoomStore.getState().geometry)
  const placed = useRoomStore.getState().furniture.map((f) => {
    const c = byId.get(f.furniture_id)!
    return { c, rect: { x: f.x / 1000, z: f.y / 1000, w: c.footprint_w! / 100, d: c.footprint_d! / 100, rotation: f.rotation } as Rect }
  })
  return { applied, placed, model, names: placed.map((x) => x.c.name_uz) }
}

/** Each placed piece is reachable from the door: a point 0.5 m out in front of it is. */
function allReachable(r: ReturnType<typeof run>): boolean {
  const solid = r.placed.map((p) => p.rect)
  const fronts: Pt[] = r.placed.filter((p) => /shkaf/i.test(p.c.name_uz)).map(({ rect }) =>
    [rect.x + Math.sin(rect.rotation) * (rect.d / 2 + 0.5), rect.z + Math.cos(rect.rotation) * (rect.d / 2 + 0.5)])
  return walkable(r.model, solid, doorEntries(r.model), fronts)
}

beforeEach(() => useRoomStore.getState().resetRoom())

describe('the 4 x 3.5 m bedroom: bed, wardrobe, desk and chair do not all fit', () => {
  it('keeps the bed and a wardrobe, and names the desk and its chair as left out', () => {
    const r = run('yotoq#1')
    expect(r.names).toContain('ZZ Karavot Grafit 180')
    expect(r.names.some((n) => /kiyim shkaf/i.test(n))).toBe(true)
    const dropped = r.applied.dropped.map((d) => d.name)
    expect(dropped).toContain('ZZ Yozuv stoli Nord')
    expect(dropped).toContain('ZZ Ish stuli')
    expect(allReachable(r)).toBe(true)
  })
})

describe('a large bedroom: everything fits', () => {
  it('gets both the wardrobe and the desk with its chair', () => {
    useRoomStore.getState().resetRoom()
    const big = {
      walls: [
        { id: 'A', length: 5.5, elements: [{ type: 'deraza', width: 1.4, height: 1.4, sill_height: 0.9, position: 0.5 }] },
        { id: 'B', length: 4.5, elements: [{ type: 'eshik', width: 0.9, height: 2.1, sill_height: 0, position: 0.8 }] },
        { id: 'C', length: 5.5, elements: [] }, { id: 'D', length: 4.5, elements: [] },
      ],
    }
    useRoomStore.getState().loadRoom({ geometry: big, ceiling_h: 2.7 } as never)
    useRoomStore.setState({ lights: [], furniture: [] })
    const plan: AiDesignPlan = { title: 't', summary: '', warnings: [], walls: {}, floor: null, lights: [], furniture: data.plans['yotoq#1'].furniture }
    const applied = applyDesignPlan(plan, ALL_PARTS, catalog, 'yotoqxona')
    const names = useRoomStore.getState().furniture.map((f) => byId.get(f.furniture_id)!.name_uz)
    expect(names).toEqual(expect.arrayContaining(['ZZ Karavot Grafit 180', 'ZZ Kiyim shkafi Grafit', 'ZZ Yozuv stoli Nord', 'ZZ Ish stuli']))
    expect(applied.dropped).toEqual([])
  })
})

