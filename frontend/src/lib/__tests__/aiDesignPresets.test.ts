import { describe, it, expect } from 'vitest'
import type { CatalogFurniture } from '@/lib/api'
import { FLOOR_PATTERN_DEFS } from '@/lib/floorGeometry'
import { LIGHT_TYPES } from '@/lib/lightCatalog'
import { DESIGN_PRESETS, presetPlan } from '../aiDesignPresets'

const item = (id: string, name: string, category: string, room_type: string | null = null): CatalogFurniture => ({
  id, name_uz: name, category, room_type, store_id: null, store_name: null, placement: 'pol',
  price_uzs: null, glb_url: 'x.glb', thumbnail_url: null, footprint_w: 100, footprint_d: 80,
})
const CATALOG = [
  item('sofa', "Uch o'rinli divan", 'divan', 'mehmonxona'),
  item('table', 'Kofe stoli', 'stol', 'mehmonxona'),
  item('kitchen-table', 'Oshxona stoli', 'stol', 'oshxona'),
  item('chair', 'Kreslo', 'kreslo'),
  item('tv', 'Televizor tumbasi', 'tumba', 'mehmonxona'),
  item('rug', 'Gilam', 'gilam'),
  item('shelf', 'Kitob shkafi', 'shkaf'),
]

describe('design presets', () => {
  it.each(DESIGN_PRESETS.map((p) => p.id))('%s is a plan the studio can apply: real colours, floor, lights and zones', (id) => {
    const plan = presetPlan(id, CATALOG, 'mehmonxona')!
    const hex = /^#[0-9a-f]{6}$/i
    const main = plan.walls.main!
    if (main.type === 'paint') expect(main.color).toMatch(hex)
    else expect([main.base_color, main.accent_color].every((c) => hex.test(c))).toBe(true)
    if (plan.walls.accent) expect(plan.walls.accent.color).toMatch(hex)
    expect(['parquet', 'tile', 'laminate', 'concrete']).toContain(plan.floor!.type)
    if (plan.floor!.pattern) expect(FLOOR_PATTERN_DEFS.map((d) => d.id)).toContain(plan.floor!.pattern)
    if (plan.floor!.tint) expect(plan.floor!.tint).toMatch(hex)
    const zones = new Set(['center', ...['A', 'B', 'C', 'D'].map((w) => `wall_${w}`), 'corner_A_B', 'corner_B_C', 'corner_C_D', 'corner_D_A'])
    for (const l of plan.lights) {
      expect(LIGHT_TYPES.map((t) => t.id)).toContain(l.type)
      expect(zones).toContain(l.zone)
    }
    for (const f of plan.furniture) expect(zones).toContain(f.zone)
    expect(plan.title && plan.summary).toBeTruthy()
  })

  it('wall lamps are on a wall, and a tint only goes with a wood floor', () => {
    for (const p of DESIGN_PRESETS) {
      for (const l of p.lights) {
        if (l.type === 'bra' || l.type === 'bath') expect(l.zone.startsWith('wall_')).toBe(true)
      }
      if (p.floor.type === 'tile' || p.floor.type === 'concrete') expect(p.floor.tint ?? p.floor.pattern).toBeNull()
    }
  })

  it('takes the furniture from the loaded catalog, one piece per kind, preferring this kind of room', () => {
    const plan = presetPlan('dark', CATALOG, 'mehmonxona')!
    expect(plan.furniture.map((f) => f.id)).toEqual(['sofa', 'table', 'rug', 'tv', 'chair'])
    expect(plan.furniture.find((f) => f.id === 'kitchen-table')).toBeUndefined() // a kitchen table is not for the living room
    expect(new Set(plan.furniture.map((f) => f.id)).size).toBe(plan.furniture.length)
  })

  it('uses the other room kind\'s piece only when nothing fits', () => {
    const only = [item('kitchen-table', 'Oshxona stoli', 'stol', 'oshxona'), item('sofa', 'Divan', 'divan')]
    expect(presetPlan('minimalist', only, 'mehmonxona')!.furniture.map((f) => f.id)).toEqual(['sofa', 'kitchen-table'])
  })

  it('leaves out a kind the catalog has nothing for, instead of guessing, and works with no catalog at all', () => {
    expect(presetPlan('klassik', [item('sofa', 'Divan', 'divan')], undefined)!.furniture.map((f) => f.id)).toEqual(['sofa'])
    const bare = presetPlan('loft', [], undefined)!
    expect(bare.furniture).toEqual([])
    expect(bare.walls.main && bare.floor && bare.lights.length).toBeTruthy() // the room itself still gets its style
  })

  it("in a drawn room the preset's walls become the room's own: first to fourth wall, wrapping round", () => {
    const plan = presetPlan('dark', CATALOG, 'mehmonxona', ['W1', 'W2', 'W3'])!
    expect(plan.walls.accent!.wall).toBe('W3')
    expect(plan.furniture.find((f) => f.id === 'sofa')!.zone).toBe('wall_W1')
    expect(plan.lights.find((l) => l.type === 'floor_lamp')!.zone).toBe('corner_W2_W3')
    expect(plan.lights.find((l) => l.type === 'led_linear')!.zone).toBe('wall_W3')
    const classic = presetPlan('klassik', CATALOG, undefined, ['W1', 'W2', 'W3'])!
    expect(classic.lights.find((l) => l.type === 'bra')!.zone).toBe('wall_W2')
    expect(classic.furniture.find((f) => f.id === 'kreslo' || f.id === 'chair')!.zone).toBe('corner_W3_W1') // D wraps to W1
  })

  it('a room with no walls puts everything in the middle', () => {
    const plan = presetPlan('dark', CATALOG, undefined, [])!
    expect(plan.furniture.every((f) => f.zone === 'center')).toBe(true)
  })

  it('is undefined for an unknown style', () => {
    expect(presetPlan('nonsense', CATALOG)).toBeUndefined()
  })
})
