/**
 * The whole room laid out group by group: the room's main group first, the others after it while
 * they fit and leave the way from the door open, and what did not fit named.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useRoomStore } from '@/store/roomStore'
import type { RoomGeometry, WallElement } from '@/store/roomStore'
import type { AiDesignPlan, CatalogFurniture } from '@/lib/api'
import { ALL_PARTS, applyDesignPlan } from '../aiDesign'
import { overlaps, roomModel, type Rect } from '../aiDesignLayout'
import { chairCount, type Piece } from '../furnitureGroups'
import { layoutFurniture, primaryGroup } from '../furnitureLayout'
import type { FurnitureRole } from '../furnitureRole'

const el = (type: WallElement['type'], width: number, position: number): WallElement =>
  ({ id: `${type}-${position}`, type, width, height: 2000, sill_height: type === 'deraza' ? 900 : 0, position, positionAuto: false }) as WallElement

const box = (W: number, D: number, open: Partial<Record<'A' | 'B' | 'C' | 'D', WallElement[]>> = {}): RoomGeometry => ({
  walls: [
    { id: 'A', length: W, elements: open.A ?? [] }, { id: 'B', length: D, elements: open.B ?? [] },
    { id: 'C', length: W, elements: open.C ?? [] }, { id: 'D', length: D, elements: open.D ?? [] },
  ],
}) as RoomGeometry

const item = (id: string, name: string, category: string, w: number | null, d: number | null): CatalogFurniture => ({
  id, name_uz: name, category, store_id: null, store_name: null, room_type: null, placement: 'pol',
  price_uzs: null, glb_url: 'x.glb', thumbnail_url: null, footprint_w: w, footprint_d: d,
})
const CATALOG = [
  item('sofa', 'Divan', 'divan', 230, 95), item('table', 'Ovqat stoli', 'stol', 140, 80), item('chair', 'Stul', 'stul', 45, 50),
  item('mystery', 'Noma\'lum', 'dekor', null, null),
]
const plan = (furniture: AiDesignPlan['furniture']): AiDesignPlan => ({
  title: 't', summary: '', warnings: [], walls: {}, floor: null, lights: [], furniture,
})
const sizeOf = (id: string) => {
  const c = CATALOG.find((i) => i.id === id)
  return c?.footprint_w && c.footprint_d ? { w: c.footprint_w / 100, d: c.footprint_d / 100 } : { w: 0.9, d: 0.7 }
}
const rectOf = (f: { x: number; y: number; rotation: number; furniture_id: string }): Rect =>
  ({ x: f.x / 1000, z: f.y / 1000, ...sizeOf(f.furniture_id), rotation: f.rotation })

const piece = (id: string, role: FurnitureRole, w: number, d: number): Piece => ({ id, name: id, role, w, d, tall: false })

beforeEach(() => {
  useRoomStore.getState().resetRoom()
  useRoomStore.setState({ lights: [], furniture: [] })
})

describe('primaryGroup', () => {
  it('follows the room type when the plan has its main piece', () => {
    expect(primaryGroup('mehmonxona', ['bed', 'dining_table', 'sofa'])).toBe('lounge')
    expect(primaryGroup('oshxona', ['sofa', 'dining_table'])).toBe('dining')
    expect(primaryGroup('yotoqxona', ['sofa', 'bed'])).toBe('sleep')
  })

  it('without a room type, takes the main piece of the plan: a bed before a sofa, a table, a desk', () => {
    expect(primaryGroup(undefined, ['desk', 'bed'])).toBe('sleep')
    expect(primaryGroup(undefined, ['dining_table'])).toBe('dining')
    expect(primaryGroup('boshqa', ['desk', 'sofa'])).toBe('lounge')
    expect(primaryGroup(undefined, ['desk'])).toBe('work')
  })
})

describe('layoutFurniture', () => {
  it('a tiny room keeps the sofa and leaves the whole dining set out, naming the table and its chairs', () => {
    const model = roomModel(box(2400, 2200, { B: [el('eshik', 800, 100)] }))
    const pieces = [piece('Divan', 'sofa', 2.3, 0.95), piece('Ovqat stoli', 'dining_table', 1.4, 0.8), piece('Stul', 'dining_chair', 0.45, 0.5)]
    const { placed, dropped } = layoutFurniture(pieces, model, 'mehmonxona', [])
    expect(placed.map((p) => p.piece.role)).toEqual(['sofa'])
    expect(dropped).toEqual([{ name: 'Ovqat stoli', count: 1 }, { name: 'Stul', count: chairCount(1.4) }])
  })

  it('a dining table is never left standing without chairs', () => {
    const model = roomModel(box(2400, 2200, { B: [el('eshik', 800, 100)] }))
    const { placed } = layoutFurniture(
      [piece('Divan', 'sofa', 2.3, 0.95), piece('Ovqat stoli', 'dining_table', 1.4, 0.8), piece('Stul', 'dining_chair', 0.45, 0.5)],
      model, 'mehmonxona', [],
    )
    expect(placed.some((p) => p.piece.role === 'dining_table')).toBe(false)
  })

  it('the rug lies last, under the middle of the main group, turned with its anchor', () => {
    const model = roomModel(box(4500, 3200, { A: [el('eshik', 900, 500)] }))
    const { placed } = layoutFurniture(
      [piece('Gilam', 'rug', 2.0, 1.4), piece('Divan', 'sofa', 2.3, 0.95), piece('Jurnal stoli', 'coffee_table', 1.1, 0.6)],
      model, 'mehmonxona', [],
    )
    const rug = placed[placed.length - 1]
    expect(rug.piece.role).toBe('rug')
    const lounge = placed.filter((p) => p.piece.role !== 'rug')
    const cx = lounge.reduce((s, p) => s + p.rect.x, 0) / lounge.length, cz = lounge.reduce((s, p) => s + p.rect.z, 0) / lounge.length
    expect(rug.rect.x).toBeCloseTo(cx, 5)
    expect(rug.rect.z).toBeCloseTo(cz, 5)
    expect(rug.rect.rotation).toBeCloseTo(lounge[0].rect.rotation, 5)
  })

  it('a rug too big to lie there whole is moved toward the middle until it is inside the room', () => {
    const model = roomModel(box(4500, 3200, { A: [el('eshik', 900, 500)] }))
    const { placed } = layoutFurniture([piece('Divan', 'sofa', 2.3, 0.95), piece('Gilam', 'rug', 3.0, 2.4)], model, 'mehmonxona', [])
    const rug = placed.find((p) => p.piece.role === 'rug')!
    expect(model.inside(rug.rect)).toBe(true)
  })
})

describe('layoutFurniture: searching the main group', () => {
  it('tries more than the best main arrangement: a lounge slid along its wall leaves room for the dining set', () => {
    const model = roomModel(box(4500, 3200, { A: [el('eshik', 900, 500)], C: [el('deraza', 1400, 1550)] }))
    const pieces = [
      piece('Divan', 'sofa', 2.3, 0.95), piece('Ovqat stoli', 'dining_table', 1.4, 0.8), piece('Stul', 'dining_chair', 0.45, 0.5),
      piece('Kreslo', 'armchair', 0.75, 0.75), piece('Kreslo', 'armchair', 0.75, 0.75),
    ]
    const { placed } = layoutFurniture(pieces, model, 'mehmonxona', [])
    expect(placed.some((p) => p.piece.role === 'sofa')).toBe(true)
    expect(placed.some((p) => p.piece.role === 'dining_table')).toBe(true)
    expect(placed.filter((p) => p.piece.role === 'dining_chair').length).toBeGreaterThanOrEqual(2)
  })

  it('a main group that can only stand out of reach still lets a later group in', () => {
    // 5 x 3 m, the door near one end of wall B (x = +2.5). The user's own long piece across the room at
    // x = 0.5 cuts it in two: the sofa only fits on the far side, out of reach; a wardrobe fits on the door side.
    const model = roomModel(box(5000, 3000, { B: [el('eshik', 900, 100)] }))
    const barrier: Rect = { x: 0.5, z: 0, w: 0.5, d: 2.9, rotation: 0 }
    const { placed, dropped } = layoutFurniture(
      [piece('Divan', 'sofa', 2.3, 0.95), piece('Shkaf', 'wardrobe', 1.2, 0.6)], model, 'mehmonxona', [barrier],
    )
    const sofa = placed.find((p) => p.piece.role === 'sofa')
    expect(sofa).toBeDefined()
    expect(sofa!.rect.x).toBeLessThan(0.5) // on the far side: placed by the fallback
    const wardrobe = placed.find((p) => p.piece.role === 'wardrobe')
    expect(wardrobe).toBeDefined()
    expect(wardrobe!.rect.x).toBeGreaterThan(0.5)
    expect(dropped).toEqual([])
  })
})

describe('applyDesignPlan lays the furniture out in groups', () => {
  const living = () => box(4500, 3200, { A: [el('eshik', 900, 500)], C: [el('deraza', 1400, 1550)] })

  it('duplicate dining pieces collapse: a chair listed twice is still one set of chairs round the table', () => {
    useRoomStore.setState({ geometry: living() })
    applyDesignPlan(plan([
      { id: 'table', name: 'Ovqat stoli', role: 'dining_table' },
      { id: 'chair', name: 'Stul', role: 'dining_chair' }, { id: 'chair', name: 'Stul', role: 'dining_chair' },
    ]), ALL_PARTS, CATALOG, 'oshxona')
    const furniture = useRoomStore.getState().furniture
    const chairs = furniture.filter((f) => f.furniture_id === 'chair')
    expect(furniture.filter((f) => f.furniture_id === 'table')).toHaveLength(1)
    expect(chairs.length).toBeGreaterThanOrEqual(2)
    expect(chairs.length).toBeLessThanOrEqual(chairCount(1.4))
    // Each chair is its own piece in the room.
    expect(new Set(chairs.map((c) => c.id)).size).toBe(chairs.length)
  })

  it('a catalog piece with no footprint is laid out as 0.9 x 0.7 and placed', () => {
    useRoomStore.setState({ geometry: living() })
    const applied = applyDesignPlan(plan([{ id: 'mystery', name: 'Noma\'lum', role: 'decor' }]), ALL_PARTS, CATALOG, 'mehmonxona')
    expect(applied.furniture).toBe(1)
    const f = useRoomStore.getState().furniture[0]
    expect(roomModel(living()).inside(rectOf(f))).toBe(true)
  })

  it("the user's own furniture stays where it is and nothing is placed on it", () => {
    useRoomStore.setState({ geometry: living() })
    useRoomStore.getState().placeFurniture({ id: 'mine', furniture_id: 'sofa', x: 0, y: 1100, rotation: Math.PI })
    const mine = { ...useRoomStore.getState().furniture[0] }
    applyDesignPlan(plan([
      { id: 'sofa', name: 'Divan', role: 'sofa' }, { id: 'table', name: 'Ovqat stoli', role: 'dining_table' },
      { id: 'chair', name: 'Stul', role: 'dining_chair' },
    ]), ALL_PARTS, CATALOG, 'mehmonxona')
    const furniture = useRoomStore.getState().furniture
    expect(furniture.find((f) => f.id === 'mine')).toEqual(mine)
    for (const f of furniture.filter((x) => x.id !== 'mine')) expect(overlaps(rectOf(f), rectOf(mine), 0)).toBe(false)
  })

  it('a piece in a floor-covering category is a rug whatever its name or the plan says', () => {
    useRoomStore.setState({ geometry: living() })
    const catalog = [...CATALOG, item('persian', 'Fors naqshi', 'gilam', 200, 140)]
    applyDesignPlan(plan([
      { id: 'sofa', name: 'Divan', role: 'sofa' }, { id: 'persian', name: 'Fors naqshi' },
      { id: 'persian', name: 'Fors naqshi', role: 'decor' },
    ]), ALL_PARTS, catalog, 'mehmonxona')
    const furniture = useRoomStore.getState().furniture
    const sofa = furniture.find((f) => f.furniture_id === 'sofa')!
    const rugs = furniture.filter((f) => f.furniture_id === 'persian')
    expect(rugs).toHaveLength(2)
    // Both lie on the same spot under the lounge, turned with the sofa: only rugs may lie on top of one another.
    expect([rugs[1].x, rugs[1].y]).toEqual([rugs[0].x, rugs[0].y])
    for (const r of rugs) expect(r.rotation).toBeCloseTo(sofa.rotation, 5)
  })

  it('a piece with a role the studio does not know is grouped by its category and name instead', () => {
    useRoomStore.setState({ geometry: living() })
    const applied = applyDesignPlan(plan([
      { id: 'table', name: 'Ovqat stoli', role: 'banquet_table' as never }, { id: 'chair', name: 'Stul' },
    ]), ALL_PARTS, CATALOG, 'oshxona')
    const furniture = useRoomStore.getState().furniture
    // Inferred as a dining table (category "stol"): chairs come round it, not one chair against a wall.
    expect(furniture.filter((f) => f.furniture_id === 'table')).toHaveLength(1)
    expect(furniture.filter((f) => f.furniture_id === 'chair').length).toBeGreaterThanOrEqual(2)
    expect(applied.dropped.some((d) => d.name === 'Ovqat stoli')).toBe(false)
  })

  it('counts what it left out, and skipped is their total', () => {
    useRoomStore.setState({ geometry: box(2400, 2200, { B: [el('eshik', 800, 100)] }) })
    const applied = applyDesignPlan(plan([
      { id: 'sofa', name: 'Divan', role: 'sofa' }, { id: 'table', name: 'Ovqat stoli', role: 'dining_table' },
      { id: 'chair', name: 'Stul', role: 'dining_chair' },
    ]), ALL_PARTS, CATALOG, 'mehmonxona')
    expect(applied.furniture).toBe(1)
    expect(applied.dropped).toEqual([{ name: 'Ovqat stoli', count: 1 }, { name: 'Stul', count: chairCount(1.4) }])
    expect(applied.skipped).toBe(1 + chairCount(1.4))
  })
})

// ---- final review: the cases a real studio room hits ------------------------------------------

/** A W x D room turned `deg` degrees (as a scanned room comes in), walls W1..W4, a door on W1. */
const turned = (deg: number, W: number, D: number): RoomGeometry => {
  const t = (deg * Math.PI) / 180
  const vertices = [[0, 0], [W, 0], [W, D], [0, D]].map(([x, y]) => [Math.round(x * Math.cos(t) - y * Math.sin(t)), Math.round(x * Math.sin(t) + y * Math.cos(t))])
  return {
    walls: ['W1', 'W2', 'W3', 'W4'].map((id, i) => ({ id, length: i % 2 ? D : W, elements: i === 0 ? [el('eshik', 900, 500)] : [] })),
    vertices,
  } as unknown as RoomGeometry
}
/** 5 x 4.5 m with a 2.5 x 2 m notch cut out, walls W1..W6, a door on W1 and a window on W2. */
const lshape = (): RoomGeometry => ({
  walls: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6'].map((id, i) => ({ id, length: 3000, elements: i === 0 ? [el('eshik', 900, 800)] : i === 1 ? [el('deraza', 1200, 600)] : [] })),
  vertices: [[0, 0], [5000, 0], [5000, 2500], [2500, 2500], [2500, 4500], [0, 4500]],
}) as unknown as RoomGeometry

const fwdOf = (r: Rect): [number, number] => [Math.sin(r.rotation), Math.cos(r.rotation)]
const rightOf = (r: Rect): [number, number] => [Math.cos(r.rotation), -Math.sin(r.rotation)]
/** A strip `depth` deep ahead of (fwd 1) or behind (fwd -1) a rect, or beside it (side ±1). */
const zoneAhead = (r: Rect, fwd: 1 | -1, depth: number): Rect => {
  const f = fwdOf(r), k = fwd * (r.d / 2 + depth / 2)
  return { x: r.x + f[0] * k, z: r.z + f[1] * k, w: r.w, d: depth, rotation: r.rotation }
}
const zoneBeside = (r: Rect, side: 1 | -1, depth: number): Rect => {
  const s = rightOf(r), k = side * (r.w / 2 + depth / 2)
  return { x: r.x + s[0] * k, z: r.z + s[1] * k, w: depth, d: r.d, rotation: r.rotation }
}
/** Every piece standing on the floor another group needs: bed sides and foot, chair backs, storage fronts. */
function clearanceViolations(placed: Array<{ piece: Piece; rect: Rect }>): string[] {
  const out: string[] = []
  const solid = placed.filter((p) => p.piece.role !== 'rug')
  const check = (owner: { piece: Piece; rect: Rect }, zones: Rect[], mayStand: FurnitureRole[]) => {
    for (const p of solid) {
      if (p === owner || mayStand.includes(p.piece.role)) continue
      if (zones.some((z) => overlaps(z, p.rect, 0))) out.push(`${p.piece.role} on ${owner.piece.role}'s floor`)
    }
  }
  for (const o of solid) {
    const r = o.rect
    if (o.piece.role === 'bed') check(o, [zoneBeside(r, 1, 0.6), zoneBeside(r, -1, 0.6), zoneAhead(r, 1, 0.6)], ['nightstand'])
    if (o.piece.role === 'dining_chair') check(o, [zoneAhead(r, -1, 0.6)], ['dining_chair', 'dining_table'])
    if (o.piece.role === 'desk_chair') check(o, [zoneAhead(r, -1, 0.6)], ['desk'])
    if (o.piece.role === 'wardrobe' || o.piece.role === 'shelf') check(o, [zoneAhead(r, 1, 0.7)], [])
  }
  return out
}
const roles = (placed: Array<{ piece: Piece }>, role: FurnitureRole) => placed.filter((p) => p.piece.role === role)

describe('final review: the main group follows the plan, not only the room type', () => {
  it('a bedroom plan in a room the studio calls "mehmonxona" still gets its bed and nightstands', () => {
    const model = roomModel(box(4000, 3500, { A: [el('eshik', 900, 400)], C: [el('deraza', 1400, 1300)] }))
    const { placed } = layoutFurniture([
      piece('bed', 'bed', 1.6, 2.1), piece('ns', 'nightstand', 0.45, 0.4), piece('ns', 'nightstand', 0.45, 0.4),
      { ...piece('wardrobe', 'wardrobe', 1.2, 0.6), tall: true }, piece('arm', 'armchair', 0.75, 0.75), piece('tumba', 'tv_unit', 1.6, 0.4),
    ], model, 'mehmonxona', [])
    expect(roles(placed, 'bed')).toHaveLength(1)
    expect(roles(placed, 'nightstand')).toHaveLength(2)
  })

  it('primaryGroup: the room type leads only when the plan has its main piece', () => {
    expect(primaryGroup('mehmonxona', ['sofa', 'bed'])).toBe('lounge')
    expect(primaryGroup('mehmonxona', ['bed', 'nightstand', 'armchair', 'tv_unit'])).toBe('sleep')
    expect(primaryGroup('yotoqxona', ['sofa', 'desk'])).toBe('lounge')
    expect(primaryGroup('oshxona', ['dining_table', 'sofa'])).toBe('dining')
  })
})

describe('final review: the floor a piece needs stays free of the groups after it', () => {
  it('a bedroom: no desk or desk chair on the bed sides or foot', () => {
    const model = roomModel(box(4000, 3500, { A: [el('eshik', 900, 400)], C: [el('deraza', 1400, 1300)] }))
    const { placed } = layoutFurniture([
      piece('bed', 'bed', 1.6, 2.1), piece('ns', 'nightstand', 0.45, 0.4), piece('ns', 'nightstand', 0.45, 0.4),
      { ...piece('wardrobe', 'wardrobe', 1.2, 0.6), tall: true }, { ...piece('komod', 'shelf', 1.0, 0.45), tall: true },
      piece('desk', 'desk', 1.2, 0.6), piece('dchair', 'desk_chair', 0.5, 0.5),
    ], model, 'yotoqxona', [])
    expect(roles(placed, 'bed')).toHaveLength(1)
    expect(clearanceViolations(placed)).toEqual([])
  })

  it('a 3.5 x 3 kitchen-diner: the shelf is not behind a dining chair', () => {
    const model = roomModel(box(3500, 3000, { A: [el('eshik', 900, 400)] }))
    const { placed } = layoutFurniture([
      piece('table', 'dining_table', 1.4, 0.8), piece('chair', 'dining_chair', 0.45, 0.5),
      piece('tv', 'tv_unit', 1.2, 0.4), { ...piece('shelf', 'shelf', 1.0, 0.4), tall: true },
    ], model, 'mehmonxona', [])
    expect(roles(placed, 'dining_table')).toHaveLength(1)
    expect(clearanceViolations(placed)).toEqual([])
  })
})

describe('final review: the sofa stands even when its coffee table cannot', () => {
  it("4.5 x 3.2 with the user's own 1 x 1 piece in the middle: the sofa is placed", () => {
    const model = roomModel(box(4500, 3200, { A: [el('eshik', 900, 500)], C: [el('deraza', 1400, 1550)] }))
    const { placed, dropped } = layoutFurniture([
      piece('sofa', 'sofa', 2.3, 0.95), piece('coffee', 'coffee_table', 1.0, 0.6), piece('table', 'dining_table', 1.4, 0.8), piece('chair', 'dining_chair', 0.45, 0.5),
    ], model, 'mehmonxona', [{ x: 0, z: 0, w: 1, d: 1, rotation: 0 }])
    expect(roles(placed, 'sofa')).toHaveLength(1)
    expect(dropped.some((d) => d.name === 'sofa')).toBe(false)
  })

  it('3.0 x 2.0: the sofa is placed', () => {
    // The door near a corner of a short wall. (Centred on it, its swing reaches every place a 2.3 m sofa
    // could stand on the long walls: that room has no clean place for the sofa at all.)
    const model = roomModel(box(3000, 2000, { B: [el('eshik', 800, 100)] }))
    const { placed } = layoutFurniture([piece('sofa', 'sofa', 2.3, 0.95), piece('coffee', 'coffee_table', 1.0, 0.6)], model, 'mehmonxona', [])
    expect(roles(placed, 'sofa')).toHaveLength(1)
  })
})

describe('final review: a turned room turns the dining table with its walls', () => {
  const pieces = [piece('table', 'dining_table', 1.4, 0.8), piece('chair', 'dining_chair', 0.45, 0.5)]
  const straight = roles(layoutFurniture(pieces, roomModel(turned(0, 4000, 3500)), 'oshxona', []).placed, 'dining_chair').length

  it('the unturned room seats four', () => {
    expect(straight).toBe(4)
  })

  for (const deg of [27, 45]) {
    it(`turned ${deg} degrees: the table's edges run along a wall and it seats as many`, () => {
      const model = roomModel(turned(deg, 4000, 3500))
      const { placed } = layoutFurniture(pieces, model, 'oshxona', [])
      const table = roles(placed, 'dining_table')[0]
      expect(table).toBeDefined()
      const edge = -table.rect.rotation // the table's width axis, as an angle in the floor plane
      const off = (a: number) => { const q = ((a % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2); return Math.min(q, Math.PI / 2 - q) }
      const best = Math.min(...model.walls.map((w) => off(edge - Math.atan2(w.dirZ, w.dirX))))
      expect(best).toBeLessThan((2 * Math.PI) / 180)
      expect(roles(placed, 'dining_chair')).toHaveLength(straight)
    })
  }
})

describe('final review: the main piece stands somewhere as a last resort', () => {
  it('an L-shaped bedroom with no wall a bed can stand free on: the bed goes in with one long side on a wall', () => {
    const model = roomModel(lshape())
    const { placed } = layoutFurniture([
      piece('bed', 'bed', 1.6, 2.1), piece('ns', 'nightstand', 0.45, 0.4), piece('ns', 'nightstand', 0.45, 0.4),
      { ...piece('wardrobe', 'wardrobe', 1.2, 0.6), tall: true }, piece('desk', 'desk', 1.2, 0.6), piece('dchair', 'desk_chair', 0.5, 0.5),
    ], model, 'yotoqxona', [])
    const bed = roles(placed, 'bed')[0]
    expect(bed).toBeDefined()
    expect(model.inside(bed.rect)).toBe(true)
    for (const z of model.clear) if (z.kind === 'door') expect(overlaps(bed.rect, z.rect, 0)).toBe(false)
    // 0.6 m kept free on at least one side and at the foot.
    const sides = [zoneBeside(bed.rect, 1, 0.6), zoneBeside(bed.rect, -1, 0.6)].filter((z) => model.inside(z))
    expect(sides.length).toBeGreaterThan(0)
    expect(model.inside(zoneAhead(bed.rect, 1, 0.6))).toBe(true)
    for (const p of placed) if (p !== bed && p.piece.role !== 'nightstand') expect(overlaps(p.rect, bed.rect, 0)).toBe(false)
  })

  it('4.5 x 3.6 with a door in the middle of every wall: the sofa still stands, never in a door swing', () => {
    const model = roomModel(box(4500, 3600, { A: [el('eshik', 900, 1800)], B: [el('eshik', 900, 1300)], C: [el('eshik', 900, 1800)], D: [el('eshik', 900, 1300)] }))
    const { placed } = layoutFurniture([
      piece('sofa', 'sofa', 2.3, 0.95), piece('coffee', 'coffee_table', 1.0, 0.6), piece('arm', 'armchair', 0.75, 0.75),
      piece('table', 'dining_table', 1.4, 0.8), piece('chair', 'dining_chair', 0.45, 0.5), { ...piece('wardrobe', 'wardrobe', 1.2, 0.6), tall: true },
    ], model, 'mehmonxona', [])
    const sofa = roles(placed, 'sofa')[0]
    expect(sofa).toBeDefined()
    expect(model.inside(sofa.rect)).toBe(true)
    for (const p of placed) {
      if (p.piece.role === 'rug') continue
      for (const z of model.clear) if (z.kind === 'door') expect(overlaps(p.rect, z.rect, 0), p.piece.role).toBe(false)
    }
  })
})

describe('final review: a second chair model is named, not lost', () => {
  it('two different chair models: the table gets the first, the second is listed as left out', () => {
    const model = roomModel(box(4500, 3200, { A: [el('eshik', 900, 500)] }))
    const { placed, dropped } = layoutFurniture([
      piece('Ovqat stoli', 'dining_table', 1.4, 0.8), piece('Stul', 'dining_chair', 0.45, 0.5), piece('Taburet', 'dining_chair', 0.4, 0.4),
    ], model, 'oshxona', [])
    expect(roles(placed, 'dining_chair').every((c) => c.piece.name === 'Stul')).toBe(true)
    expect(dropped).toContainEqual({ name: 'Taburet', count: 1 })
  })
})

describe('final review: layout time', () => {
  it('an 8 x 6 room with 8 pieces is laid out well within budget', () => {
    const model = roomModel(box(8000, 6000, { A: [el('eshik', 900, 1000)], C: [el('deraza', 1500, 3000)], B: [el('deraza', 1500, 2000)] }))
    const pieces = [
      piece('sofa', 'sofa', 2.3, 0.95), piece('coffee', 'coffee_table', 1.0, 0.6), piece('arm', 'armchair', 0.75, 0.75), piece('arm', 'armchair', 0.75, 0.75),
      piece('tv', 'tv_unit', 1.6, 0.4), piece('table', 'dining_table', 1.8, 0.9), piece('chair', 'dining_chair', 0.45, 0.5),
      { ...piece('wardrobe', 'wardrobe', 1.2, 0.6), tall: true },
    ]
    const times: number[] = []
    for (let k = 0; k < 3; k++) {
      const fresh = roomModel(box(8000, 6000, { A: [el('eshik', 900, 1000)], C: [el('deraza', 1500, 3000)], B: [el('deraza', 1500, 2000)] }))
      const t0 = performance.now()
      layoutFurniture(pieces, k === 0 ? model : fresh, 'mehmonxona', [])
      times.push(performance.now() - t0)
    }
    const median = [...times].sort((a, b) => a - b)[1]
    console.info(`8x6 layout ms: ${times.map((t) => t.toFixed(0)).join(', ')} (median ${median.toFixed(0)})`)
    // Measured on a Mac: ~50 ms alone, ~130-150 ms under full-suite load (~230 ms alone before the dining
    // cache). The bound is generous so a slower CI runner under load does not flake.
    expect(median).toBeLessThan(600)
  })
})
