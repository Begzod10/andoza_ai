import { describe, it, expect } from 'vitest'
import { baseCabinetParts, resolveDefaults } from '../rules/baseCabinet'
import { DEFAULTS, newProject } from '../model'
import type { CabinetSpec, ConstructionDefaults, Part } from '../model'

const cab: CabinetSpec = { id: 'c1', type: 'base', label: 'M1', width: 600, height: 720, depth: 560, shelves: 1, position: { x: 0, z: 0 } }

const withDefaults = (patch: Partial<ConstructionDefaults>): ConstructionDefaults => ({ ...DEFAULTS, ...patch })

function bounds(parts: Part[]) {
  const lo = (k: 'x' | 'y' | 'z', s: 'sx' | 'sy' | 'sz') => Math.min(...parts.map(p => p.placement[k] - p.placement[s] / 2))
  const hi = (k: 'x' | 'y' | 'z', s: 'sx' | 'sy' | 'sz') => Math.max(...parts.map(p => p.placement[k] + p.placement[s] / 2))
  return { x: [lo('x', 'sx'), hi('x', 'sx')], y: [lo('y', 'sy'), hi('y', 'sy')], z: [lo('z', 'sz'), hi('z', 'sz')] }
}

describe('baseCabinetParts', () => {
  it('matches the spec sample exactly', () => {
    const parts = baseCabinetParts(cab, DEFAULTS)
    expect(parts.map(p => [p.id, p.role, p.finished.length, p.finished.width, p.cut.length, p.cut.width])).toEqual([
      ['M1-01', 'side_left', 720, 556, 719.6, 554],
      ['M1-02', 'side_right', 720, 556, 719.6, 554],
      ['M1-03', 'bottom', 564, 556, 564, 554],
      ['M1-04', 'rail_front', 564, 100, 564, 98],
      ['M1-05', 'rail_back', 564, 100, 564, 100],
      ['M1-06', 'shelf', 562, 536, 562, 534],
      ['M1-07', 'back', 598, 718, 598, 718],
    ])
    const back = parts.find(p => p.role === 'back')!
    expect(back.thickness).toBe(4)
    expect(back.material).toBe('back')
    expect(back.grain).toBe('none')
    expect(parts.find(p => p.role === 'side_left')!.grain).toBe('length')
    expect(parts.every(p => p.qty === 1)).toBe(true)
  })

  it('bands the front edges visibly and the side tops hidden', () => {
    const parts = baseCabinetParts(cab, DEFAULTS)
    const side = parts.find(p => p.role === 'side_left')!
    expect(side.edges).toEqual({ L1: { band: 'visible', thickness: 2 }, L2: null, W1: { band: 'hidden', thickness: 0.4 }, W2: null })
    expect(parts.find(p => p.role === 'rail_back')!.edges).toEqual({ L1: null, L2: null, W1: null, W2: null })
    expect(parts.find(p => p.role === 'back')!.edges).toEqual({ L1: null, L2: null, W1: null, W2: null })
  })

  it.each([
    ['between_sides', 'hdf_nailed', 18, { side: [720, 556], bottom: [564, 556] }],
    ['under_sides', 'hdf_nailed', 18, { side: [702, 556], bottom: [600, 556] }],
    ['between_sides', 'hdf_groove', 16, { side: [720, 560], bottom: [568, 560] }],
    ['between_sides', 'none', 16, { side: [720, 560], bottom: [568, 560] }],
  ] as const)('%s / %s / %i', (bottomJoint, kind, t, want) => {
    const d = withDefaults({ bottomJoint, board: { materialId: null, thickness: t }, back: { ...DEFAULTS.back, kind } })
    const parts = baseCabinetParts(cab, d)
    const f = (r: string) => { const p = parts.find(x => x.role === r)!; return [p.finished.length, p.finished.width] }
    expect(f('side_left')).toEqual(want.side)
    expect(f('bottom')).toEqual(want.bottom)
    expect(parts.some(p => p.role === 'back')).toBe(kind !== 'none')
  })

  it('groove back: shelf depth leaves room for the back, back sized into the grooves', () => {
    const parts = baseCabinetParts(cab, withDefaults({ back: { ...DEFAULTS.back, kind: 'hdf_groove' } }))
    expect(parts.find(p => p.role === 'shelf')!.finished).toEqual({ length: 562, width: 560 - 16 - 4 - 20 })
    expect(parts.find(p => p.role === 'back')!.finished).toEqual({ length: 600 - 36 + 16 - 2, width: 720 - 18 + 8 - 2 })
  })

  it('makes one part per shelf, numbered after the rails', () => {
    const parts = baseCabinetParts({ ...cab, shelves: 3 }, DEFAULTS)
    expect(parts.filter(p => p.role === 'shelf').map(p => p.id)).toEqual(['M1-06', 'M1-07', 'M1-08'])
    expect(parts[parts.length - 1]).toMatchObject({ id: 'M1-09', role: 'back' })
  })

  it.each([
    ['between_sides', 'hdf_nailed'], ['under_sides', 'hdf_nailed'],
    ['between_sides', 'hdf_groove'], ['under_sides', 'none'],
  ] as const)('outer box is exactly W × H × D (%s / %s)', (bottomJoint, kind) => {
    const parts = baseCabinetParts({ ...cab, position: { x: 1200, z: 0 } }, withDefaults({ bottomJoint, back: { ...DEFAULTS.back, kind } }))
    const b = bounds(parts)
    expect(b.x).toEqual([1200, 1800])
    expect(b.y).toEqual([0, 720])
    expect(b.z[1] - b.z[0]).toBe(560)
  })

  it('no two parts overlap in 3D', () => {
    for (const bottomJoint of ['between_sides', 'under_sides'] as const) {
      for (const kind of ['hdf_nailed', 'hdf_groove'] as const) {
        const parts = baseCabinetParts({ ...cab, shelves: 2 }, withDefaults({ bottomJoint, back: { ...DEFAULTS.back, kind } }))
        for (let i = 0; i < parts.length; i++) {
          for (let j = i + 1; j < parts.length; j++) {
            const a = parts[i].placement, c = parts[j].placement
            const ov = (p: number, sp: number, q: number, sq: number) => Math.min(p + sp / 2, q + sq / 2) - Math.max(p - sp / 2, q - sq / 2)
            const inter = [ov(a.x, a.sx, c.x, c.sx), ov(a.y, a.sy, c.y, c.sy), ov(a.z, a.sz, c.z, c.sz)]
            // A groove back sits in the grooves of the sides and the bottom on purpose; it must not cross the rails.
            const roles = [parts[i].role, parts[j].role]
            const groove = kind === 'hdf_groove' && roles.includes('back') && roles.some(r => r === 'side_left' || r === 'side_right' || r === 'bottom')
            if (!groove) expect(inter.some(v => v <= 0), `${parts[i].id} × ${parts[j].id}`).toBe(true)
          }
        }
      }
    }
  })
})

describe('resolveDefaults', () => {
  it('a cabinet override wins over the project default, the rest is kept', () => {
    const p = newProject('x')
    const c = { ...p.cabinets[0], overrides: { board: { materialId: null, thickness: 16 as const } } }
    const d = resolveDefaults({ ...p, cabinets: [c] }, c)
    expect(d.board.thickness).toBe(16)
    expect(d.back.kind).toBe('hdf_nailed')
    expect(d.edge.visible.thickness).toBe(2)
  })

  it('an edge override replaces one band, not both', () => {
    const p = newProject('x')
    const c = { ...p.cabinets[0], overrides: { edge: { visible: { materialId: 'k', thickness: 1 as const, width: 22 as const } } } as CabinetSpec['overrides'] }
    const d = resolveDefaults({ ...p, cabinets: [c] }, c)
    expect(d.edge.visible).toEqual({ materialId: 'k', thickness: 1, width: 22 })
    expect(d.edge.hidden.thickness).toBe(0.4)
    expect(d.edge.premilled).toBe(false)
  })
})
