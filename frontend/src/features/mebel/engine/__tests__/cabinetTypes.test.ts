import { describe, it, expect } from 'vitest'
import { cabinetParts } from '../rules'
import { computeProject, EMPTY_PRICE_BOOK, validateProject } from '../index'
import { DEFAULTS, newCabinet, newProject } from '../model'
import type { CabinetSpec, ConstructionDefaults, Part } from '../model'

const at = (c: CabinetSpec): CabinetSpec => ({ ...c, id: 'c1', label: 'M1' })
const wall = at(newCabinet('M1', 0, 'wall'))
const tall = at(newCabinet('M1', 0, 'tall'))
const codes = (ws: { code: string }[]) => ws.map(w => w.code)

function bounds(parts: Part[]) {
  const lo = (k: 'x' | 'y' | 'z', s: 'sx' | 'sy' | 'sz') => Math.min(...parts.map(p => p.placement[k] - p.placement[s] / 2))
  const hi = (k: 'x' | 'y' | 'z', s: 'sx' | 'sy' | 'sz') => Math.max(...parts.map(p => p.placement[k] + p.placement[s] / 2))
  return { x: hi('x', 'sx') - lo('x', 'sx'), y: [lo('y', 'sy'), hi('y', 'sy')], z: hi('z', 'sz') - lo('z', 'sz') }
}

describe('wall and tall cabinets', () => {
  it('wall 600×720×300 matches the spec', () => {
    expect(wall).toMatchObject({ type: 'wall', width: 600, height: 720, depth: 300, shelves: 1 })
    const parts = cabinetParts(wall, DEFAULTS)
    expect(parts.map(p => [p.id, p.role, p.finished.length, p.finished.width])).toEqual([
      ['M1-01', 'side_left', 720, 296], ['M1-02', 'side_right', 720, 296],
      ['M1-03', 'bottom', 564, 296], ['M1-04', 'top', 564, 296],
      ['M1-05', 'shelf', 562, 276], ['M1-06', 'back', 598, 718],
    ])
    expect(parts.find(p => p.role === 'top')!.edges.L1).toEqual({ band: 'visible', thickness: 2 })
  })

  it('tall 600×2100×560 has four shelves', () => {
    expect(tall).toMatchObject({ type: 'tall', width: 600, height: 2100, depth: 560, shelves: 4 })
    const roles = cabinetParts(tall, DEFAULTS).map(p => p.role)
    expect(roles).toEqual(['side_left', 'side_right', 'bottom', 'top', 'shelf', 'shelf', 'shelf', 'shelf', 'back'])
  })

  it('groove back on a wall cabinet sits in top and bottom', () => {
    const d: ConstructionDefaults = { ...DEFAULTS, back: { ...DEFAULTS.back, kind: 'hdf_groove' } }
    expect(cabinetParts(wall, d).find(p => p.role === 'back')!.finished).toEqual({ length: 600 - 36 + 16 - 2, width: 720 - 36 + 16 - 2 })
  })

  const variants = (['wall', 'tall'] as const).flatMap(type =>
    (['hdf_nailed', 'hdf_groove', 'none'] as const).flatMap(kind => ([16, 18] as const).map(t => [type, kind, t] as const)))
  it.each(variants)('%s / %s / %i: outer box is W × H × D and nothing crosses', (type, kind, t) => {
    const cab = at(newCabinet('M1', 0, type))
    const d: ConstructionDefaults = { ...DEFAULTS, board: { materialId: null, thickness: t }, back: { ...DEFAULTS.back, kind } }
    const parts = cabinetParts(cab, d)
    const b = bounds(parts)
    expect([b.x, b.y[0], b.y[1], b.z]).toEqual([cab.width, 0, cab.height, cab.depth])
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        const roles = [parts[i].role, parts[j].role]
        if (kind === 'hdf_groove' && roles.includes('back') && roles.some(r => r !== 'back' && r !== 'shelf')) continue
        const a = parts[i].placement, c = parts[j].placement
        const ov = (p: number, sp: number, q: number, sq: number) => Math.min(p + sp / 2, q + sq / 2) - Math.max(p - sp / 2, q - sq / 2)
        expect([ov(a.x, a.sx, c.x, c.sx), ov(a.y, a.sy, c.y, c.sy), ov(a.z, a.sz, c.z, c.sz)].some(v => v <= 0), `${parts[i].id} × ${parts[j].id}`).toBe(true)
      }
    }
  })

  it('limits follow the type', () => {
    const p = newProject('x')
    p.cabinets = [{ ...wall, depth: 450 }]
    expect(codes(validateProject(p).errors)).toContain('depth_range')
    p.cabinets = [{ ...tall, height: 720 }]
    expect(codes(validateProject(p).errors)).toContain('height_range')
    p.cabinets = [{ ...tall, shelves: 8 }]
    expect(validateProject(p).errors).toEqual([])
    p.cabinets = [{ ...tall, shelves: 9 }]
    expect(codes(validateProject(p).errors)).toContain('shelves_range')
  })

  it('an old project without type is a base cabinet', () => {
    const p = newProject('x')
    const typed = computeProject(p, EMPTY_PRICE_BOOK, {})
    const old = structuredClone(p)
    delete (old.cabinets[0] as Partial<CabinetSpec>).type
    expect(computeProject(old, EMPTY_PRICE_BOOK, {}).parts).toEqual(typed.parts)
  })
})
