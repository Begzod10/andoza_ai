import { describe, it, expect } from 'vitest'
import { computeProject, EMPTY_PRICE_BOOK, hardwareCounts, validateProject } from '../index'
import { doorCount } from '../rules/doors'
import { DEFAULTS, newCabinet, newProject } from '../model'
import type { CabinetSpec, ConstructionDefaults, FurnitureProject } from '../model'

const codes = (ws: { code: string }[]) => ws.map(w => w.code)
const LDSP: ConstructionDefaults['facade'] = { kind: 'ldsp', materialId: null, thickness: 18, gap: 2 }
const MDF: ConstructionDefaults['facade'] = { kind: 'mdf', materialId: 'mdf1', thickness: 19, gap: 2 }

function project(cab: Partial<CabinetSpec> = {}, facade = LDSP): FurnitureProject {
  const p = newProject('x')
  p.defaults.facade = facade
  p.cabinets = [{ ...p.cabinets[0], id: 'c1', label: 'M1', ...cab }]
  return p
}
const doors = (p: FurnitureProject) => computeProject(p, EMPTY_PRICE_BOOK, {}).parts.filter(x => x.role === 'door')

describe('doors', () => {
  it('600 base, one LDSP door 718×598, cut 714×594, all four sides banded', () => {
    const [d] = doors(project())
    expect(d).toMatchObject({ id: 'M1-08', material: 'facade', thickness: 18, grain: 'length' })
    expect(d.finished).toEqual({ length: 718, width: 598 })
    expect(d.cut).toEqual({ length: 714, width: 594 })
    expect(Object.values(d.edges).every(e => e?.band === 'visible')).toBe(true)
    // in front of the 560 mm box
    expect(d.placement.z - d.placement.sz / 2).toBe(560)
  })

  it('800 base gets two doors 718×398', () => {
    const ds = doors(project({ width: 800 }))
    expect(ds.map(x => [x.finished.length, x.finished.width])).toEqual([[718, 398], [718, 398]])
    const [a, b] = ds.map(x => x.placement)
    expect(b.x - b.sx / 2 - (a.x + a.sx / 2)).toBeGreaterThanOrEqual(2)
  })

  it('door count: auto by width, or as set', () => {
    expect(doorCount({ width: 600 } as CabinetSpec)).toBe(1)
    expect(doorCount({ width: 601 } as CabinetSpec)).toBe(2)
    expect(doorCount({ width: 800, doors: 1 } as CabinetSpec)).toBe(1)
  })

  it('doors: 0 means no door, no hinge, no handle', () => {
    const p = project({ doors: 0 })
    expect(doors(p)).toEqual([])
    const bom = computeProject(p, EMPTY_PRICE_BOOK, {}).bom
    expect(bom.some(b => b.label === 'hinge' || b.label === 'handle')).toBe(false)
  })

  it('LDSP doors nest apart from the carcass', () => {
    const p = project({}, { ...LDSP, materialId: 'oak' })
    const r = computeProject(p, EMPTY_PRICE_BOOK, { oak: { name: 'Oak', price: 700000 } })
    const facade = r.nesting.find(n => n.material === 'facade')!
    expect(facade.materialId).toBe('oak')
    expect(facade.sheets).toHaveLength(1)
    expect(r.bom.find(b => b.kind === 'facade')).toMatchObject({ qty: 1, unit: 'sheet', unitPrice: 700000 })
    // the door's four 2 mm bands count in the visible band metres
    const plain = computeProject(project({ doors: 0 }), EMPTY_PRICE_BOOK, {}).edgeTotals.find(e => e.thickness === 2)!.meters
    const withDoor = r.edgeTotals.find(e => e.thickness === 2)!.meters
    expect(withDoor).toBeCloseTo(plain + (2 * (718 + 50) + 2 * (598 + 50)) / 1000, 1)
  })

  it('MDF doors are an order line, not a part', () => {
    const r = computeProject(project({}, MDF), EMPTY_PRICE_BOOK, {})
    expect(r.parts.some(x => x.role === 'door')).toBe(false)
    expect(r.facadeOrder).toEqual([{ id: 'M1-F1', cabinetId: 'c1', length: 718, width: 598, qty: 1, materialId: 'mdf1' }])
    expect(r.bom.find(b => b.kind === 'facade')).toMatchObject({ unit: 'm2', qty: 0.429, unitPrice: null, total: null })
    expect(r.hasUnpriced).toBe(true)
  })

  it('MDF doors are priced by the square metre', () => {
    const r = computeProject(project({ width: 800 }, MDF), EMPTY_PRICE_BOOK, { mdf1: { name: 'MDF', price: 500000 } })
    expect(r.facadeOrder).toEqual([{ id: 'M1-F1', cabinetId: 'c1', length: 718, width: 398, qty: 2, materialId: 'mdf1' }])
    expect(r.bom.find(b => b.kind === 'facade')).toMatchObject({ qty: 0.572, total: 286000 })
  })

  it('hinges by height', () => {
    const hinges = (cab: CabinetSpec) => hardwareCounts(cab, { ...DEFAULTS, facade: LDSP }).hinge
    expect(hinges(newCabinet('M1', 0, 'base'))).toBe(2)
    expect(hinges({ ...newCabinet('M1', 0, 'tall'), height: 1200 })).toBe(3)
    expect(hinges(newCabinet('M1', 0, 'tall'))).toBe(4)
    expect(hinges({ ...newCabinet('M1', 0, 'base'), width: 800 })).toBe(4)
  })

  it('wall cabinet: two hangers, no legs, 12 confirmats; tall: legs and 12 confirmats', () => {
    expect(hardwareCounts(newCabinet('M1', 0, 'wall'), { ...DEFAULTS, facade: LDSP })).toMatchObject({ leg: 0, hanger: 2, confirmat: 12, handle: 1 })
    expect(hardwareCounts(newCabinet('M1', 0, 'tall'), { ...DEFAULTS, facade: LDSP })).toMatchObject({ leg: 4, hanger: 0, confirmat: 12 })
    expect(hardwareCounts(newCabinet('M1', 0, 'base'), DEFAULTS)).toMatchObject({ leg: 4, hanger: 0, confirmat: 14, hinge: 0, handle: 0 })
  })

  it('old project without facade has no doors', () => {
    const p = project()
    delete (p.defaults as Partial<ConstructionDefaults>).facade
    const r = computeProject(p, EMPTY_PRICE_BOOK, {})
    expect(r.parts.some(x => x.role === 'door')).toBe(false)
    expect(r.facadeOrder).toEqual([])
  })

  it('doors 3 is doors_range; facade gap 6 is settings_invalid', () => {
    expect(codes(validateProject(project({ doors: 3 as 2 })).errors)).toContain('doors_range')
    expect(codes(validateProject(project({}, { ...LDSP, gap: 6 })).errors)).toContain('settings_invalid')
  })
})
