import { describe, it, expect } from 'vitest'
import { nestSheets } from '../nest'
import { baseCabinetParts } from '../rules/baseCabinet'
import { groupParts } from '../cutlist'
import { DEFAULTS } from '../model'
import type { CabinetSpec, CutGroup, NestResult, NestedSheet } from '../model'

const SHEET = { length: 2800, width: 2070 }
const OPTS = { kerf: 4, trim: 10 }

function g(id: string, length: number, width: number, grain: CutGroup['grain'] = 'length', qty = 1, material: CutGroup['material'] = 'board'): CutGroup {
  return {
    key: id, role: 'shelf', roles: ['shelf'], material, materialId: null, thickness: material === 'board' ? 18 : 4,
    cut: { length, width }, finished: { length, width }, grain,
    edges: { L1: null, L2: null, W1: null, W2: null }, qty,
    partIds: Array.from({ length: qty }, (_, i) => (qty === 1 ? id : `${id}.${i + 1}`)),
  }
}

const cab = (i: number): CabinetSpec => ({ id: `c${i}`, type: 'base', label: `M${i + 1}`, width: 600, height: 720, depth: 560, shelves: 1, position: { x: i * 600, z: 0 } })
const groupsOf = (n: number) => groupParts(Array.from({ length: n }, (_, i) => baseCabinetParts(cab(i), DEFAULTS)).flat())
const board = (r: NestResult[]) => r.find(x => x.material === 'board')!
const back = (r: NestResult[]) => r.find(x => x.material === 'back')!

/** A guillotine layout splits into two non-empty sides by one straight line, all the way down. */
function isGuillotine(rects: { x: number; y: number; length: number; width: number }[]): boolean {
  if (rects.length <= 1) return true
  for (const axis of ['x', 'y'] as const) {
    const size = axis === 'x' ? 'length' : 'width'
    const edges = [...new Set(rects.map(r => r[axis] + r[size]))]
    for (const c of edges) {
      const before = rects.filter(r => r[axis] + r[size] <= c)
      const after = rects.filter(r => r[axis] >= c)
      if (before.length > 0 && after.length > 0 && before.length + after.length === rects.length) {
        return isGuillotine(before) && isGuillotine(after)
      }
    }
  }
  return false
}

function checkInvariants(groups: CutGroup[], result: NestResult[], sheet: { length: number; width: number }, opts: { kerf: number; trim: number }) {
  const grainOf = new Map(groups.flatMap(gr => gr.partIds.map(id => [id, gr.grain] as const)))
  const seen: string[] = []
  for (const r of result) {
    seen.push(...r.unplaced)
    for (const s of r.sheets as NestedSheet[]) {
      for (const p of s.placements) {
        seen.push(p.partId)
        expect(p.x).toBeGreaterThanOrEqual(opts.trim)
        expect(p.y).toBeGreaterThanOrEqual(opts.trim)
        expect(p.x + p.length).toBeLessThanOrEqual(sheet.length - opts.trim)
        expect(p.y + p.width).toBeLessThanOrEqual(sheet.width - opts.trim)
        if (grainOf.get(p.partId) !== 'none') expect(p.rotated, p.partId).toBe(false)
      }
      for (let i = 0; i < s.placements.length; i++) {
        for (let j = i + 1; j < s.placements.length; j++) {
          const a = s.placements[i], b = s.placements[j]
          const apart = a.x + a.length + opts.kerf <= b.x || b.x + b.length + opts.kerf <= a.x
            || a.y + a.width + opts.kerf <= b.y || b.y + b.width + opts.kerf <= a.y
          expect(apart, `${a.partId} × ${b.partId}`).toBe(true)
        }
      }
      expect(isGuillotine(s.placements.map(p => ({ ...p, length: p.length + opts.kerf, width: p.width + opts.kerf })))).toBe(true)
      // every part edge that is not the trim line has a saw cut along it
      const maxX = sheet.length - opts.trim, maxY = sheet.width - opts.trim
      for (const p of s.placements) {
        const right = p.x + p.length, top = p.y + p.width
        if (right < maxX) expect(s.cuts.some(c => c.x1 === right && c.x2 === right && Math.min(c.y1, c.y2) <= p.y && Math.max(c.y1, c.y2) >= top), `${p.partId} right`).toBe(true)
        if (top < maxY) expect(s.cuts.some(c => c.y1 === top && c.y2 === top && Math.min(c.x1, c.x2) <= p.x && Math.max(c.x1, c.x2) >= right), `${p.partId} top`).toBe(true)
      }
    }
  }
  expect(seen.sort()).toEqual(groups.flatMap(gr => gr.partIds).sort())
}

/** Small seeded generator so the random projects are the same on every run. */
function lcg(seed: number) {
  let s = seed
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 }
}

describe('nestSheets', () => {
  it('the spec sample needs one LDSP and one HDF sheet', () => {
    const r = nestSheets(groupsOf(1), SHEET, OPTS)
    expect(board(r).sheets).toHaveLength(1)
    expect(back(r).sheets).toHaveLength(1)
    expect(board(r).unplaced).toEqual([])
    checkInvariants(groupsOf(1), r, SHEET, OPTS)
  })

  it('four 600 mm cabinets need two LDSP sheets', () => {
    const r = nestSheets(groupsOf(4), SHEET, OPTS)
    expect(board(r).sheets).toHaveLength(2)
    checkInvariants(groupsOf(4), r, SHEET, OPTS)
  })

  it('a part longer than the sheet is unplaced', () => {
    const r = nestSheets([g('P1', 2900, 500)], SHEET, OPTS)
    expect(r[0].unplaced).toEqual(['P1'])
    expect(r[0].sheets).toEqual([])
  })

  it('a part exactly the working length fits', () => {
    const r = nestSheets([g('P1', 2780, 500)], SHEET, OPTS)
    expect(r[0].unplaced).toEqual([])
    expect(r[0].sheets).toHaveLength(1)
    expect(r[0].sheets[0].placements[0]).toMatchObject({ x: 10, y: 10, length: 2780, width: 500, rotated: false })
  })

  it('kerf 0 and trim 0: parts touch but never overlap', () => {
    const groups = [g('A', 1400, 1035, 'length', 4)]
    const opts = { kerf: 0, trim: 0 }
    const r = nestSheets(groups, SHEET, opts)
    expect(r[0].sheets).toHaveLength(1)
    checkInvariants(groups, r, SHEET, opts)
  })

  it('plain parts may turn to fit more; grained ones never do', () => {
    const plain = nestSheets([g('H', 1900, 300, 'none', 8, 'back')], SHEET, OPTS)
    expect(plain[0].sheets).toHaveLength(1)
    expect(plain[0].sheets[0].placements.some(p => p.rotated)).toBe(true)
    const grained = nestSheets([g('B', 1900, 300, 'length', 8)], SHEET, OPTS)
    expect(grained[0].sheets).toHaveLength(2)
    expect(grained[0].sheets.flatMap(s => s.placements).every(p => !p.rotated)).toBe(true)
  })

  it('keeps materials apart, in the order they first appear', () => {
    const r = nestSheets([g('B1', 500, 400), g('H1', 500, 400, 'none', 1, 'back'), g('B2', 300, 300)], SHEET, OPTS)
    expect(r.map(x => x.material)).toEqual(['board', 'back'])
    expect(r[0].sheets[0].placements.map(p => p.partId).sort()).toEqual(['B1', 'B2'])
  })

  it('is deterministic', () => {
    expect(nestSheets(groupsOf(3), SHEET, OPTS)).toEqual(nestSheets(groupsOf(3), SHEET, OPTS))
  })

  it('holds every invariant on 200 seeded random projects', () => {
    const rand = lcg(42)
    const grains: CutGroup['grain'][] = ['length', 'none']
    for (let n = 0; n < 200; n++) {
      const groups = Array.from({ length: 2 + Math.floor(rand() * 12) }, (_, i) =>
        g(`P${n}-${i}`, 50 + Math.floor(rand() * 2700), 50 + Math.floor(rand() * 1500),
          grains[Math.floor(rand() * 2)], 1 + Math.floor(rand() * 3)))
      checkInvariants(groups, nestSheets(groups, SHEET, OPTS), SHEET, OPTS)
    }
  })

  it('reports utilization and offcuts of at least 200×200', () => {
    const r = nestSheets(groupsOf(1), SHEET, OPTS)
    const b = board(r)
    expect(b.utilization).toBeGreaterThan(0.2)
    expect(b.utilization).toBeLessThan(0.4)
    for (const o of b.sheets[0].offcuts) {
      expect(o.length).toBeGreaterThanOrEqual(200)
      expect(o.width).toBeGreaterThanOrEqual(200)
    }
    expect(b.sheets[0].offcuts.length).toBeGreaterThan(0)
  })

  it('numbers the cuts in order', () => {
    const cuts = board(nestSheets(groupsOf(1), SHEET, OPTS)).sheets[0].cuts
    expect(cuts.length).toBeGreaterThan(0)
    expect(cuts.map(c => c.order)).toEqual(cuts.map((_, i) => i + 1))
  })

  it('nests 30 cabinets in under 300 ms', () => {
    const groups = groupsOf(30)
    const t0 = performance.now()
    const r = nestSheets(groups, SHEET, OPTS)
    expect(performance.now() - t0).toBeLessThan(300)
    expect(board(r).unplaced).toEqual([])
  })
  it('a part less than a kerf short of the edge still gets its cut', () => {
    const r = nestSheets([g('P1', 2780, 2046)], SHEET, OPTS)
    expect(r[0].sheets[0].cuts.some(c => c.y1 === 10 + 2046 && c.y2 === 10 + 2046)).toBe(true)
  })

  it('allowing rotation never costs a sheet', () => {
    const r = nestSheets([g('H', 1134, 918, 'none', 4, 'back')], SHEET, OPTS)
    expect(r[0].sheets).toHaveLength(1)
    const rand = lcg(7)
    for (let n = 0; n < 300; n++) {
      const dims = Array.from({ length: 1 + Math.floor(rand() * 6) }, (_, i) => [i, 100 + Math.floor(rand() * 1500), 100 + Math.floor(rand() * 1200), 1 + Math.floor(rand() * 4)])
      const plain = nestSheets(dims.map(([i, l, w, q]) => g(`N${n}-${i}`, l, w, 'none', q, 'back')), SHEET, OPTS)
      const fixed = nestSheets(dims.map(([i, l, w, q]) => g(`N${n}-${i}`, l, w, 'length', q, 'back')), SHEET, OPTS)
      expect(plain[0].sheets.length, `case ${n}`).toBeLessThanOrEqual(fixed[0].sheets.length)
    }
  })

  it('each cut says which way it runs and how far it is from its piece edge', () => {
    const r = nestSheets([g('P1', 1000, 600)], SHEET, OPTS)
    const cuts = r[0].sheets[0].cuts
    const across = cuts.find(c => c.x1 === c.x2)!   // the cut at the part's right end
    const along = cuts.find(c => c.y1 === c.y2)!    // the cut along the part's top
    expect(across).toMatchObject({ direction: 'across', offset: 1000 })
    expect(along).toMatchObject({ direction: 'along', offset: 600 })
  })
})
