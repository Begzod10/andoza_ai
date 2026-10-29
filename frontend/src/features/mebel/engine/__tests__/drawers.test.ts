import { describe, it, expect } from 'vitest'
import { computeProject, EMPTY_PRICE_BOOK, validateProject } from '../index'
import { slideLength } from '../rules/drawers'
import { newProject } from '../model'
import type { CabinetSpec, ConstructionDefaults, FurnitureProject, Part } from '../model'

const codes = (ws: { code: string }[]) => ws.map(w => w.code)
const LDSP: ConstructionDefaults['facade'] = { kind: 'ldsp', materialId: null, thickness: 18, gap: 2 }

function project(cab: Partial<CabinetSpec> = {}, facade = LDSP): FurnitureProject {
  const p = newProject('x')
  p.defaults.facade = facade
  p.cabinets = [{ ...p.cabinets[0], id: 'c1', label: 'M1', drawers: 3, ...cab }]
  return p
}
const run = (p: FurnitureProject) => computeProject(p, EMPTY_PRICE_BOOK, {})
const byRole = (parts: Part[], role: Part['role']) => parts.filter(x => x.role === role)

describe('drawers', () => {
  it('slide length: the longest standard that fits', () => {
    expect(slideLength(556)).toBe(500)
    expect(slideLength(560)).toBe(550)
    expect(slideLength(259)).toBe(null)
    expect(slideLength(260)).toBe(250)
  })

  it('600×720×560 with three drawers matches the spec', () => {
    const r = run(project())
    expect(r.errors).toEqual([])
    const fronts = byRole(r.parts, 'drawer_front')
    expect(fronts.map(f => [f.finished.length, f.finished.width])).toEqual([[596, 237], [596, 237], [596, 238]])
    expect(fronts.every(f => f.material === 'facade' && Object.values(f.edges).every(e => e?.band === 'visible'))).toBe(true)
    const sides = byRole(r.parts, 'drawer_side')
    expect(sides).toHaveLength(6)
    expect(sides.slice(0, 2).map(s => [s.finished.length, s.finished.width, s.thickness])).toEqual([[500, 197, 16], [500, 197, 16]])
    expect(sides[0].edges.L1).toEqual({ band: 'hidden', thickness: 0.4 })
    expect(sides[4].finished).toEqual({ length: 500, width: 198 })
    expect(byRole(r.parts, 'drawer_end')[0].finished).toEqual({ length: 507, width: 197 })
    const bottom = byRole(r.parts, 'drawer_bottom')[0]
    expect(bottom).toMatchObject({ material: 'back', finished: { length: 539, width: 500 } })
  })

  it('a drawer cabinet has no door and no shelf', () => {
    const r = run(project({ shelves: 2, doors: 2 }))
    expect(byRole(r.parts, 'door')).toEqual([])
    expect(byRole(r.parts, 'shelf')).toEqual([])
  })

  it('BOM: three 500 mm slide pairs, three handles, no hinge', () => {
    const r = run(project())
    expect(r.bom.find(b => b.label === 'slide_500')).toMatchObject({ qty: 3, unit: 'dona' })
    expect(r.bom.find(b => b.label === 'handle')!.qty).toBe(3)
    expect(r.bom.some(b => b.label === 'hinge')).toBe(false)
  })

  it('the 16 mm drawer boxes nest apart from the 18 mm carcass', () => {
    const r = run(project())
    expect(r.nesting.filter(n => n.material === 'board').map(n => n.thickness).sort()).toEqual([16, 18])
  })

  it('MDF fronts are ordered; the boxes are still cut', () => {
    const r = run(project({}, { ...LDSP, kind: 'mdf', materialId: 'm1', thickness: 19 }))
    expect(byRole(r.parts, 'drawer_front')).toEqual([])
    expect(byRole(r.parts, 'drawer_side')).toHaveLength(6)
    expect(r.facadeOrder).toEqual([
      { id: 'M1-T1', cabinetId: 'c1', length: 596, width: 237, qty: 2, materialId: 'm1' },
      { id: 'M1-T2', cabinetId: 'c1', length: 596, width: 238, qty: 1, materialId: 'm1' },
    ])
  })

  it('no facade: boxes and slides, no fronts', () => {
    const r = run(project({}, { ...LDSP, kind: 'none' }))
    expect(byRole(r.parts, 'drawer_front')).toEqual([])
    expect(byRole(r.parts, 'drawer_side')).toHaveLength(6)
    expect(r.bom.find(b => b.label === 'slide_500')!.qty).toBe(3)
  })

  it('drawers saved as null, or missing, are none', () => {
    const a = run(project({ drawers: null as unknown as undefined }))
    expect(a.errors).toEqual([])
    expect(byRole(a.parts, 'drawer_side')).toEqual([])
    const old = project()
    delete (old.cabinets[0] as Partial<CabinetSpec>).drawers
    expect(byRole(run(old).parts, 'drawer_side')).toEqual([])
  })

  it('validation', () => {
    expect(codes(validateProject(project({ drawers: 5 as 4 })).errors)).toContain('drawers_range')
    expect(codes(validateProject(project({ type: 'wall', depth: 300, drawers: 1 })).errors)).toContain('drawers_type')
    expect(codes(validateProject(project({ height: 300, drawers: 4 })).errors)).toContain('drawer_low')
    expect(codes(validateProject(project({ depth: 250 })).errors)).toContain('drawer_shallow')
  })

  it('nothing crosses in 3D: box, fronts and carcass', () => {
    const parts = run(project()).parts
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i].placement, c = parts[j].placement
        const ov = (p: number, sp: number, q: number, sq: number) => Math.min(p + sp / 2, q + sq / 2) - Math.max(p - sp / 2, q - sq / 2)
        expect([ov(a.x, a.sx, c.x, c.sx), ov(a.y, a.sy, c.y, c.sy), ov(a.z, a.sz, c.z, c.sz)].some(v => v <= 0), `${parts[i].id} × ${parts[j].id}`).toBe(true)
      }
    }
  })
})
