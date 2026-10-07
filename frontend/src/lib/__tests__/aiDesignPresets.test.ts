import { describe, it, expect } from 'vitest'
import type { CatalogFurniture } from '@/lib/api'
import { FLOOR_PATTERN_DEFS } from '@/lib/floorGeometry'
import { LIGHT_TYPES } from '@/lib/lightCatalog'
import { ZONES } from '../aiDesignLayout'
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
    for (const l of plan.lights) {
      expect(LIGHT_TYPES.map((t) => t.id)).toContain(l.type)
      expect(ZONES as readonly string[]).toContain(l.zone)
    }
    for (const f of plan.furniture) expect(ZONES as readonly string[]).toContain(f.zone)
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

  it('is undefined for an unknown style', () => {
    expect(presetPlan('nonsense', CATALOG)).toBeUndefined()
  })
})
