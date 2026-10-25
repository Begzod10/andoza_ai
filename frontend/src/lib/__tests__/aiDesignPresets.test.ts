import { describe, it, expect } from 'vitest'
import i18n from '@/i18n'
import type { CatalogFurniture } from '@/lib/api'
import { FLOOR_PATTERN_DEFS } from '@/lib/floorGeometry'
import { LIGHT_TYPES } from '@/lib/lightCatalog'
import { OBOY_PATTERNS } from '@/lib/oboyPatterns'
import { CEILING_DESIGNS } from '@/lib/ceilingDesigns'
import { trimProfilesOf } from '@/lib/trimProfiles'
import { FURNITURE_STYLES } from '../furnitureStyles'
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
  it.each(DESIGN_PRESETS.map((p) => p.id))('%s is a plan the studio can apply: real colours, floor, lights and furniture roles', (id) => {
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
    for (const f of plan.furniture) expect(f.role).toBeTruthy()
    expect(plan.title && plan.summary).toBeTruthy()
  })

  it('offers the styles most asked for in Uzbekistan first', () => {
    expect(DESIGN_PRESETS.slice(0, 4).map((p) => [p.id, i18n.t(p.labelKey)])).toEqual([
      ['neoklassika', 'Neoklassika'],
      ['zamonaviy', 'Zamonaviy'],
      ['hitech', 'Hi-Tech'],
      ['milliy', 'Milliy'],
    ])
    expect(DESIGN_PRESETS.map((p) => p.id)).toEqual(expect.arrayContaining(['dark', 'skandinav', 'klassik', 'loft', 'minimalist']))
    expect(new Set(DESIGN_PRESETS.map((p) => p.id)).size).toBe(DESIGN_PRESETS.length)
  })

  it('a wallpaper wall uses a pattern the studio can draw', () => {
    const known: readonly string[] = OBOY_PATTERNS.map((p) => p.id)
    for (const p of DESIGN_PRESETS) {
      if (p.walls.main?.type === 'oboy') expect(known).toContain(p.walls.main.pattern)
    }
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
    expect(plan.lights.find((l) => l.type === 'floor_lamp')!.zone).toBe('corner_W2_W3')
    expect(plan.lights.find((l) => l.type === 'led_linear')!.zone).toBe('wall_W3')
    const classic = presetPlan('klassik', CATALOG, undefined, ['W1', 'W2', 'W3'])!
    expect(classic.lights.find((l) => l.type === 'bra')!.zone).toBe('wall_W2')
  })

  it('every preset furniture item has a role and no zone', () => {
    for (const p of DESIGN_PRESETS) {
      for (const f of presetPlan(p.id, CATALOG, 'mehmonxona')!.furniture) {
        expect(f.role, p.id).toBeTruthy()
        expect(f.zone, p.id).toBeUndefined()
      }
    }
  })

  it('each kind maps to its role (the role the piece itself infers, as an AI plan would give it)', () => {
    const roleOf = (id: string) => presetPlan('dark', CATALOG, 'mehmonxona')!.furniture.find((f) => f.id === id)!.role
    expect(roleOf('sofa')).toBe('sofa')
    expect(roleOf('table')).toBe('coffee_table')
    expect(roleOf('tv')).toBe('tv_unit')
    expect(roleOf('rug')).toBe('rug')
    expect(roleOf('chair')).toBe('armchair')
    // "Kitob shkafi": the name says shkaf, a wardrobe to inferRole; both stand in the storage group alike.
    expect(presetPlan('klassik', CATALOG, 'mehmonxona')!.furniture.find((f) => f.id === 'shelf')!.role).toBe('wardrobe')
  })

  it('a dining table in the catalog stays a coffee table in a preset (a dining table has no sofa to sit before)', () => {
    const only = [item('sofa', 'Divan', 'divan'), item('kitchen-table', 'Oshxona stoli', 'stol', 'oshxona')]
    const plan = presetPlan('minimalist', only, 'mehmonxona')!
    expect(plan.furniture.find((f) => f.id === 'kitchen-table')!.role).toBe('coffee_table')
  })

  it('a piece whose name says nothing falls back to the role of its kind', () => {
    const plan = presetPlan('minimalist', [item('sofa', 'Model X', 'divan'), item('t', 'Model T', 'table')], undefined)!
    expect(plan.furniture.find((f) => f.id === 't')!.role).toBe('coffee_table')
  })

  it('is undefined for an unknown style', () => {
    expect(presetPlan('nonsense', CATALOG)).toBeUndefined()
  })

  it('every style sets a ceiling, a skirting and a cornice the studio can draw', () => {
    const ceilings: readonly string[] = CEILING_DESIGNS.map((d) => d.id)
    const skirtings: readonly string[] = trimProfilesOf('skirting').map((d) => d.id)
    const cornices: readonly string[] = trimProfilesOf('cornice').map((d) => d.id)
    for (const p of DESIGN_PRESETS) {
      expect(ceilings, p.id).toContain(p.trim.ceiling.design)
      expect(skirtings, p.id).toContain(p.trim.skirting.id)
      if (p.trim.cornice) expect(cornices, p.id).toContain(p.trim.cornice.id)
      const color = p.trim.ceiling.settings?.color
      if (color) expect(color, p.id).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('the classical and national styles get a moulded cornice; hi-tech stays plain', () => {
    const byId = Object.fromEntries(DESIGN_PRESETS.map((p) => [p.id, p]))
    for (const id of ['neoklassika', 'klassik', 'milliy']) {
      expect(byId[id].trim.cornice, id).not.toBeNull()
      expect(byId[id].trim.skirting.id, id).not.toBe('tekis')
    }
    expect(byId.hitech.trim.cornice).toBeNull()
    expect(byId.hitech.trim.skirting.id).toBe('tekis')
    expect(byId.hitech.trim.ceiling.design).toBe('floating')
  })

  it('the plan carries the style\'s ceiling and trim', () => {
    const plan = presetPlan('neoklassika', CATALOG)!
    expect(plan.trim).toBeDefined()
    expect(plan.trim).toEqual(DESIGN_PRESETS.find((p) => p.id === 'neoklassika')!.trim)
  })

  it('every style names a furniture style the catalog knows', () => {
    const known: readonly string[] = FURNITURE_STYLES.map((s) => s.id)
    for (const p of DESIGN_PRESETS) expect(known, p.id).toContain(p.furnitureStyle)
    expect(DESIGN_PRESETS.find((p) => p.id === 'dark')!.furnitureStyle).toBe('zamonaviy')
  })

  it('a style takes a sofa of its own style over one made for the room', () => {
    const cat = [
      { ...item('room', 'Divan', 'divan', 'mehmonxona'), styles: ['klassik'] },
      { ...item('mine', 'Divan', 'divan'), styles: ['hitech'] },
    ]
    expect(presetPlan('hitech', cat, 'mehmonxona')!.furniture[0].id).toBe('mine')
  })

  it('an unstyled piece comes before one of another style', () => {
    const cat = [{ ...item('other', 'Divan', 'divan'), styles: ['milliy'] }, { ...item('any', 'Divan', 'divan'), styles: [] }]
    expect(presetPlan('hitech', cat)!.furniture[0].id).toBe('any')
  })

  it('a piece of its own style comes before an unstyled one', () => {
    const cat = [{ ...item('any', 'Divan', 'divan'), styles: [] }, { ...item('mine', 'Divan', 'divan'), styles: ['hitech'] }]
    expect(presetPlan('hitech', cat)!.furniture[0].id).toBe('mine')
  })

  it('between two pieces of its style, the one made for the room wins', () => {
    const cat = [
      { ...item('other-room', 'Divan', 'divan', 'yotoqxona'), styles: ['hitech'] },
      { ...item('this-room', 'Divan', 'divan', 'mehmonxona'), styles: ['hitech'] },
    ]
    expect(presetPlan('hitech', cat, 'mehmonxona')!.furniture[0].id).toBe('this-room')
  })

  it('with nothing of its style, a piece of another style still fills the room', () => {
    const cat = [{ ...item('other', 'Divan', 'divan'), styles: ['milliy'] }]
    expect(presetPlan('hitech', cat)!.furniture[0].id).toBe('other')
  })

  it('a shop listing without a 3-D model is never picked', () => {
    const cat = [{ ...item('photo-only', 'Divan', 'divan', 'mehmonxona'), glb_url: null }, item('model', 'Divan', 'divan')]
    expect(presetPlan('hitech', cat, 'mehmonxona')!.furniture.map((f) => f.id)).toEqual(['model'])
    expect(presetPlan('hitech', [cat[0]], 'mehmonxona')!.furniture).toEqual([])
  })

  it('a catalog with no styles at all (or an old cached one without the field) picks by room as before', () => {
    const cat = [item('any', 'Divan', 'divan'), item('room', 'Divan', 'divan', 'mehmonxona')]
    expect(presetPlan('hitech', cat, 'mehmonxona')!.furniture[0].id).toBe('room')
  })

  describe('kind role and pick order', () => {
    const roleOf = (plan: ReturnType<typeof presetPlan>, id: string) => plan!.furniture.find((f) => f.id === id)?.role
    const tvPreset = DESIGN_PRESETS.find((p) => p.furniture.some((w) => w.kind === 'tumba'))!.id
    const tablePreset = DESIGN_PRESETS.find((p) => p.furniture.some((w) => w.kind === 'stol'))!.id

    it('prefers a TV tumba over a tumbochka', () => {
      const cat = [item('tumbochka', 'Tumbochka', 'tumba'), item('tvt', 'TV tumba', 'tumba')]
      expect(roleOf(presetPlan(tvPreset, cat), 'tvt')).toBe('tv_unit')
      expect(roleOf(presetPlan(tvPreset, cat), 'tumbochka')).toBeUndefined()
    })

    it('places a lone tumbochka as the tv unit, not dropped', () => {
      expect(roleOf(presetPlan(tvPreset, [item('tumbochka', 'Tumbochka', 'tumba')]), 'tumbochka')).toBe('tv_unit')
    })

    it('prefers a jurnal stoli over a dining table', () => {
      const cat = [item('ovqat', 'Ovqat stoli', 'stol'), item('jurnal', 'Jurnal stoli', 'stol')]
      expect(roleOf(presetPlan(tablePreset, cat), 'jurnal')).toBe('coffee_table')
    })

    it('a lone dining table becomes the coffee table', () => {
      expect(roleOf(presetPlan(tablePreset, [item('ovqat', 'Ovqat stoli', 'stol')]), 'ovqat')).toBe('coffee_table')
    })
  })
})
