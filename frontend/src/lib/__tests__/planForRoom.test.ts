import { describe, it, expect } from 'vitest'
import type { AiDesignPlan, CatalogFurniture } from '@/lib/api'
import type { RoomGeometry } from '@/store/roomStore'
import { presetPlan, roomSizeOf } from '../aiDesignPresets'
import { planForRoom, styleOfPlan, type DesignSource } from '../planForRoom'

const item = (id: string, name: string, category: string, room_type: string | null = null, styles: string[] = []): CatalogFurniture => ({
  id, name_uz: name, category, room_type, store_id: null, store_name: null, placement: 'pol',
  price_uzs: null, glb_url: 'x.glb', thumbnail_url: null, footprint_w: 100, footprint_d: 80, styles,
})
const CATALOG = [
  item('sofa', "Uch o'rinli divan", 'divan', 'mehmonxona', ['skandinav']),
  item('table', 'Kofe stoli', 'stol', 'mehmonxona', ['skandinav', 'loft']),
  item('rug', 'Gilam', 'gilam', null, ['loft']),
  item('bed', 'Karavot 160', 'karavot', 'yotoqxona'),
  item('night', 'Tumbochka', 'boshqa', 'yotoqxona'),
  item('wardrobe', 'Kiyim shkafi', 'shkaf', 'yotoqxona'),
  item('dining', 'Ovqat stoli', 'stol', 'oshxona'),
]

/** A rectangular room, 4 x 3.5 m, whose walls are W1..Wn (lengths repeat for a room of other than four). */
const geometryOf = (ids: string[]): RoomGeometry => ({
  walls: ids.map((id, i) => ({ id, length: i % 2 === 0 ? 4000 : 3500 })) as RoomGeometry['walls'],
})
const target = (roomType: string, wallIds = ['W1', 'W2', 'W3', 'W4']) => ({ geometry: geometryOf(wallIds), wallIds, roomType })

const SOURCE_WALLS = ['A', 'B', 'C', 'D']
const AI_PLAN: AiDesignPlan = {
  title: 'Yorug\' mehmonxona',
  summary: 'Mehmonxonada katta divan va yumshoq gilam.',
  walls: {
    main: { type: 'oboy', pattern: 'chiziq', base_color: '#eeeeee', accent_color: '#cccccc' },
    accent: { wall: 'C', color: '#336699' },
  },
  floor: { type: 'parquet', pattern: 'herringbone', tint: '#a07050' },
  lights: [
    { type: 'chandelier', zone: 'center' },
    { type: 'bra', zone: 'wall_B' },
    { type: 'floor_lamp', zone: 'corner_A_B' },
  ],
  furniture: [{ id: 'sofa', name: 'Divan', role: 'sofa' }, { id: 'table', name: 'Stol', role: 'coffee_table' }],
  trim: { skirting: { id: 'p1' }, cornice: null },
  warnings: ['dropped x'],
  style: 'loft',
}
const ai = (plan: Partial<AiDesignPlan> = {}, wallIds = SOURCE_WALLS): DesignSource => ({ kind: 'ai', plan: { ...AI_PLAN, ...plan }, wallIds })

describe('planForRoom', () => {
  it('a ready-made style is exactly its plan for the target room', () => {
    for (const roomType of ['mehmonxona', 'yotoqxona', 'oshxona', 'hammom']) {
      const t = target(roomType)
      expect(planForRoom({ kind: 'preset', id: 'skandinav' }, t, CATALOG))
        .toEqual(presetPlan('skandinav', CATALOG, roomType, t.wallIds, roomSizeOf(t.geometry)))
    }
  })

  it('an AI plan keeps its walls, floor and trim, and takes the furniture of its style for the target type', () => {
    const t = target('yotoqxona')
    const plan = planForRoom(ai(), t, CATALOG)
    expect(plan.walls.main).toEqual(AI_PLAN.walls.main)
    expect(plan.walls.accent).toEqual({ wall: 'W3', color: '#336699' })
    expect(plan.floor).toEqual(AI_PLAN.floor)
    expect(plan.trim).toEqual(AI_PLAN.trim)
    expect(plan.furniture).toEqual(presetPlan('loft', CATALOG, 'yotoqxona', t.wallIds, roomSizeOf(t.geometry))!.furniture)
    expect(plan.furniture.map((f) => f.id)).toEqual(['bed', 'night', 'wardrobe', 'rug'])
    expect(plan.style).toBe('loft')
    // The source's summary, title and warnings describe the source room.
    expect(plan.summary).toBe(presetPlan('loft', CATALOG, 'yotoqxona')!.summary)
    expect(plan.title).toBe(presetPlan('loft', CATALOG, 'yotoqxona')!.title)
    expect(plan.warnings).toEqual([])
  })

  it('the accent on the third wall lands on the third wall, wrapping round a room of fewer', () => {
    expect(planForRoom(ai(), target('mehmonxona', ['W1', 'W2', 'W3']), CATALOG).walls.accent?.wall).toBe('W3')
    expect(planForRoom(ai(), target('mehmonxona', ['W1', 'W2']), CATALOG).walls.accent?.wall).toBe('W1')
    expect(planForRoom(ai(), target('mehmonxona', ['A', 'B', 'C', 'D', 'E', 'F']), CATALOG).walls.accent?.wall).toBe('C')
  })

  it('an accent on a wall the source does not have is left out', () => {
    expect(planForRoom(ai({ walls: { ...AI_PLAN.walls, accent: { wall: 'Z', color: '#000000' } } }), target('mehmonxona'), CATALOG).walls.accent)
      .toBeUndefined()
  })

  it('lights on a wall or a corner move by the wall index; a zone that cannot be mapped goes to the centre', () => {
    const lights = [
      { type: 'bra', zone: 'corner_W1_W2' },
      { type: 'bra', zone: 'wall_W4' },
      { type: 'spotlight', zone: 'corner_W4_W1' },
      { type: 'spotlight', zone: 'wall_Q' },
      { type: 'spotlight', zone: 'somewhere' },
      { type: 'ceiling', zone: 'center' },
    ]
    const plan = planForRoom(ai({ lights }, ['W1', 'W2', 'W3', 'W4']), target('mehmonxona', ['A', 'B', 'C']), CATALOG)
    expect(plan.lights).toEqual([
      { type: 'bra', zone: 'corner_A_B' },
      { type: 'bra', zone: 'wall_A' },
      // Walls 4 and 1 are both wall A in a room of three: a corner of one wall is that wall.
      { type: 'spotlight', zone: 'wall_A' },
      { type: 'spotlight', zone: 'center' },
      { type: 'spotlight', zone: 'center' },
      { type: 'ceiling', zone: 'center' },
    ])
  })

  it('the old four-wall corner spelling maps too', () => {
    const plan = planForRoom(ai({ lights: [{ type: 'bra', zone: 'corner_BC' }] }), target('mehmonxona'), CATALOG)
    expect(plan.lights).toEqual([{ type: 'bra', zone: 'corner_W2_W3' }])
  })

  it('a kitchen gets a tile floor; a dry room given a tile floor gets laminate', () => {
    expect(planForRoom(ai(), target('oshxona'), CATALOG).floor).toEqual({ type: 'tile', pattern: null, tint: null })
    const tiled = ai({ floor: { type: 'tile', pattern: 'chess', tint: '#ffffff' } })
    expect(planForRoom(tiled, target('yotoqxona'), CATALOG).floor).toEqual({ type: 'laminate', pattern: null, tint: null })
    expect(planForRoom(tiled, target('hammom'), CATALOG).floor).toEqual({ type: 'tile', pattern: null, tint: null })
  })

  it('a bathroom gets painted walls, a ceiling light, and no chandelier, pendant or floor lamp', () => {
    const plan = planForRoom(ai({ lights: [...AI_PLAN.lights, { type: 'pendant', zone: 'wall_A' }] }), target('hammom'), CATALOG)
    expect(plan.walls.main).toEqual({ type: 'paint', color: '#eeeeee' })
    const types = plan.lights.map((l) => l.type)
    expect(types).not.toContain('chandelier')
    expect(types).not.toContain('pendant')
    expect(types).not.toContain('floor_lamp')
    expect(types.some((t) => ['ceiling', 'downlight', 'spotlight', 'led_panel', 'led_linear', 'track', 'led_track'].includes(t))).toBe(true)
  })

  it('a catalog with nothing for the room type adds no furniture and keeps the surfaces', () => {
    const plan = planForRoom(ai(), target('hammom'), CATALOG)
    expect(plan.furniture).toEqual([])
    expect(plan.walls.main?.type).toBe('paint')
    expect(plan.floor?.type).toBe('tile')
    expect(plan.lights.length).toBeGreaterThan(0)
  })

  it('a style the presets do not know falls back to the room type default', () => {
    const t = target('yotoqxona')
    expect(planForRoom(ai({ style: 'nope' }), t, CATALOG).furniture)
      .toEqual(presetPlan('skandinav', CATALOG, 'yotoqxona', t.wallIds, roomSizeOf(t.geometry))!.furniture)
  })

  it('the room size passed in wins over the one from the geometry', () => {
    const t = { ...target('balkon'), size: { area: 3, minSide: 1 } }
    const balcony = [item('t', 'Kichik stol', 'stol'), item('s1', 'Kreslo', 'kreslo'), item('s2', 'Kreslo 2', 'kreslo')]
    expect(planForRoom(ai(), t, balcony).furniture)
      .toEqual(presetPlan('loft', balcony, 'balkon', t.wallIds, t.size)!.furniture)
  })
})

describe('styleOfPlan', () => {
  it('is the style the plan names', () => {
    expect(styleOfPlan({ ...AI_PLAN, style: 'milliy' }, CATALOG, 'mehmonxona')).toBe('milliy')
  })

  it('without one, is the style most of the plan\'s furniture has in the catalog', () => {
    // sofa: skandinav; table: skandinav, loft.
    expect(styleOfPlan({ ...AI_PLAN, style: null }, CATALOG, 'mehmonxona')).toBe('skandinav')
    const loft = { ...AI_PLAN, style: undefined, furniture: [{ id: 'table', name: '' }, { id: 'rug', name: '' }] }
    expect(styleOfPlan(loft, CATALOG, 'mehmonxona')).toBe('loft')
  })

  it('without either, is the room type\'s default', () => {
    const bare = { ...AI_PLAN, style: null, furniture: [{ id: 'bed', name: '' }, { id: 'missing', name: '' }] }
    expect(['mehmonxona', 'oshxona', 'yotoqxona', 'bolalar', 'balkon', 'kabinet', 'hammom', 'boshqa']
      .map((t) => styleOfPlan(bare, CATALOG, t)))
      .toEqual(['zamonaviy', 'zamonaviy', 'skandinav', 'skandinav', 'skandinav', 'minimalist', 'minimalist', 'zamonaviy'])
  })
})
