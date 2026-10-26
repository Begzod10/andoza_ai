import { describe, it, expect } from 'vitest'
import i18n from '@/i18n'
import type { CatalogFurniture } from '@/lib/api'
import { FLOOR_PATTERN_DEFS } from '@/lib/floorGeometry'
import { LIGHT_TYPES } from '@/lib/lightCatalog'
import { OBOY_PATTERNS } from '@/lib/oboyPatterns'
import { CEILING_DESIGNS } from '@/lib/ceilingDesigns'
import { trimProfilesOf } from '@/lib/trimProfiles'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import presetData from '@/lib/data/design_presets.json'
import { FURNITURE_STYLES } from '../furnitureStyles'
import { DESIGN_PRESETS, presetPlan, roomSizeOf, type RoomSize } from '../aiDesignPresets'
import type { RoomGeometry } from '@/store/roomStore'

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

  it("a children's room and a study take the catalog's bedroom and living-room pieces, as the AI designer does", () => {
    const rugs = [item('kitchen-rug', 'Gilam', 'gilam', 'oshxona'), item('bed-rug', 'Gilam', 'gilam', 'yotoqxona')]
    expect(presetPlan('dark', rugs, 'bolalar')!.furniture.map((f) => f.id)).toEqual(['bed-rug'])
    const arms = [item('bedroom-arm', 'Kreslo', 'kreslo', 'yotoqxona'), item('living-arm', 'Kreslo', 'kreslo', 'mehmonxona')]
    expect(presetPlan('minimalist', arms, 'kabinet')!.furniture.map((f) => f.id)).toEqual(['living-arm'])
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

  it("a piece made for another room comes after one for this room or any room, whatever its style", () => {
    for (const room_type of ['mehmonxona', null]) {
      const cat = [
        { ...item('kitchen', 'Oshxona shkafi', 'shkaf', 'oshxona'), styles: ['milliy'] },
        { ...item('javon', 'Javon', 'shkaf', room_type), styles: ['skandinav'] },
      ]
      expect(presetPlan('milliy', cat, 'mehmonxona')!.furniture.map((f) => f.id), String(room_type)).toEqual(['javon'])
    }
  })

  it.each(DESIGN_PRESETS.map((p) => p.id))('%s in a living room still takes the coffee table over a kitchen one for its coffee table', (id) => {
    const cat = [item('kitchen-table', 'Oshxona stoli', 'stol', 'mehmonxona'), item('coffee', 'Kofe stoli', 'stol', 'oshxona')]
    expect(presetPlan(id, cat, 'mehmonxona')!.furniture.map((f) => [f.id, f.role])).toEqual([['coffee', 'coffee_table']])
  })

  it.each(DESIGN_PRESETS.map((p) => p.id))('%s in a kitchen takes the dining table, not the coffee table', (id) => {
    const cat = [item('coffee', 'Kofe stoli', 'stol', 'mehmonxona'), item('kitchen-table', 'Oshxona stoli', 'stol', 'oshxona')]
    expect(presetPlan(id, cat, 'oshxona')!.furniture.map((f) => [f.id, f.role])).toEqual([['kitchen-table', 'dining_table']])
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

  describe("a bedroom or a children's room gets a bedroom set", () => {
    const BEDROOM = [
      item('sofa', "Uch o'rinli divan", 'divan', 'mehmonxona'),
      item('table', 'Kofe stoli', 'stol', 'mehmonxona'),
      item('books', 'Kitob shkafi', 'shkaf', 'yotoqxona'),
      item('bed', 'Karavot 160', 'karavot', 'yotoqxona'),
      item('kids-bed', 'Bolalar karavoti', 'karavot', 'yotoqxona'),
      item('night', 'Tumbochka', 'boshqa', 'yotoqxona'),
      item('wardrobe', 'Kiyim shkafi', 'shkaf', 'yotoqxona'),
      item('desk', 'Yozuv stoli', 'stol', 'yotoqxona'),
      item('desk-chair', 'Ish stuli', 'stul', 'yotoqxona'),
      item('rug', 'Gilam', 'gilam'),
    ]
    const ids = (id: string, roomType: string, cat = BEDROOM) => presetPlan(id, cat, roomType)!.furniture.map((f) => f.id)

    it.each(DESIGN_PRESETS.map((p) => p.id))('%s in a bedroom: bed, nightstand, wardrobe and rug, no sofa or coffee table', (id) => {
      expect(presetPlan(id, BEDROOM, 'yotoqxona')!.furniture.map((f) => [f.id, f.role])).toEqual([
        ['bed', 'bed'], ['night', 'nightstand'], ['wardrobe', 'wardrobe'], ['rug', 'rug'],
      ])
      expect(ids(id, 'yotoqxona', BEDROOM.filter((c) => c.id !== 'rug'))).toEqual(['bed', 'night', 'wardrobe'])
    })

    it("a children's room also gets a desk, and takes the children's bed", () => {
      for (const p of DESIGN_PRESETS) {
        expect(presetPlan(p.id, BEDROOM, 'bolalar')!.furniture.map((f) => [f.id, f.role]), p.id).toEqual([
          ['kids-bed', 'bed'], ['night', 'nightstand'], ['wardrobe', 'wardrobe'], ['rug', 'rug'], ['desk', 'desk'],
        ])
      }
    })

    it("a children's piece is the last choice outside a children's room", () => {
      const kids = { ...item('kids-bed', 'Bolalar karavoti', 'karavot', 'yotoqxona'), styles: ['zamonaviy'] }
      expect(ids('zamonaviy', 'yotoqxona', [kids, item('bed', 'Karavot', 'karavot', 'yotoqxona')])).toEqual(['bed'])
      expect(ids('zamonaviy', 'yotoqxona', [kids])).toEqual(['kids-bed'])
    })

    it('the bed, nightstand and wardrobe of the style come first', () => {
      const cat = [
        ...BEDROOM,
        { ...item('bed-z', 'Karavot Grafit', 'karavot', 'yotoqxona'), styles: ['zamonaviy'] },
        { ...item('night-z', 'Tumbochka Grafit', 'boshqa', 'yotoqxona'), styles: ['zamonaviy'] },
        { ...item('wardrobe-z', 'Kiyim shkafi Grafit', 'shkaf', 'yotoqxona'), styles: ['zamonaviy'] },
      ]
      expect(ids('zamonaviy', 'yotoqxona', cat)).toEqual(['bed-z', 'night-z', 'wardrobe-z', 'rug'])
    })

    it('a bookcase is never the wardrobe', () => {
      const cat = BEDROOM.filter((c) => c.id !== 'wardrobe')
      for (const p of DESIGN_PRESETS) {
        expect(ids(p.id, 'yotoqxona', cat), p.id).not.toContain('books')
        expect(ids(p.id, 'bolalar', cat), p.id).not.toContain('books')
      }
    })

    describe("the bed fits the room's size", () => {
      const bed = (id: string, name: string, w: number | null, styles: string[] = []) =>
        ({ ...item(id, name, 'karavot', 'yotoqxona'), footprint_w: w, footprint_d: 200, styles })
      const BEDS = [bed('single', 'Bir kishilik karavot', 90), bed('double', 'Karavot 160', 160, ['skandinav'])]
      const bedOf = (id: string, roomType: string, roomSize?: RoomSize, cat = BEDS) =>
        presetPlan(id, cat, roomType, undefined, roomSize)!.furniture.find((f) => f.role === 'bed')!.id

      it('a normal bedroom takes the wide bed over an unstyled single one', () => {
        expect(bedOf('hitech', 'yotoqxona', { area: 14, minSide: 3.5 })).toBe('double')
      })

      it('a small bedroom (under 10 m2 or under 2.6 m across) takes the narrow bed', () => {
        expect(bedOf('hitech', 'yotoqxona', { area: 7.8, minSide: 2.6 })).toBe('single') // 7.8 m2
        expect(bedOf('hitech', 'yotoqxona', { area: 12.5, minSide: 2.5 })).toBe('single') // 12.5 m2, but 2.5 m across
      })

      it('with no room size, or a bed with no footprint, the pick is as before', () => {
        expect(bedOf('hitech', 'yotoqxona')).toBe('single')
        const unknown = [bed('single', 'Bir kishilik karavot', null), bed('double', 'Karavot 160', 160, ['skandinav'])]
        expect(bedOf('hitech', 'yotoqxona', { area: 7.8, minSide: 2.6 }, unknown)).toBe('single')
      })

      it('a bed between single and double comes after a bed that fits, before one that does not', () => {
        const normal = [bed('single', 'Bir kishilik karavot', 90), bed('mid', 'Karavot 130', 130, ['skandinav'])]
        expect(bedOf('hitech', 'yotoqxona', { area: 14, minSide: 3.5 }, normal)).toBe('mid')
        const small = [bed('double', 'Karavot 160', 160, ['hitech']), bed('mid', 'Karavot 130', 130, ['skandinav'])]
        expect(bedOf('hitech', 'yotoqxona', { area: 7.8, minSide: 2.6 }, small)).toBe('mid')
        expect(bedOf('hitech', 'yotoqxona', { area: 14, minSide: 3.5 }, [...normal, bed('double', 'Karavot 160', 160, ['skandinav'])])).toBe('double')
      })

      it("a bed's width is its shorter side, whichever way round the catalog stores it", () => {
        const turned = [
          { ...bed('single', 'Bir kishilik karavot', 200), footprint_d: 90 },
          { ...bed('double', 'Karavot 160', 160, ['hitech']), footprint_d: 200 },
        ]
        expect(bedOf('hitech', 'yotoqxona', { area: 7.8, minSide: 2.6 }, turned)).toBe('single')
      })

      it("a children's room follows the same rule, but its children's bed still comes first", () => {
        expect(bedOf('hitech', 'bolalar', { area: 14, minSide: 3.5 })).toBe('double')
        expect(bedOf('hitech', 'bolalar', { area: 7.8, minSide: 2.6 })).toBe('single')
        const kids = [...BEDS, bed('kids', 'Bolalar karavoti', 90)]
        expect(bedOf('hitech', 'bolalar', { area: 14, minSide: 3.5 }, kids)).toBe('kids')
      })
    })

    it("a living room keeps the preset's own furniture", () => {
      for (const p of DESIGN_PRESETS) {
        expect(presetPlan(p.id, BEDROOM, 'mehmonxona')!.furniture.map((f) => f.role), p.id).not.toContain('bed')
      }
      expect(ids('dark', 'mehmonxona', CATALOG)).toEqual(['sofa', 'table', 'rug', 'tv', 'chair'])
    })
  })

  describe('a kitchen, a study, a balcony and a bathroom get their own sets', () => {
    const ROOMS = [
      item('sofa', "Uch o'rinli divan", 'divan', 'mehmonxona'),
      item('coffee', 'Kofe stoli', 'stol', 'mehmonxona'),
      item('tv', 'Televizor tumbasi', 'tumba', 'mehmonxona'),
      item('rug', 'Gilam', 'gilam'),
      item('armchair', 'Kreslo', 'kreslo', 'mehmonxona'),
      item('dining', 'Oshxona stoli', 'stol', 'oshxona'),
      item('chair', 'Oshxona stuli', 'stul', 'oshxona'),
      item('kitchen-cabinet', 'Oshxona shkafi', 'shkaf', 'oshxona'),
      item('desk', 'Yozuv stoli', 'stol'),
      item('desk-chair', 'Ish stuli', 'stul'),
      item('books', 'Kitob javoni', 'shkaf'),
      item('bath-cabinet', 'Vanna shkafi', 'shkaf', 'hammom'),
    ]
    const TILE = { type: 'tile', pattern: null, tint: null }
    const LIVING_ROLES = ['sofa', 'coffee_table', 'tv_unit', 'armchair', 'rug']
    const plan = (id: string, roomType: string | undefined, cat = ROOMS) => presetPlan(id, cat, roomType)!
    const pairs = (id: string, roomType: string | undefined, cat = ROOMS) => plan(id, roomType, cat).furniture.map((f) => [f.id, f.role])
    const presets = DESIGN_PRESETS.map((p) => p.id)

    it.each(presets)('%s in a kitchen: a dining table, its chairs and a kitchen cabinet, no sofa or coffee table, on tile', (id) => {
      // Chairs share one plan line: the layout seats as many as the table takes.
      expect(pairs(id, 'oshxona')).toEqual([['dining', 'dining_table'], ['chair', 'dining_chair'], ['kitchen-cabinet', 'wardrobe']])
      expect(plan(id, 'oshxona').floor).toEqual(TILE)
      // No kitchen cabinet in the catalog: none is guessed (a bookcase or a bath cabinet is not one).
      expect(pairs(id, 'oshxona', ROOMS.filter((c) => c.id !== 'kitchen-cabinet'))).toEqual([['dining', 'dining_table'], ['chair', 'dining_chair']])
    })

    it.each(presets)('%s in a study: a desk, a desk chair, a bookcase and an armchair', (id) => {
      expect(pairs(id, 'kabinet')).toEqual([['desk', 'desk'], ['desk-chair', 'desk_chair'], ['books', 'shelf'], ['armchair', 'armchair']])
      expect(plan(id, 'kabinet').floor).toEqual(DESIGN_PRESETS.find((p) => p.id === id)!.floor)
    })

    it.each(presets)('%s on a balcony: a small table and two seats', (id) => {
      expect(pairs(id, 'balkon')).toEqual([['coffee', 'coffee_table'], ['armchair', 'armchair'], ['chair', 'armchair']])
      expect(plan(id, 'balkon').floor).toEqual(DESIGN_PRESETS.find((p) => p.id === id)!.floor)
    })

    it.each(presets)('%s in a bathroom: no living-room furniture, a tile floor, a bath cabinet when the catalog has one', (id) => {
      expect(pairs(id, 'hammom')).toEqual([['bath-cabinet', 'wardrobe']])
      expect(plan(id, 'hammom').floor).toEqual(TILE)
      expect(pairs(id, 'hammom', ROOMS.filter((c) => c.id !== 'bath-cabinet'))).toEqual([])
    })

    it.each(presets)('%s in a living room, a bedroom, a children\'s room or an unknown room is as before', (id) => {
      const preset = DESIGN_PRESETS.find((p) => p.id === id)!
      for (const roomType of ['mehmonxona', 'yotoqxona', 'bolalar', undefined]) {
        expect(plan(id, roomType).floor, String(roomType)).toEqual(preset.floor)
      }
      for (const roomType of ['mehmonxona', undefined]) {
        const roles = plan(id, roomType).furniture.map((f) => f.role)
        expect(roles, String(roomType)).toContain('sofa')
        expect(roles.filter((r) => !LIVING_ROLES.includes(r!) && r !== 'wardrobe' && r !== 'shelf'), String(roomType)).toEqual([])
      }
      // The bedroom set (this catalog has no bed, nightstand or wardrobe): no kitchen or study piece comes in.
      expect(pairs(id, 'yotoqxona')).toEqual([['rug', 'rug']])
      expect(pairs(id, 'bolalar')).toEqual([['rug', 'rug'], ['desk', 'desk']])
    })

    it('a kitchen takes a table that seats four over a larger one of its style, and the larger one when it is all there is', () => {
      const big = { ...item('big', 'Ovqat stoli', 'stol', 'oshxona'), footprint_w: 180, footprint_d: 90, styles: ['hitech'] }
      const four = { ...item('four', 'Ovqat stoli', 'stol', 'oshxona'), footprint_w: 120, footprint_d: 80 }
      expect(plan('hitech', 'oshxona', [big, four]).furniture.map((f) => f.id)).toEqual(['four'])
      expect(plan('hitech', 'oshxona', [big]).furniture.map((f) => f.id)).toEqual(['big'])
    })

    it("a balcony prefers pieces made for a balcony, and takes another room's when there are none", () => {
      const cat = [item('living-arm', 'Kreslo', 'kreslo', 'mehmonxona'), item('balcony-arm', 'Kreslo', 'kreslo', 'balkon'), item('coffee', 'Kofe stoli', 'stol', 'mehmonxona')]
      expect(plan('loft', 'balkon', cat).furniture.map((f) => f.id)).toEqual(['coffee', 'balcony-arm', 'living-arm'])
    })

    it('a bedside or a writing table is never the small table on a balcony; a side table is', () => {
      const cat = [item('night', 'Tumbochka', 'boshqa'), item('desk', 'Yozuv stoli', 'stol'), item('side', 'Yon stolcha', 'stol')]
      expect(pairs('loft', 'balkon', cat)).toEqual([['side', 'coffee_table']])
    })
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

describe("a room's size for the bed rule, as the backend reads it", () => {
  const walls = (ids: string[], lengths: number[]) => ids.map((id, i) => ({ id, length: lengths[i], elements: [] }))

  it('an ABCD room: wall A by wall B', () => {
    expect(roomSizeOf({ walls: walls(['A', 'B', 'C', 'D'], [4000, 3500, 4000, 3500]) })).toEqual({ area: 14, minSide: 3.5 })
  })

  it('an L-shaped room: the floor of its outline, not of its bounding box', () => {
    // 4 x 4 m with a 2 x 2 m corner cut out: 12 m2, where the box says 16.
    const vertices: [number, number][] = [[0, 0], [4000, 0], [4000, 2000], [2000, 2000], [2000, 4000], [0, 4000]]
    const size = roomSizeOf({ walls: walls(['W1', 'W2', 'W3', 'W4', 'W5', 'W6'], [4000, 2000, 2000, 2000, 2000, 4000]), vertices })!
    expect(size.area).toBeCloseTo(12)
    expect(size.minSide).toBe(2) // the first two walls, as the backend has it
  })

  it('a rotated rectangle (a RoomPlan scan) keeps its own size', () => {
    const c = Math.SQRT1_2
    const vertices: [number, number][] = [[0, 0], [3000 * c, 3000 * c], [500 * c, 5500 * c], [-2500 * c, 2500 * c]]
    const size = roomSizeOf({ walls: walls(['W1', 'W2', 'W3', 'W4'], [3000, 2500, 3000, 2500]), vertices })!
    expect(size.area).toBeCloseTo(7.5)
    expect(size.minSide).toBe(2.5)
  })

  it('a room with no real dimensions has no size, rather than the 4 x 3 fallback', () => {
    expect(roomSizeOf({ walls: [] } as RoomGeometry)).toBeUndefined()
    expect(roomSizeOf({ walls: walls(['A', 'B'], [0, 0]) })).toBeUndefined()
  })
})

describe('shared presets json', () => {
  it('DESIGN_PRESETS ids unchanged', () => {
    expect(DESIGN_PRESETS.map((p) => p.id)).toEqual([
      'neoklassika', 'zamonaviy', 'hitech', 'milliy', 'dark', 'skandinav', 'klassik', 'loft', 'minimalist',
    ])
  })
  it('trim profile ids in JSON equal trimProfiles.ts ids', () => {
    expect(presetData.trimProfiles.skirting).toEqual(trimProfilesOf('skirting').map((p) => p.id))
    expect(presetData.trimProfiles.cornice).toEqual(trimProfilesOf('cornice').map((p) => p.id))
    expect(presetData.trimProfiles.ceiling).toEqual(CEILING_DESIGNS.map((d) => d.id))
  })
  it('backend copy is byte-identical', () => {
    const f = resolve(__dirname, '../data/design_presets.json')
    const b = resolve(__dirname, '../../../../backend/app/data/design_presets.json')
    expect(readFileSync(f)).toEqual(readFileSync(b))
  })
})
