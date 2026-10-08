/**
 * An AI design must not shut a door or hide a window.
 *
 * A door keeps the floor in front of it clear for its swing; a window keeps it clear of tall
 * (or wall-hung) pieces; wall lights and corner floor lamps keep off the openings. Found when a
 * live plan stood a sofa across a door and a tall piece in front of a window.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useRoomStore } from '@/store/roomStore'
import type { RoomGeometry, WallElement } from '@/store/roomStore'
import type { AiDesignPlan, CatalogFurniture } from '@/lib/api'
import { ALL_PARTS, applyDesignPlan } from '../aiDesign'
import { furnitureSpot, lightSpot, rectBounds, roomModel, type Rect } from '../aiDesignLayout'

const el = (type: WallElement['type'], width: number, position: number, extra: Partial<WallElement> = {}): WallElement =>
  ({ id: `${type}-${position}`, type, width, height: type === 'eshik' ? 2100 : 1400, sill_height: type === 'deraza' ? 900 : 0, position, positionAuto: false, ...extra }) as WallElement

/** 4.0 m (walls A, C) x 3.0 m (walls B, D), with the given openings on each wall. */
const room = (open: Partial<Record<'A' | 'B' | 'C' | 'D', WallElement[]>> = {}): RoomGeometry => ({
  walls: [
    { id: 'A', length: 4000, elements: open.A ?? [] }, { id: 'B', length: 3000, elements: open.B ?? [] },
    { id: 'C', length: 4000, elements: open.C ?? [] }, { id: 'D', length: 3000, elements: open.D ?? [] },
  ],
}) as RoomGeometry

const hits = (a: Rect, b: Rect) => { const p = rectBounds(a), q = rectBounds(b); return p.minX < q.maxX - 1e-9 && q.minX < p.maxX - 1e-9 && p.minZ < q.maxZ - 1e-9 && q.minZ < p.maxZ - 1e-9 }
const zonesOf = (m: ReturnType<typeof roomModel>, kind: 'door' | 'window') => m.clear.filter((z) => z.kind === kind).map((z) => z.rect)

// Door on wall B (x = +2), 900 wide, left edge 350 mm along: z from -1.15 to -0.25.
const DOOR_B = [el('eshik', 900, 350)]
// Window on wall A (z = -1.5), 1600 wide, centred: x from -0.8 to 0.8.
const WINDOW_A = [el('deraza', 1600, 1200)]

describe('what the room model knows about openings', () => {
  it('turns each door and window into a span along its wall and a floor zone in front of it', () => {
    const m = roomModel(room({ A: WINDOW_A, B: DOOR_B }))
    expect(m.openings).toHaveLength(2)
    const door = m.openings.find((o) => o.kind === 'door')!
    expect(door.wallId).toBe('B')
    expect(door.from).toBeCloseTo(-1.15, 5) // 350 mm from the start of a 3 m wall, measured from its middle
    expect(door.to).toBeCloseTo(-0.25, 5)
    expect(m.clear.map((z) => z.kind).sort()).toEqual(['door', 'window'])
  })

  it('treats a balcony door as a door', () => {
    expect(roomModel(room({ B: [el('balkon', 900, 350)] })).openings[0].kind).toBe('door')
  })

  it('has nothing to avoid in a room without openings', () => {
    const m = roomModel(room())
    expect(m.openings).toEqual([])
    expect(m.clear).toEqual([])
  })
})

describe('furniture and doors', () => {
  const tv = { w: 1.5, d: 0.4 }

  it('slides a piece along its wall to clear the door instead of standing across it', () => {
    const model = roomModel(room({ B: DOOR_B }))
    const s = furnitureSpot('wall_B', tv, model, [])
    for (const z of zonesOf(model, 'door')) expect(hits(s.rect, z)).toBe(false)
    expect(s.z).toBeGreaterThan(0) // moved off the middle, away from the door at the start of the wall
  })

  it('without the door the same piece sits in the middle of the wall', () => {
    const s = furnitureSpot('wall_B', tv, roomModel(room()), [])
    expect(s.z).toBeCloseTo(0, 5)
  })

  it('keeps a corner piece out of the swing of a door near that corner', () => {
    const model = roomModel(room({ B: DOOR_B }))
    const s = furnitureSpot('corner_A_B', { w: 0.9, d: 0.9 }, model, [])
    for (const z of zonesOf(model, 'door')) expect(hits(s.rect, z)).toBe(false)
  })

  it('never blocks a door with a window-only rule: a low sofa still avoids the door', () => {
    const model = roomModel(room({ B: DOOR_B }))
    const s = furnitureSpot('wall_B', { w: 2, d: 0.9 }, model, [])
    for (const z of zonesOf(model, 'door')) expect(hits(s.rect, z)).toBe(false)
  })

  it('still places a piece when no clear spot exists, rather than losing it', () => {
    // A door as wide as its wall leaves nowhere on that wall.
    const model = roomModel(room({ B: [el('eshik', 2900, 50)] }))
    const s = furnitureSpot('wall_B', tv, model, [])
    expect(Number.isFinite(s.x) && Number.isFinite(s.z)).toBe(true)
  })
})

describe('furniture and windows', () => {
  const wardrobe = { w: 1.8, d: 0.6, tall: true }
  const sofa = { w: 2.0, d: 0.9 }

  it('keeps a tall piece out from in front of a window', () => {
    const model = roomModel(room({ A: WINDOW_A }))
    const s = furnitureSpot('wall_A', wardrobe, model, [])
    for (const z of zonesOf(model, 'window')) expect(hits(s.rect, z)).toBe(false)
  })

  it('lets a low piece stand under a window, as people do', () => {
    const s = furnitureSpot('wall_A', sofa, roomModel(room({ A: WINDOW_A })), [])
    expect(s.x).toBeCloseTo(0, 5)
    expect(s.z).toBeCloseTo(-1.5 + 0.45 + 0.04, 5)
  })

  it('gives up the window rule before the door rule when a tall piece fits nowhere else', () => {
    // A window along the whole of wall A and a door on wall B: the wardrobe may stand by the window, never across the door.
    const model = roomModel(room({ A: [el('deraza', 3900, 50)], B: DOOR_B }))
    const s = furnitureSpot('wall_A', { w: 3.8, d: 0.6, tall: true }, model, [])
    for (const z of zonesOf(model, 'door')) expect(hits(s.rect, z)).toBe(false)
  })
})

describe('lights and openings', () => {
  const xOf = (m: ReturnType<typeof roomModel>, xMm: number) => (xMm - m.offsetMm.x) / 1000

  it('hangs a sconce on bare wall, not over a window', () => {
    const model = roomModel(room({ A: WINDOW_A }))
    const spot = lightSpot('wall_A', 'wall', model, 0)
    expect(Math.abs(xOf(model, spot.xMm))).toBeGreaterThanOrEqual(0.8 + 0.25 - 1e-6)
    expect(spot.wallId).toBe('A')
  })

  it('hangs a sconce where it always did when the wall is bare', () => {
    const model = roomModel(room())
    expect(xOf(model, lightSpot('wall_A', 'wall', model, 0).xMm)).toBeCloseTo(0, 5)
  })

  it('moves a corner floor lamp out of a door swing', () => {
    const model = roomModel(room({ B: DOOR_B }))
    const spot = lightSpot('corner_A_B', 'floor', model, 0)
    const lamp: Rect = { x: xOf(model, spot.xMm), z: (spot.zMm - model.offsetMm.y) / 1000, w: 0.3, d: 0.3, rotation: 0 }
    for (const z of zonesOf(model, 'door')) expect(hits(lamp, z)).toBe(false)
  })
})

describe('a whole plan applied to a room with a door and a window', () => {
  const item = (id: string, w: number, d: number, category: string, placement = 'pol'): CatalogFurniture => ({
    id, name_uz: id, category, store_id: null, store_name: null, room_type: null, placement: placement as CatalogFurniture['placement'],
    price_uzs: null, glb_url: 'x', thumbnail_url: null, footprint_w: w * 100, footprint_d: d * 100,
  })
  const catalog = [item('divan', 2.1, 0.9, 'divan'), item('shkaf', 1.8, 0.6, 'shkaf'), item('tv', 1.5, 0.4, 'tv_tumba'), item('rasm', 1.0, 0.1, 'dekor', 'devor')]
  const corners = (f: { x: number; y: number; rotation: number; furniture_id: string }): Rect => {
    const c = catalog.find((i) => i.id === f.furniture_id)!
    return { x: f.x / 1000, z: f.y / 1000, w: c.footprint_w! / 100, d: c.footprint_d! / 100, rotation: f.rotation }
  }
  const plan = (furniture: AiDesignPlan['furniture']): AiDesignPlan => ({ title: 't', summary: '', warnings: [], walls: {}, floor: null, lights: [], furniture })

  beforeEach(() => { useRoomStore.getState().resetRoom(); useRoomStore.setState({ geometry: room({ A: WINDOW_A, B: DOOR_B }), lights: [], furniture: [] }) })

  it('does not put the sofa across the door, nor the wardrobe or a hung picture in front of the window', () => {
    applyDesignPlan(plan([
      { id: 'divan', name: 'd', zone: 'wall_B' }, { id: 'shkaf', name: 's', zone: 'wall_A' }, { id: 'rasm', name: 'r', zone: 'wall_A' },
    ]), ALL_PARTS, catalog)
    const model = roomModel(useRoomStore.getState().geometry)
    const placed = useRoomStore.getState().furniture
    expect(placed).toHaveLength(3)
    for (const f of placed) {
      for (const z of zonesOf(model, 'door')) expect(hits(corners(f), z)).toBe(false)
    }
    for (const f of placed.filter((p) => p.furniture_id !== 'divan')) {
      for (const z of zonesOf(model, 'window')) expect(hits(corners(f), z)).toBe(false)
    }
  })

  it('still stands a sofa under the window when asked to', () => {
    applyDesignPlan(plan([{ id: 'divan', name: 'd', zone: 'wall_A' }]), ALL_PARTS, catalog)
    const f = useRoomStore.getState().furniture[0]
    expect(f.y / 1000).toBeCloseTo(-1.5 + 0.45 + 0.04, 2)
  })
})
