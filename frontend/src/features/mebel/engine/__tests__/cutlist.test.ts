import { describe, it, expect } from 'vitest'
import { edgeTotals, groupParts } from '../cutlist'
import { baseCabinetParts } from '../rules/baseCabinet'
import { DEFAULTS } from '../model'
import type { CabinetSpec, ConstructionDefaults, EdgeSide, Part } from '../model'

const cabM1: CabinetSpec = { id: 'c1', type: 'base', label: 'M1', width: 600, height: 720, depth: 560, shelves: 1, position: { x: 0, z: 0 } }
const cabM2: CabinetSpec = { ...cabM1, id: 'c2', label: 'M2', position: { x: 600, z: 0 } }
const bandOf = (d: ConstructionDefaults) => (_p: Part, s: NonNullable<EdgeSide>) => (s.band === 'visible' ? d.edge.visible : d.edge.hidden)

describe('groupParts', () => {
  it('merges identical parts across cabinets and keeps the ids', () => {
    const g = groupParts([...baseCabinetParts(cabM1, DEFAULTS), ...baseCabinetParts(cabM2, DEFAULTS)])
    const sides = g.find(x => x.cut.length === 719.6)!
    expect(sides.qty).toBe(4)
    expect(sides.partIds).toEqual(['M1-01', 'M1-02', 'M2-01', 'M2-02'])
    expect(g[0].material).toBe('board')
    expect(g[g.length - 1].material).toBe('back')
  })

  it('sorts board parts by length, longest first', () => {
    const g = groupParts(baseCabinetParts(cabM1, DEFAULTS)).filter(x => x.material === 'board')
    expect(g.map(x => x.cut.length)).toEqual([719.6, 564, 564, 564, 562])
    // equal length: wider first
    expect(g.slice(1, 4).map(x => x.cut.width)).toEqual([554, 100, 98])
  })

  it('does not merge parts of different thickness', () => {
    const a = baseCabinetParts(cabM1, DEFAULTS)
    const b = baseCabinetParts(cabM2, { ...DEFAULTS, board: { materialId: null, thickness: 16 } })
    const g = groupParts([...a, ...b])
    const sides = g.filter(x => x.role === 'side_left' || x.role === 'side_right')
    expect(sides.map(x => [x.thickness, x.qty])).toEqual([[18, 2], [16, 2]])
  })

  it('does not merge parts that differ only in banding', () => {
    const a = baseCabinetParts(cabM1, DEFAULTS)
    const b = baseCabinetParts(cabM2, { ...DEFAULTS, edge: { ...DEFAULTS.edge, premilled: true } })
    // premilled sides keep 720 × 556, others are 719.6 × 554: two groups
    expect(groupParts([...a, ...b]).filter(x => x.role === 'side_left').length).toBe(2)
  })
})

describe('edgeTotals', () => {
  it('edge meters for the spec sample', () => {
    const t = edgeTotals(baseCabinetParts(cabM1, DEFAULTS), bandOf(DEFAULTS), DEFAULTS)
    const vis = t.find(x => x.thickness === 2)!
    const hid = t.find(x => x.thickness === 0.4)!
    // visible: sides 2×(720+50) + bottom 564+50 + rail 564+50 + shelf 562+50 = 3380 mm
    expect(vis).toMatchObject({ band: 'visible', width: 22, meters: 3.4, metersWithWaste: 4 })
    // hidden: side tops 2×(556+50) = 1212 mm
    expect(hid).toMatchObject({ band: 'hidden', width: 19, meters: 1.2, metersWithWaste: 2 })
    expect(t).toHaveLength(2)
  })

  it('premilled parts still count band meters', () => {
    const d = { ...DEFAULTS, edge: { ...DEFAULTS.edge, premilled: true } }
    const t = edgeTotals(baseCabinetParts(cabM1, d), bandOf(d), d)
    expect(t.find(x => x.thickness === 2)!.meters).toBe(3.4)
  })

  it('keeps bands of different material apart', () => {
    const d2 = { ...DEFAULTS, edge: { ...DEFAULTS.edge, visible: { ...DEFAULTS.edge.visible, materialId: 'oak' } } }
    const parts = [...baseCabinetParts(cabM1, DEFAULTS), ...baseCabinetParts(cabM2, d2)]
    const t = edgeTotals(parts, (p, s) => bandOf(p.cabinetId === 'c2' ? d2 : DEFAULTS)(p, s), DEFAULTS)
    expect(t.filter(x => x.thickness === 2).map(x => x.materialId).sort()).toEqual([null, 'oak'].sort())
  })
})

describe('groupParts roles', () => {
  it('keeps every role that shares one cut', () => {
    // no visible band: the front and back rails are cut and banded alike
    const d = { ...DEFAULTS, edge: { ...DEFAULTS.edge, visible: { ...DEFAULTS.edge.visible, thickness: 0 as const } } }
    const rails = groupParts(baseCabinetParts(cabM1, d)).find(g => g.partIds.includes('M1-04'))!
    expect(rails.partIds).toEqual(['M1-04', 'M1-05'])
    expect(rails.roles).toEqual(['rail_front', 'rail_back'])
  })

  it('lists a role once when several parts share it', () => {
    const sides = groupParts(baseCabinetParts(cabM1, DEFAULTS)).find(g => g.partIds.includes('M1-01'))!
    expect(sides.roles).toEqual(['side_left', 'side_right'])
    const two = groupParts([...baseCabinetParts(cabM1, DEFAULTS), ...baseCabinetParts(cabM2, DEFAULTS)])
    expect(two.find(g => g.partIds.includes('M1-03'))!.roles).toEqual(['bottom'])
  })
})
