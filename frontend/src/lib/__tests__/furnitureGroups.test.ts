/**
 * Furniture laid out as groups: chairs round the table facing it, a coffee table in front of the
 * sofa, a bed with its head on a wall and room to get in on both sides, a wardrobe whose doors open.
 */
import { describe, it, expect } from 'vitest'
import type { RoomGeometry, WallElement } from '@/store/roomStore'
import { overlaps, roomModel, type Rect, type RoomModel, type WallInfo } from '../aiDesignLayout'
import { chairCount, groupCandidates, type GroupCandidate, type Piece, type Placed } from '../furnitureGroups'
import type { FurnitureRole, GroupId } from '../furnitureRole'
import { doorEntries, walkable } from '../walkway'

const el = (type: WallElement['type'], width: number, position: number): WallElement =>
  ({ id: `${type}-${position}`, type, width, height: 2000, sill_height: type === 'deraza' ? 900 : 0, position, positionAuto: false }) as WallElement

/** A plain four-wall room, W (walls A, C) by D (walls B, D) millimetres. */
const box = (W: number, D: number, open: Partial<Record<'A' | 'B' | 'C' | 'D', WallElement[]>> = {}): RoomGeometry => ({
  walls: [
    { id: 'A', length: W, elements: open.A ?? [] }, { id: 'B', length: D, elements: open.B ?? [] },
    { id: 'C', length: W, elements: open.C ?? [] }, { id: 'D', length: D, elements: open.D ?? [] },
  ],
}) as RoomGeometry

/** 4.5 x 3.2 m, a door on A (x from -1.75 to -0.85), a window in the middle of C. */
const living = () => roomModel(box(4500, 3200, { A: [el('eshik', 900, 500)], C: [el('deraza', 1400, 1550)] }))

const piece = (id: string, role: FurnitureRole, w: number, d: number, tall = false): Piece => ({ id, name: id, role, w, d, tall })

const front = (r: Rect): [number, number] => [Math.sin(r.rotation), Math.cos(r.rotation)]
const right = (r: Rect): [number, number] => [Math.cos(r.rotation), -Math.sin(r.rotation)]
const dot = (a: [number, number], b: [number, number]) => a[0] * b[0] + a[1] * b[1]
/** A point `fwd` ahead of the rect's centre (negative: behind) and `side` to its right. */
const at = (r: Rect, fwd: number, side = 0): [number, number] => {
  const f = front(r), s = right(r)
  return [r.x + f[0] * fwd + s[0] * side, r.z + f[1] * fwd + s[1] * side]
}
const inRect = (p: [number, number], r: Rect) => {
  const dx = p[0] - r.x, dz = p[1] - r.z
  return Math.abs(dot([dx, dz], right(r))) < r.w / 2 && Math.abs(dot([dx, dz], front(r))) < r.d / 2
}
const pointInside = (m: RoomModel, p: [number, number]) => m.inside({ x: p[0], z: p[1], w: 0.02, d: 0.02, rotation: 0 })
/** Distance from a rect's back edge to a wall's line. */
const backGap = (r: Rect, w: WallInfo) => {
  const back = at(r, -r.d / 2)
  return (back[0] - w.midX) * w.nx + (back[1] - w.midZ) * w.nz
}
/** The wall a piece stands with its back on: the nearest one its front looks away from. */
const wallOf = (r: Rect, m: RoomModel) =>
  m.walls.filter((w) => dot(front(r), [w.nx, w.nz]) > 0.9).sort((a, b) => Math.abs(backGap(r, a)) - Math.abs(backGap(r, b)))[0]
const byRole = (c: GroupCandidate, role: FurnitureRole) => c.placed.filter((p) => p.piece.role === role)
const angle = (a: [number, number], b: [number, number]) =>
  Math.acos(Math.max(-1, Math.min(1, dot(a, b) / Math.hypot(...a) / Math.hypot(...b))))

const LOUNGE = [piece('sofa', 'sofa', 2.3, 0.95), piece('coffee', 'coffee_table', 1.1, 0.6), piece('arm1', 'armchair', 0.75, 0.75), piece('arm2', 'armchair', 0.75, 0.75), piece('tv', 'tv_unit', 1.5, 0.4)]
const DINING = [piece('table', 'dining_table', 1.6, 0.9), piece('chair', 'dining_chair', 0.45, 0.5)]
const SLEEP = [piece('bed', 'bed', 1.6, 2.0), piece('ns1', 'nightstand', 0.5, 0.4), piece('ns2', 'nightstand', 0.5, 0.4)]

describe('chairCount', () => {
  it('seats six at a long table, four at a middling one, two at a small one', () => {
    expect(chairCount(1.8)).toBe(6)
    expect(chairCount(1.6)).toBe(6)
    expect(chairCount(1.2)).toBe(4)
    expect(chairCount(1.1)).toBe(4)
    expect(chairCount(0.9)).toBe(2)
  })
})

describe('dining', () => {
  const model = living()
  const best = groupCandidates('dining', DINING, model, [])[0]

  it('chairs face the table, square to its nearest edge', () => {
    const table = byRole(best, 'dining_table')[0].rect
    const chairs = byRole(best, 'dining_chair')
    expect(chairs).toHaveLength(6)
    for (const c of chairs) {
      // The chair's centre in the table's frame; the edge it sits at is the one it is beyond.
      const rel: [number, number] = [c.rect.x - table.x, c.rect.z - table.z]
      const u = dot(rel, right(table)), v = dot(rel, front(table))
      const beyondSide = Math.abs(v) - table.d / 2, beyondEnd = Math.abs(u) - table.w / 2
      const toTable: [number, number] = beyondSide > beyondEnd
        ? [-Math.sign(v) * front(table)[0], -Math.sign(v) * front(table)[1]]
        : [-Math.sign(u) * right(table)[0], -Math.sign(u) * right(table)[1]]
      expect(angle(front(c.rect), toTable)).toBeLessThan((5 * Math.PI) / 180)
    }
  })

  it('chair backs keep 0.6 m', () => {
    for (const c of byRole(best, 'dining_chair')) {
      for (const k of [0.05, 0.3, 0.59]) {
        const p = at(c.rect, -c.rect.d / 2 - k)
        expect(pointInside(model, p)).toBe(true)
        for (const o of best.placed) expect(inRect(p, o.rect)).toBe(false)
      }
    }
    expect(best.usePoints).toHaveLength(6)
  })

  it('tucks each chair 0.10 under the table edge', () => {
    const table = byRole(best, 'dining_table')[0].rect
    for (const c of byRole(best, 'dining_chair')) expect(overlaps(c.rect, table, 0)).toBe(true)
  })

  it('takes fewer chairs when six do not fit, before giving up the table', () => {
    // 3.4 x 3.0 m: six chairs and their backs need 3.6 m along the table, four fit across 3.0 m.
    const small = roomModel(box(3400, 3000))
    const c = groupCandidates('dining', DINING, small, [])[0]
    expect(byRole(c, 'dining_table')).toHaveLength(1)
    expect(byRole(c, 'dining_chair').length).toBeLessThan(6)
    expect(byRole(c, 'dining_chair').length).toBeGreaterThan(0)
  })

  const longAlongX = (c: GroupCandidate) => {
    const t = byRole(c, 'dining_table')[0].rect
    return Math.abs(Math.cos(t.rotation)) > 0.5 === t.w >= t.d
  }

  it("prefers the table's long side along the room's long axis", () => {
    expect(longAlongX(best)).toBe(true)
  })

  it('turns the table across the room when only that fits', () => {
    // 3.0 x 2.6 m, table 1.4 x 0.8: two chairs and their backs need 2.8 m across the table, which only the 3.0 m side gives.
    const narrow = roomModel(box(3000, 2600))
    const pieces = [piece('table', 'dining_table', 1.4, 0.8), piece('chair', 'dining_chair', 0.45, 0.5)]
    const c = groupCandidates('dining', pieces, narrow, [])[0]
    expect(c).toBeDefined()
    expect(byRole(c, 'dining_chair').length).toBeGreaterThanOrEqual(2)
    expect(longAlongX(c)).toBe(false)
  })
})

describe('dining: how many chairs before which way the table turns', () => {
  it('every candidate seating four ranks above every one seating two; among the same count, along the long axis first', () => {
    // The living room with its sofa on wall B: along the room only two chairs fit, turned across four do.
    const model = living()
    const sofa: Rect = { x: 1.73, z: 0.41, w: 2.3, d: 0.95, rotation: -Math.PI / 2 }
    const cands = groupCandidates('dining', [piece('table', 'dining_table', 1.4, 0.8), piece('chair', 'dining_chair', 0.45, 0.5)], model, [sofa])
    const chairs = (c: GroupCandidate) => byRole(c, 'dining_chair').length
    const along = (c: GroupCandidate) => Math.abs(Math.cos(byRole(c, 'dining_table')[0].rect.rotation)) > 0.5
    expect(cands.some((c) => chairs(c) === 4)).toBe(true)
    const lastFour = cands.map(chairs).lastIndexOf(4)
    const firstTwo = cands.map(chairs).indexOf(2)
    expect(firstTwo === -1 || lastFour < firstTwo).toBe(true)
    const four = cands.filter((c) => chairs(c) === 4)
    const lastAlong = four.map(along).lastIndexOf(true), firstAcross = four.map(along).indexOf(false)
    expect(lastAlong === -1 || firstAcross === -1 || lastAlong < firstAcross).toBe(true)
  })
})

describe('lounge: the coffee table may go', () => {
  it('a sofa whose coffee table cannot stand still has candidates, the table named as left out, its use point straight ahead', () => {
    // 3.0 x 2.0 m: the sofa fits on the long wall, the coffee table in front of it does not.
    const m = roomModel(box(3000, 2000, { B: [el('eshik', 800, 100)] }))
    const coffee = piece('coffee', 'coffee_table', 1.0, 0.6)
    const cands = groupCandidates('lounge', [piece('sofa', 'sofa', 2.3, 0.95), coffee], m, [])
    const without = cands.find((c) => byRole(c, 'coffee_table').length === 0)
    expect(without).toBeDefined()
    expect(without!.dropped).toContain(coffee)
    const s = byRole(without!, 'sofa')[0].rect, p = without!.usePoints[0]
    expect(Math.abs(dot([p[0] - s.x, p[1] - s.z], right(s)))).toBeLessThan(1e-9)
  })

  it('the coffee table goes last: dropping the armchairs and the tv ranks above dropping it', () => {
    const cands = groupCandidates('lounge', LOUNGE, living(), [])
    const firstWithout = cands.findIndex((c) => byRole(c, 'coffee_table').length === 0)
    const bare = cands.findIndex((c) => byRole(c, 'coffee_table').length === 1 && byRole(c, 'armchair').length === 0 && byRole(c, 'tv_unit').length === 0)
    expect(bare).toBeGreaterThanOrEqual(0)
    expect(firstWithout === -1 || bare < firstWithout).toBe(true)
  })
})

describe('lounge', () => {
  const model = living()
  const best = groupCandidates('lounge', LOUNGE, model, [])[0]
  const sofa = byRole(best, 'sofa')[0].rect
  const coffee = byRole(best, 'coffee_table')[0].rect

  it('sofa against a wall facing in', () => {
    const wall = wallOf(sofa, model)
    expect(wall).toBeDefined()
    expect(backGap(sofa, wall)).toBeGreaterThanOrEqual(0)
    expect(backGap(sofa, wall)).toBeLessThanOrEqual(0.06)
    expect(dot(front(sofa), [wall.nx, wall.nz])).toBeGreaterThan(0.99)
  })

  it('coffee table in front', () => {
    const rel: [number, number] = [coffee.x - sofa.x, coffee.z - sofa.z]
    const gap = dot(rel, front(sofa)) - sofa.d / 2 - coffee.d / 2
    expect(gap).toBeGreaterThanOrEqual(0.4 - 1e-9)
    expect(gap).toBeLessThanOrEqual(0.45 + 1e-9)
    expect(Math.abs(dot(rel, right(sofa)))).toBeLessThanOrEqual(0.05)
  })

  it('armchairs face the coffee table', () => {
    const arms = byRole(best, 'armchair')
    expect(arms).toHaveLength(2)
    for (const a of arms) {
      expect(angle(front(a.rect), [coffee.x - a.rect.x, coffee.z - a.rect.z])).toBeLessThan(Math.PI / 2)
    }
  })

  it('a tv stands across from the sofa, facing it', () => {
    const tvs = byRole(best, 'tv_unit')
    expect(tvs).toHaveLength(1)
    const s = sofa, tv = tvs[0].rect
    expect(dot(front(tv), front(s))).toBeLessThan(-0.99)
    expect(angle(front(s), [tv.x - s.x, tv.z - s.z])).toBeLessThan(Math.PI / 4)
  })

  it('lounge avoids the door wall', () => {
    // 5 x 3 m, door in the middle of the 5 m wall A: a 1.8 m sofa would fit beside it, but should not go there.
    const m = roomModel(box(5000, 3000, { A: [el('eshik', 900, 2050)] }))
    const c = groupCandidates('lounge', [piece('sofa', 'sofa', 1.8, 0.9), piece('coffee', 'coffee_table', 1.0, 0.6)], m, [])[0]
    expect(wallOf(byRole(c, 'sofa')[0].rect, m).id).not.toBe('A')
  })

  it('the sofa use point is 0.5 m out, beside the coffee table, in the room and clear', () => {
    const p = best.usePoints[0]
    const rel: [number, number] = [p[0] - sofa.x, p[1] - sofa.z]
    expect(dot(rel, front(sofa))).toBeCloseTo(sofa.d / 2 + 0.5, 5)
    expect(Math.abs(dot(rel, right(sofa)))).toBeCloseTo(coffee.w / 2 + 0.4, 5)
    expect(pointInside(model, p)).toBe(true)
    for (const o of best.placed) expect(inRect(p, o.rect)).toBe(false)
  })

  it('without a coffee table the use point is straight out in front', () => {
    const c = groupCandidates('lounge', [piece('sofa', 'sofa', 2.3, 0.95)], model, [])[0]
    const s = byRole(c, 'sofa')[0].rect, p = c.usePoints[0]
    expect(dot([p[0] - s.x, p[1] - s.z], front(s))).toBeCloseTo(s.d / 2 + 0.5, 5)
    expect(Math.abs(dot([p[0] - s.x, p[1] - s.z], right(s)))).toBeLessThan(1e-9)
  })

  it('a lounge candidate can be walked to from the door', () => {
    const cands = groupCandidates('lounge', LOUNGE, model, [])
    expect(cands.some((c) => walkable(model, c.placed.map((p) => p.rect), doorEntries(model), c.usePoints))).toBe(true)
  })

  it('keeps one armchair when only one fits', () => {
    // 3.4 x 3.2 m: no wall takes the sofa with an armchair at both ends, but one end has room.
    const m = roomModel(box(3400, 3200))
    const cands = groupCandidates('lounge', LOUNGE, m, [])
    expect(cands.every((c) => byRole(c, 'armchair').length < 2)).toBe(true)
    const one = cands.filter((c) => byRole(c, 'armchair').length === 1)
    expect(one.length).toBeGreaterThan(0)
    expect(one[0].dropped.filter((p) => p.role === 'armchair')).toHaveLength(1)
  })
})

describe('sleep', () => {
  const model = living()
  const best = groupCandidates('sleep', SLEEP, model, [])[0]
  const bed = byRole(best, 'bed')[0].rect

  it('bed head on a wall with 0.6 m sides', () => {
    const wall = wallOf(bed, model)
    expect(backGap(bed, wall)).toBeLessThanOrEqual(0.06)
    const others = best.placed.filter((p) => p.piece.role !== 'bed').map((p) => p.rect)
    for (const s of [-1, 1]) {
      for (const fwd of [0, bed.d / 2 - 0.05]) {
        for (const k of [0.05, 0.59]) {
          const p = at(bed, fwd, s * (bed.w / 2 + k))
          expect(pointInside(model, p)).toBe(true)
          for (const o of others) expect(inRect(p, o)).toBe(false)
        }
      }
    }
    for (const k of [0.05, 0.59]) expect(pointInside(model, at(bed, bed.d / 2 + k))).toBe(true)
  })

  it('keeps one nightstand when only one fits', () => {
    // Something of the user's stands where the left nightstand would go, wherever the bed is.
    const model = roomModel(box(3000, 3000))
    const free = groupCandidates('sleep', SLEEP, model, [])[0]
    const ns = byRole(free, 'nightstand').map((n) => n.rect)
    const c = groupCandidates('sleep', SLEEP, model, [ns[1]])
    const one = c.filter((x) => byRole(x, 'nightstand').length === 1)
    expect(one.length).toBeGreaterThan(0)
  })

  it('nightstands beside the head', () => {
    const wall = wallOf(bed, model)
    const ns = byRole(best, 'nightstand')
    expect(ns).toHaveLength(2)
    const sides = new Set<number>()
    for (const n of ns) {
      expect(Math.abs(n.rect.rotation - bed.rotation)).toBeLessThan(1e-9)
      expect(backGap(n.rect, wall)).toBeLessThanOrEqual(0.06)
      const lateral = dot([n.rect.x - bed.x, n.rect.z - bed.z], right(bed))
      expect(Math.abs(lateral)).toBeGreaterThan(bed.w / 2 + n.rect.w / 2)
      expect(Math.abs(lateral)).toBeLessThan(bed.w / 2 + n.rect.w / 2 + 0.2)
      sides.add(Math.sign(lateral))
    }
    expect(sides.size).toBe(2)
  })
})

describe('work', () => {
  it('a desk on a wall with its chair in front, facing it, 0.6 m behind the chair', () => {
    const model = living()
    const c = groupCandidates('work', [piece('desk', 'desk', 1.2, 0.6), piece('dchair', 'desk_chair', 0.5, 0.5)], model, [])[0]
    const desk = byRole(c, 'desk')[0].rect, chair = byRole(c, 'desk_chair')[0].rect
    expect(backGap(desk, wallOf(desk, model))).toBeLessThanOrEqual(0.06)
    expect(dot(front(chair), front(desk))).toBeLessThan(-0.99)
    for (const k of [0.05, 0.59]) expect(pointInside(model, at(chair, -chair.d / 2 - k))).toBe(true)
    expect(c.usePoints).toHaveLength(1)
  })
})

describe('storage', () => {
  it('keeps a wardrobe\'s front clear of a door swing', () => {
    // 3 x 3 m, door on B from z -0.7 to 0.2: a 1.8 m wardrobe in the middle of A would stand clear of
    // the swing, but its 0.7 m front would not.
    const model = roomModel(box(3000, 3000, { B: [el('eshik', 900, 800)] }))
    const doors = model.clear.filter((z) => z.kind === 'door').map((z) => z.rect)
    const cands = groupCandidates('storage', [piece('wardrobe', 'wardrobe', 1.8, 0.6, true)], model, [])
    expect(cands.length).toBeGreaterThan(0)
    for (const c of cands) {
      const w = byRole(c, 'wardrobe')[0].rect
      const [x, z] = at(w, w.d / 2 + 0.35)
      const strip: Rect = { x, z, w: w.w, d: 0.7, rotation: w.rotation }
      for (const d of doors) expect(overlaps(strip, d, 0)).toBe(false)
    }
  })


  it('wardrobe keeps 0.7 m in front and is not in a door swing', () => {
    const model = living()
    const cands = groupCandidates('storage', [piece('wardrobe', 'wardrobe', 1.8, 0.6, true)], model, [])
    expect(cands.length).toBeGreaterThan(0)
    const doors = model.clear.filter((z) => z.kind === 'door').map((z) => z.rect)
    for (const c of cands) {
      const w = byRole(c, 'wardrobe')[0].rect
      for (const k of [0.05, 0.69]) for (const side of [-w.w / 2 + 0.02, 0, w.w / 2 - 0.02]) expect(pointInside(model, at(w, w.d / 2 + k, side))).toBe(true)
      for (const z of doors) expect(overlaps(w, z, 0)).toBe(false)
    }
  })
})

describe('every candidate keeps the rules', () => {
  const model = living()
  // Something of the user's already stands in the room.
  const taken: Rect[] = [{ x: 1.6, z: -0.9, w: 0.8, d: 0.8, rotation: 0 }]
  const sets: Array<[GroupId, Piece[]]> = [
    ['lounge', LOUNGE], ['dining', DINING], ['sleep', SLEEP],
    ['work', [piece('desk', 'desk', 1.2, 0.6), piece('dchair', 'desk_chair', 0.5, 0.5)]],
    ['storage', [piece('wardrobe', 'wardrobe', 1.8, 0.6, true), piece('shelf', 'shelf', 0.8, 0.35, true)]],
    ['extra', [piece('plant', 'decor', 0.4, 0.4), piece('rug', 'rug', 2.0, 1.4)]],
  ]
  const tucked = (a: Placed, b: Placed) => {
    const pair = [a.piece.role, b.piece.role].sort().join('+')
    return pair === 'dining_chair+dining_table' || pair === 'desk+desk_chair'
  }

  for (const [group, pieces] of sets) {
    it(`${group}: inside, clear of each other, of what is taken and of the openings; sorted best first`, () => {
      const cands = groupCandidates(group, pieces, model, taken)
      expect(cands.length).toBeGreaterThan(0)
      for (let i = 1; i < cands.length; i++) expect(cands[i - 1].score).toBeGreaterThanOrEqual(cands[i].score)
      for (const c of cands) {
        const solid = c.placed.filter((p) => p.piece.role !== 'rug')
        for (const p of solid) {
          expect(model.inside(p.rect)).toBe(true)
          for (const t of taken) expect(overlaps(p.rect, t, 0)).toBe(false)
          for (const z of model.clear) if (z.kind === 'door' || p.piece.tall) expect(overlaps(p.rect, z.rect, 0)).toBe(false)
        }
        for (let i = 0; i < solid.length; i++) {
          for (let j = i + 1; j < solid.length; j++) {
            if (!tucked(solid[i], solid[j])) expect(overlaps(solid[i].rect, solid[j].rect, 0)).toBe(false)
          }
        }
        // Each piece asked for is either placed or reported dropped.
        for (const p of pieces) expect(c.placed.some((x) => x.piece === p) || c.dropped.includes(p)).toBe(true)
      }
    })
  }

  it("finds every group's candidates quickly in a 6 x 5 room", () => {
    const big = roomModel(box(6000, 5000, { A: [el('eshik', 900, 500)], C: [el('deraza', 1400, 2300)] }))
    for (const [group, pieces] of sets) {
      const t0 = performance.now()
      groupCandidates(group, pieces, big, taken)
      expect(performance.now() - t0).toBeLessThan(250) // generous for slow CI; typically far less
    }
  })
})

describe('L-shaped room', () => {
  // 5 x 4.5 m with a 2.5 x 2 m notch cut out (as in aiDesignHardRooms.test.ts), walls W1..W6.
  const lshape = (): RoomGeometry => ({
    walls: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6'].map((id, i) => ({ id, length: 3000, elements: i === 0 ? [el('eshik', 900, 800)] : i === 1 ? [el('deraza', 1200, 600)] : [] })),
    vertices: [[0, 0], [5000, 0], [5000, 2500], [2500, 2500], [2500, 4500], [0, 4500]],
  }) as unknown as RoomGeometry

  it('the lounge candidate stays inside the L', () => {
    const model = roomModel(lshape())
    const cands = groupCandidates('lounge', LOUNGE, model, [])
    expect(cands.length).toBeGreaterThan(0)
    for (const c of cands) for (const p of c.placed) expect(model.inside(p.rect)).toBe(true)
  })

  it('so do dining and sleep', () => {
    const model = roomModel(lshape())
    // A 1.6 m bed needs a 2.8 m wall and 2.64 m of depth clear of the door: this L has none, so a 1.2 m bed.
    const single = [piece('bed', 'bed', 1.2, 2.0), piece('ns1', 'nightstand', 0.5, 0.4)]
    for (const [g, ps] of [['dining', DINING], ['sleep', single]] as const) {
      const cands = groupCandidates(g, ps, model, [])
      expect(cands.length).toBeGreaterThan(0)
      for (const c of cands) for (const p of c.placed) expect(model.inside(p.rect)).toBe(true)
    }
  })
})
