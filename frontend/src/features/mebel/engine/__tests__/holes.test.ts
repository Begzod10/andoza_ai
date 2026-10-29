import { describe, it, expect } from 'vitest'
import { computeProject, EMPTY_PRICE_BOOK } from '../index'
import { newCabinet, newProject } from '../model'
import type { CabinetSpec, ConstructionDefaults, FurnitureProject, Hole, Part } from '../model'

const LDSP: ConstructionDefaults['facade'] = { kind: 'ldsp', materialId: null, thickness: 18, gap: 2 }

function project(cab: Partial<CabinetSpec> = {}, patch: Partial<ConstructionDefaults> = {}): FurnitureProject {
  const p = newProject('x')
  p.defaults = { ...p.defaults, facade: LDSP, ...patch }
  p.cabinets = [{ ...p.cabinets[0], id: 'c1', label: 'M1', ...cab }]
  return p
}
const parts = (p: FurnitureProject) => computeProject(p, EMPTY_PRICE_BOOK, {}).parts
const part = (ps: Part[], role: Part['role'], i = 0) => ps.filter(p => p.role === role)[i]
const pick = (p: Part, kind: Hole['kind'], face?: Hole['face']) =>
  (p.holes ?? []).filter(h => h.kind === kind && (!face || h.face === face)).map(h => [h.u, h.v])
const sorted = (xs: number[][]) => [...xs].sort((a, b) => a[0] - b[0] || a[1] - b[1])

describe('drilling', () => {
  const ps = parts(project())
  const left = part(ps, 'side_left')
  const right = part(ps, 'side_right')

  it('confirmats through the side for the bottom and both rails', () => {
    const c = sorted(pick(left, 'confirmat', 'B'))
    expect(c).toEqual(sorted([[9, 50], [9, 278], [9, 506], [711, 25], [711, 75], [711, 481], [711, 531]]))
    expect(left.holes!.find(h => h.kind === 'confirmat')).toMatchObject({ diameter: 7, depth: 0 })
  })

  it('confirmat holes in the bottom ends match', () => {
    const bottom = part(ps, 'bottom')
    for (const face of ['W1', 'W2'] as const) {
      expect(sorted(pick(bottom, 'confirmat_edge', face))).toEqual([[50, 9], [278, 9], [506, 9]])
    }
    expect(bottom.holes!.find(h => h.kind === 'confirmat_edge')).toMatchObject({ diameter: 5, depth: 60 })
  })

  it('shelf pins under the shelf on both sides', () => {
    expect(sorted(pick(left, 'shelf_pin', 'A'))).toEqual([[346, 37], [346, 519]])
    expect(sorted(pick(right, 'shelf_pin', 'A'))).toEqual([[346, 37], [346, 519]])
  })

  it('one door hinged left: cups on the door, plates on the left side only', () => {
    const door = part(ps, 'door')
    expect(sorted(pick(door, 'hinge_cup', 'A'))).toEqual([[100, 22.5], [618, 22.5]])
    expect(door.holes!.find(h => h.kind === 'hinge_cup')).toMatchObject({ diameter: 35, depth: 12 })
    expect(sorted(pick(left, 'hinge_plate', 'A'))).toEqual([[85, 37], [117, 37], [603, 37], [635, 37]])
    expect(pick(right, 'hinge_plate')).toEqual([])
  })

  it('two doors: the right one is hinged on the right', () => {
    const two = parts(project({ width: 800 }))
    const rightDoor = part(two, 'door', 1)
    expect(pick(rightDoor, 'hinge_cup').map(([, v]) => v)).toEqual([398 - 22.5, 398 - 22.5])
    expect(pick(part(two, 'side_right'), 'hinge_plate')).toHaveLength(4)
  })

  it('hinges spread evenly, 100 mm from the ends', () => {
    const tall = parts(project({ ...newCabinet('M1', 0, 'tall'), id: 'c1', label: 'M1' }))
    const us = pick(part(tall, 'door'), 'hinge_cup').map(([u]) => u).sort((a, b) => a - b)
    expect(us).toHaveLength(4)
    expect(us[0]).toBe(100)
    expect(us[3]).toBe(2098 - 100)
    // positions are given to 0.1 mm
    expect(Math.abs((us[1] - us[0]) - (us[2] - us[1]))).toBeLessThanOrEqual(0.1)
  })

  it('drawer slides: three pilot holes on each side', () => {
    const dr = parts(project({ drawers: 3 }))
    const holes = pick(part(dr, 'side_left'), 'slide', 'A')
    expect(holes).toHaveLength(9)
    expect([...new Set(holes.map(([, v]) => v))].sort((a, b) => a - b)).toEqual([39, 252, 465])
  })

  it('under_sides: confirmats from below, into the side ends', () => {
    const us = parts(project({}, { bottomJoint: 'under_sides' }))
    const l = part(us, 'side_left')
    expect(pick(l, 'confirmat', 'B').some(([u]) => u < 20)).toBe(false)
    expect(sorted(pick(l, 'confirmat_edge', 'W2'))).toEqual([[50, 9], [278, 9], [506, 9]])
    expect(sorted(pick(part(us, 'bottom'), 'confirmat', 'B'))).toEqual(sorted([[9, 50], [9, 278], [9, 506], [591, 50], [591, 278], [591, 506]]))
  })

  it('a wall cabinet top panel is fixed like the bottom', () => {
    const w = parts(project({ ...newCabinet('M1', 0, 'wall'), id: 'c1', label: 'M1' }))
    const l = part(w, 'side_left')
    expect(sorted(pick(l, 'confirmat', 'B')).filter(([u]) => u > 700)).toEqual([[711, 50], [711, 246]]) // 296 deep: no middle one (only above 400)
  })

  it('every hole lies on its part', () => {
    const all = [...parts(project({ drawers: 3 })), ...parts(project({ width: 900 }, { back: { kind: 'hdf_groove', materialId: null, thickness: 4, grooveDepth: 8, grooveOffset: 16 } }))]
    for (const p of all) {
      for (const h of p.holes ?? []) {
        const edge = h.face === 'W1' || h.face === 'W2'
        expect(h.u, `${p.id} ${h.kind}`).toBeGreaterThanOrEqual(0)
        expect(h.u).toBeLessThanOrEqual(edge ? p.finished.width : p.finished.length)
        expect(h.v).toBeGreaterThanOrEqual(0)
        expect(h.v).toBeLessThanOrEqual(edge ? p.thickness : p.finished.width)
      }
    }
  })
})
