import { describe, it, expect } from 'vitest'
import { computeProject, EMPTY_PRICE_BOOK, hardwareCounts, validateProject } from '../index'
import { DEFAULTS, newProject } from '../model'
import type { CabinetSpec, PriceBook } from '../model'

const codes = (ws: { code: string }[]) => ws.map(w => w.code)

describe('computeProject', () => {
  it('prices the sample from the price book and the catalogue', () => {
    const p = newProject('x')
    p.defaults.board.materialId = 'ldsp1'
    p.defaults.edge.visible.materialId = 'k2'
    const prices: PriceBook = {
      ...EMPTY_PRICE_BOOK, materials: { ldsp1: 520000 }, cutPerSheet: 40000,
      bandingPerMeter: { '0.4': 1500, '1': null, '2': 3000 }, markupPercent: 30,
    }
    const r = computeProject(p, prices, { k2: { name: 'Kromka 2', price: 2500 } })
    expect(r.bom.find(b => b.kind === 'board')).toMatchObject({ qty: 1, unit: 'sheet', unitPrice: 520000, total: 520000 })
    expect(r.bom.find(b => b.kind === 'edge' && b.materialId === 'k2')).toMatchObject({ qty: 4, unit: 'm', unitPrice: 2500, total: 10000 })
    // cutting: 2 sheets (LDSP + HDF) × 40 000; banding: 4 m × 3000 + 2 m × 1500
    expect(r.bom.find(b => b.label === 'cut')).toMatchObject({ qty: 2, total: 80000 })
    expect(r.bom.find(b => b.label === 'banding_2')).toMatchObject({ qty: 4, total: 12000 })
    expect(r.bom.find(b => b.label === 'banding_0.4')).toMatchObject({ qty: 2, total: 3000 })
    const priced = 520000 + 10000 + 80000 + 12000 + 3000
    expect(r.bom.find(b => b.label === 'markup')).toMatchObject({ total: Math.round(priced * 0.3) })
    expect(r.total).toBe(priced + Math.round(priced * 0.3))
    expect(r.hasUnpriced).toBe(true) // HDF, the hidden band and the hardware have no price
    expect(codes(r.warnings)).toContain('unpriced')
  })

  it('an unknown materialId is unpriced, not zero', () => {
    const p = newProject('x')
    p.defaults.board.materialId = 'gone'
    const r = computeProject(p, EMPTY_PRICE_BOOK, {})
    expect(r.bom.find(b => b.kind === 'board')).toMatchObject({ unitPrice: null, total: null })
    expect(r.total).toBeNull()
  })

  it('out-of-range width is an error and stops the calculation', () => {
    const p = newProject('x')
    p.cabinets[0].width = 100
    const r = computeProject(p, EMPTY_PRICE_BOOK, {})
    expect(codes(r.errors)).toContain('width_range')
    expect(r.errors[0].cabinetId).toBe(p.cabinets[0].id)
    expect(r.parts).toEqual([])
    expect(r.bom).toEqual([])
  })

  it('warns about shelf sag on long 16 mm shelves', () => {
    const p = newProject('x')
    p.cabinets[0].width = 1000
    p.defaults.board.thickness = 16
    expect(codes(computeProject(p, EMPTY_PRICE_BOOK, {}).warnings)).toContain('shelf_sag')
    p.defaults.board.thickness = 18
    expect(codes(computeProject(p, EMPTY_PRICE_BOOK, {}).warnings)).not.toContain('shelf_sag')
  })

  it('a part bigger than the sheet warns but still computes', () => {
    const p = newProject('x')
    p.defaults.sheet = { length: 600, width: 500 }
    const r = computeProject(p, EMPTY_PRICE_BOOK, {})
    expect(codes(r.warnings)).toContain('part_exceeds_sheet')
    expect(r.parts.length).toBeGreaterThan(0)
  })

  it('a grained part may not be turned to fit the sheet', () => {
    const p = newProject('x')
    // the 719.6 mm side fits across a 2800 × 750 sheet only if turned, which its grain forbids
    p.defaults.sheet = { length: 700, width: 2800 }
    expect(codes(computeProject(p, EMPTY_PRICE_BOOK, {}).warnings)).toContain('part_exceeds_sheet')
  })

  it('uses a cabinet override in the parts and in the cut list', () => {
    const p = newProject('x')
    p.cabinets.push({ ...p.cabinets[0], id: 'c2', label: 'M2', position: { x: 600, z: 0 }, overrides: { board: { materialId: null, thickness: 16 } } })
    const r = computeProject(p, EMPTY_PRICE_BOOK, {})
    expect(new Set(r.groups.filter(g => g.material === 'board').map(g => g.thickness))).toEqual(new Set([18, 16]))
    expect(r.sheets.filter(s => s.material === 'board')).toHaveLength(2)
  })
})

describe('validateProject', () => {
  it('flags every range error with its cabinet', () => {
    const p = newProject('x')
    Object.assign(p.cabinets[0], { width: 1300, height: 200, depth: 800, shelves: 5 })
    expect(codes(validateProject(p).errors).sort()).toEqual(['depth_range', 'height_range', 'shelves_range', 'width_range'])
  })

  it('a shelf with no depth left is an error', () => {
    const p = newProject('x')
    p.cabinets[0].depth = 250
    p.defaults.shelfSetback = 260
    expect(codes(validateProject(p).errors)).toContain('shelf_depth')
  })

  it('more than 30 cabinets is an error', () => {
    const p = newProject('x')
    p.cabinets = Array.from({ length: 31 }, (_, i) => ({ ...p.cabinets[0], id: `c${i}`, label: `M${i + 1}` }))
    expect(codes(validateProject(p).errors)).toContain('too_many_cabinets')
  })
})

describe('hardwareCounts', () => {
  it('counts legs, confirmats, shelf pins and back nails', () => {
    const cab = { width: 900, height: 720, shelves: 2 } as CabinetSpec
    expect(hardwareCounts(cab, DEFAULTS)).toEqual({ leg: 6, confirmat: 14, shelfPin: 8, nail: 33 })
    expect(hardwareCounts({ ...cab, width: 600 }, DEFAULTS).leg).toBe(4)
  })

  it('no back, no nails', () => {
    const cab = { width: 600, height: 720, shelves: 0 } as CabinetSpec
    expect(hardwareCounts(cab, { ...DEFAULTS, back: { ...DEFAULTS.back, kind: 'none' } }).nail).toBe(0)
  })
})

describe('review fixes', () => {
  it('a band of thickness 0 is no band: no edge, no metres, no BOM line', () => {
    const p = newProject('x')
    p.defaults.edge.hidden = { ...p.defaults.edge.hidden, thickness: 0, materialId: 'k04' }
    const r = computeProject(p, EMPTY_PRICE_BOOK, { k04: { name: 'k', price: 1000 } })
    expect(r.parts.find(x => x.role === 'side_left')!.edges.W1).toBeNull()
    expect(r.edgeTotals.some(e => e.thickness === 0)).toBe(false)
    expect(r.bom.some(b => b.kind === 'edge' && b.materialId === 'k04')).toBe(false)
  })

  it('a fractional size is an error (the server stores whole mm)', () => {
    const p = newProject('x')
    p.cabinets[0].width = 600.5
    expect(codes(validateProject(p).errors)).toContain('whole_mm')
  })

  it.each([
    ['sheet length cleared', (p: ReturnType<typeof newProject>) => { p.defaults.sheet.length = Number.NaN }],
    ['sheet width zero', (p: ReturnType<typeof newProject>) => { p.defaults.sheet.width = 0 }],
    ['sheet from a saved null', (p: ReturnType<typeof newProject>) => { (p.defaults.sheet as { length: unknown }).length = null }],
  ])('%s is an error, not an Infinity sheet count', (_name, mutate) => {
    const p = newProject('x')
    mutate(p)
    const r = computeProject(p, EMPTY_PRICE_BOOK, {})
    expect(codes(r.errors)).toContain('sheet_size')
    expect(r.parts).toEqual([])
  })

  it('a grooved back is not nailed', () => {
    const cab = { width: 600, height: 720, shelves: 0 } as CabinetSpec
    expect(hardwareCounts(cab, { ...DEFAULTS, back: { ...DEFAULTS.back, kind: 'hdf_groove' } }).nail).toBe(0)
  })
})
