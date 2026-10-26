import { describe, it, expect, beforeEach } from 'vitest'
import { useRoomStore } from '@/store/roomStore'
import type { RoomGeometry, WallElement } from '@/store/roomStore'
import type { AiDesignPlan, CatalogFurniture } from '@/lib/api'
import { ALL_PARTS, applyDesignPlan, restoreDesign, snapshotDesign } from '../aiDesign'
import { overlaps, type Rect } from '../aiDesignLayout'

const geometry = (): RoomGeometry => ({
  walls: ['A', 'B', 'C', 'D'].map((id, i) => ({ id, length: i % 2 ? 3000 : 4000, elements: [] })),
}) as RoomGeometry

const item = (id: string, name: string, w: number, d: number, category = 'divan'): CatalogFurniture => ({
  id, name_uz: name, category, store_id: null, store_name: null, room_type: null, placement: 'pol',
  price_uzs: 1_000_000, glb_url: 'x.glb', thumbnail_url: null, footprint_w: w, footprint_d: d,
})
const catalog = [item('sofa', 'Divan', 210, 95), item('table', 'Kofe stoli', 110, 60, 'stol'), item('rug', 'Gilam', 240, 170, 'gilam')]

const plan = (): AiDesignPlan => ({
  title: 'Qorong\'i', summary: 'x', warnings: [],
  walls: { main: { type: 'paint', color: '#2c2c2c' }, accent: { wall: 'C', color: '#1a1a1a' } },
  floor: { type: 'parquet', pattern: 'herringbone', tint: '#3d2b1f' },
  lights: [{ type: 'chandelier', zone: 'center' }, { type: 'bra', zone: 'wall_B' }],
  furniture: [{ id: 'table', name: 'Kofe stoli', zone: 'center' }, { id: 'rug', name: 'Gilam', zone: 'center' }, { id: 'sofa', name: 'Divan', zone: 'wall_A' }],
})

beforeEach(() => {
  useRoomStore.getState().resetRoom()
  useRoomStore.setState({ geometry: geometry(), lights: [], furniture: [] })
})

describe('applyDesignPlan', () => {
  it('paints every wall, then the accent wall over it', () => {
    applyDesignPlan(plan(), ALL_PARTS, catalog)
    const walls = useRoomStore.getState().designState.wallCoverings
    expect(walls.ALL).toEqual({ kind: 'paint', color: '#2c2c2c' })
    expect(walls.C).toEqual({ kind: 'paint', color: '#1a1a1a' })
  })

  it('applies a wallpaper from its pattern and colours', () => {
    const p = plan()
    p.walls = { main: { type: 'oboy', pattern: 'damask', base_color: '#f5f5f0', accent_color: '#d4af37' } }
    applyDesignPlan(p, ALL_PARTS, catalog)
    expect(useRoomStore.getState().designState.wallCoverings.ALL).toEqual(
      { kind: 'oboy', patternId: 'damask', baseColor: '#f5f5f0', accentColor: '#d4af37' })
  })

  it('lays the floor: type, pattern and tint, and marks it as chosen', () => {
    applyDesignPlan(plan(), ALL_PARTS, catalog)
    const ds = useRoomStore.getState().designState
    expect(ds.floorType).toBe('parquet')
    expect(ds.floorConfigured).toBe(true)
    expect(ds.floorPattern).toEqual({ id: 'herringbone', settings: { baseColor: '#3d2b1f' } })
  })

  it('a floor with no pattern clears any earlier one', () => {
    useRoomStore.getState().setDesignState({ floorPattern: { id: 'chevron', settings: {} } })
    const p = plan(); p.floor = { type: 'tile', pattern: null, tint: null }
    applyDesignPlan(p, ALL_PARTS, catalog)
    expect(useRoomStore.getState().designState.floorPattern).toBeNull()
    expect(useRoomStore.getState().designState.floorType).toBe('tile')
  })

  it('adds the lights, a wall lamp fixed to its wall', () => {
    const counts = applyDesignPlan(plan(), ALL_PARTS, catalog)
    const lights = useRoomStore.getState().lights
    expect(counts.lights).toBe(2)
    expect(lights.map((l) => l.type)).toEqual(['chandelier', 'bra'])
    expect(lights[1].wallId).toBe('B')
    expect(lights[0].xMm).toBe(2000) // the middle of a 4 m room
  })

  it('places the furniture inside the room without piling pieces up; the rug lies under the table', () => {
    const counts = applyDesignPlan(plan(), ALL_PARTS, catalog)
    const placed = useRoomStore.getState().furniture
    expect(counts.furniture).toBe(3)
    const sofa = placed.find((f) => f.furniture_id === 'sofa')!
    expect(sofa.y).toBeLessThan(-900) // against wall A, the back wall (its centre half a sofa's depth out)
    for (const f of placed) {
      expect(Math.abs(f.x)).toBeLessThanOrEqual(2000) && expect(Math.abs(f.y)).toBeLessThanOrEqual(1500)
    }
    const rug = placed.find((f) => f.furniture_id === 'rug')!
    const table = placed.find((f) => f.furniture_id === 'table')!
    expect(rug.x).toBe(0) && expect(table.x).not.toBeNaN() // both may sit in the middle
  })

  it("keeps the user's own furniture and places new pieces clear of it", () => {
    useRoomStore.getState().placeFurniture({ id: 'mine', furniture_id: 'sofa', x: 0, y: -1000, rotation: 0 })
    applyDesignPlan({ ...plan(), furniture: [{ id: 'sofa', name: 'Divan', zone: 'wall_A' }] }, ALL_PARTS, catalog)
    const placed = useRoomStore.getState().furniture
    expect(placed).toHaveLength(2)
    expect(placed[0].id).toBe('mine')
    expect(Math.abs(placed[1].x - placed[0].x) >= 100 || Math.abs(placed[1].y - placed[0].y) >= 100).toBe(true)
  })

  it('applies only the parts that are switched on', () => {
    const counts = applyDesignPlan(plan(), { walls: false, floor: true, lights: false, furniture: false }, catalog)
    const s = useRoomStore.getState()
    expect(counts).toEqual({ walls: false, floor: true, lights: 0, furniture: 0, skipped: 0, dropped: [] })
    expect(s.lights).toHaveLength(0) && expect(s.furniture).toHaveLength(0)
    expect(s.designState.wallCoverings.ALL).not.toEqual({ kind: 'paint', color: '#2c2c2c' })
  })

  it('a piece missing from the loaded catalog is still placed, with a default size', () => {
    const counts = applyDesignPlan({ ...plan(), furniture: [{ id: 'unknown', name: '?', zone: 'wall_A' }] }, ALL_PARTS, [])
    expect(counts.furniture).toBe(1)
  })

  it('in a drawn L-shaped room the zones are its own walls, and nothing piles up in the middle', () => {
    useRoomStore.setState({
      geometry: {
        walls: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6'].map((id) => ({ id, length: 3000, elements: [] })),
        vertices: [[0, 0], [5000, 0], [5000, 2500], [2500, 2500], [2500, 4500], [0, 4500]],
      } as unknown as RoomGeometry,
    })
    const p = plan()
    p.furniture = [
      { id: 'sofa', name: 'Divan', zone: 'wall_W1' }, { id: 'table', name: 'Kofe stoli', zone: 'wall_W5' },
      { id: 'rug', name: 'Gilam', zone: 'center' }, { id: 'sofa', name: 'Divan', zone: 'corner_W2_W3' },
    ]
    p.lights = [{ type: 'chandelier', zone: 'center' }, { type: 'bra', zone: 'wall_W2' }]
    p.walls = { main: { type: 'paint', color: '#222222' }, accent: { wall: 'W3', color: '#111111' } }
    const counts = applyDesignPlan(p, ALL_PARTS, catalog)
    expect(counts.furniture).toBe(4) && expect(counts.lights).toBe(2)
    const placed = useRoomStore.getState().furniture
    // No two pieces (the rug aside) sit on top of each other: this is what used to happen in such rooms.
    const solid = placed.filter((f) => f.furniture_id !== 'rug')
    for (let i = 0; i < solid.length; i++) {
      for (let j = i + 1; j < solid.length; j++) {
        expect(Math.hypot(solid[i].x - solid[j].x, solid[i].y - solid[j].y)).toBeGreaterThan(800)
      }
    }
    expect(useRoomStore.getState().lights[1].wallId).toBe('W2')
    expect(useRoomStore.getState().designState.wallCoverings.W3).toEqual({ kind: 'paint', color: '#111111' })
  })

  it('a room with no usable outline still gets its pieces, in the middle', () => {
    useRoomStore.setState({ geometry: { walls: [{ id: 'W1', length: 3000, elements: [] }] } as unknown as RoomGeometry })
    const counts = applyDesignPlan(plan(), ALL_PARTS, catalog)
    expect(counts.furniture).toBe(3) && expect(counts.lights).toBe(2)
  })
})

describe('lights from an earlier design', () => {
  it('a second design replaces the lights the first one put in, instead of adding to them', () => {
    applyDesignPlan(plan(), ALL_PARTS, catalog)
    const p = plan(); p.lights = [{ type: 'led_panel', zone: 'center' }]
    applyDesignPlan(p, ALL_PARTS, catalog)
    expect(useRoomStore.getState().lights.map((l) => l.type)).toEqual(['led_panel'])
  })

  it("keeps the lights the user placed", () => {
    useRoomStore.getState().addLight({ id: 'mine', xMm: 500, zMm: 500, type: 'spotlight' })
    applyDesignPlan(plan(), ALL_PARTS, catalog)
    applyDesignPlan(plan(), ALL_PARTS, catalog)
    const lights = useRoomStore.getState().lights
    expect(lights.filter((l) => l.id === 'mine')).toHaveLength(1)
    expect(lights).toHaveLength(1 + plan().lights.length)
  })

  it('marks the lights it puts in as the design\'s', () => {
    applyDesignPlan(plan(), ALL_PARTS, catalog)
    expect(useRoomStore.getState().lights.every((l) => l.fromDesign === true)).toBe(true)
  })

  it('with lights switched off, the earlier design\'s lights stay', () => {
    applyDesignPlan(plan(), ALL_PARTS, catalog)
    applyDesignPlan(plan(), { ...ALL_PARTS, lights: false }, catalog)
    expect(useRoomStore.getState().lights).toHaveLength(plan().lights.length)
  })

  it('undo brings the earlier design\'s lights back', () => {
    applyDesignPlan(plan(), ALL_PARTS, catalog)
    const before = snapshotDesign()
    const p = plan(); p.lights = [{ type: 'led_panel', zone: 'center' }]
    applyDesignPlan(p, ALL_PARTS, catalog)
    restoreDesign(before)
    expect(useRoomStore.getState().lights).toEqual(before.lights)
  })
})

describe('furniture from an earlier design', () => {
  it('a second design replaces the pieces the first one put in, instead of adding a second sofa', () => {
    applyDesignPlan(plan(), ALL_PARTS, catalog)
    applyDesignPlan(plan(), ALL_PARTS, catalog)
    const ids = useRoomStore.getState().furniture.map((f) => f.furniture_id).sort()
    expect(ids).toEqual(['rug', 'sofa', 'table'])
  })

  it("keeps the user's own pieces, and the new ones still avoid them", () => {
    useRoomStore.getState().placeFurniture({ id: 'mine', furniture_id: 'sofa', x: 100, y: 100, rotation: 0 })
    applyDesignPlan(plan(), ALL_PARTS, catalog)
    applyDesignPlan(plan(), ALL_PARTS, catalog)
    const furniture = useRoomStore.getState().furniture
    expect(furniture.filter((f) => f.id === 'mine')).toHaveLength(1)
    expect(furniture.filter((f) => f.fromDesign)).toHaveLength(furniture.length - 1)
    expect(furniture.every((f) => f.id === 'mine' || f.fromDesign === true)).toBe(true)
  })

  it("with furniture switched off, the earlier design's pieces stay", () => {
    applyDesignPlan(plan(), ALL_PARTS, catalog)
    const before = useRoomStore.getState().furniture.length
    applyDesignPlan(plan(), { ...ALL_PARTS, furniture: false }, catalog)
    expect(useRoomStore.getState().furniture).toHaveLength(before)
  })

  it("undo brings the earlier design's pieces back", () => {
    applyDesignPlan(plan(), ALL_PARTS, catalog)
    const before = snapshotDesign()
    applyDesignPlan(plan(), ALL_PARTS, catalog)
    restoreDesign(before)
    expect(useRoomStore.getState().furniture).toEqual(before.furniture)
  })
})

describe('ceiling and trim', () => {
  const trimmed = (): AiDesignPlan => ({
    ...plan(),
    trim: {
      ceiling: { design: 'double_layer', settings: { color: '#f4f1ea', stripK: 3000 } },
      skirting: { id: 'b054' },
      cornice: { id: 't140' },
    },
  })

  it('a style sets the ceiling, the skirting and the cornice with the walls', () => {
    applyDesignPlan(trimmed(), ALL_PARTS, catalog)
    const ds = useRoomStore.getState().designState
    expect(ds.ceiling).toEqual({ design: 'double_layer', settings: { color: '#f4f1ea', stripK: 3000 } })
    expect(ds.skirting).toEqual({ id: 'b054' })
    expect(ds.cornice).toEqual({ id: 't140' })
  })

  it('a style with no cornice takes an earlier one off', () => {
    useRoomStore.getState().setDesignState({ cornice: { id: 't56' } })
    const p = trimmed(); p.trim!.cornice = null
    applyDesignPlan(p, ALL_PARTS, catalog)
    expect(useRoomStore.getState().designState.cornice).toBeNull()
  })

  it('walls switched off leave the ceiling and trim alone', () => {
    const before = useRoomStore.getState().designState
    applyDesignPlan(trimmed(), { ...ALL_PARTS, walls: false }, catalog)
    const ds = useRoomStore.getState().designState
    expect([ds.ceiling, ds.skirting, ds.cornice]).toEqual([before.ceiling, before.skirting, before.cornice])
  })

  it('an AI plan, with null or no trim, leaves them alone', () => {
    useRoomStore.getState().setDesignState({ skirting: { id: 'b052' } })
    applyDesignPlan(plan(), ALL_PARTS, catalog)
    applyDesignPlan({ ...plan(), trim: null }, ALL_PARTS, catalog)
    expect(useRoomStore.getState().designState.skirting).toEqual({ id: 'b052' })
  })

  it('an AI plan sets only the parts it chose, the rest stay', () => {
    useRoomStore.getState().setDesignState({ ceiling: { design: 'flat' }, cornice: { id: 't56' } })
    applyDesignPlan({ ...plan(), trim: { skirting: { id: 'b055' } } }, ALL_PARTS, catalog)
    const ds = useRoomStore.getState().designState
    expect([ds.ceiling, ds.skirting, ds.cornice]).toEqual([{ design: 'flat' }, { id: 'b055' }, { id: 't56' }])
  })

  it('an AI plan keeping the same ceiling design without settings keeps the current settings', () => {
    useRoomStore.getState().setDesignState({ ceiling: { design: 'border', settings: { color: '#123456', stripK: 2700 } } })
    applyDesignPlan({ ...plan(), trim: { ceiling: { design: 'border' } } }, ALL_PARTS, catalog)
    expect(useRoomStore.getState().designState.ceiling).toEqual({ design: 'border', settings: { color: '#123456', stripK: 2700 } })
    applyDesignPlan({ ...plan(), trim: { ceiling: { design: 'flat' } } }, ALL_PARTS, catalog)
    expect(useRoomStore.getState().designState.ceiling).toEqual({ design: 'flat' })
  })

  it('undo puts the ceiling and trim back', () => {
    const before = snapshotDesign()
    applyDesignPlan(trimmed(), ALL_PARTS, catalog)
    restoreDesign(before)
    expect(useRoomStore.getState().designState).toEqual(before.designState)
  })
})

describe('snapshot and restore', () => {
  it('puts the room back exactly as it was', () => {
    useRoomStore.getState().placeFurniture({ id: 'mine', furniture_id: 'sofa', x: 100, y: 100, rotation: 0 })
    const before = snapshotDesign()
    applyDesignPlan(plan(), ALL_PARTS, catalog)
    expect(useRoomStore.getState().furniture.length).toBeGreaterThan(1)
    restoreDesign(before)
    const s = useRoomStore.getState()
    expect(s.furniture.map((f) => f.id)).toEqual(['mine'])
    expect(s.lights).toHaveLength(0)
    expect(s.designState).toEqual(before.designState)
  })

  it('the snapshot is a copy: later changes do not leak into it', () => {
    const before = snapshotDesign()
    applyDesignPlan(plan(), ALL_PARTS, catalog)
    expect(before.lights).toHaveLength(0)
    expect(before.designState.wallCoverings.ALL).not.toEqual({ kind: 'paint', color: '#2c2c2c' })
  })
})

describe('floor lamps and furniture', () => {
  const beds = [item('bed', 'Karavot', 160, 200, 'karavot'), item('long', 'Uzun divan', 300, 95)]
  const sizes: Record<string, { w: number; d: number }> = { bed: { w: 1.6, d: 2 }, long: { w: 3, d: 0.95 } }
  const lampPlan = (lights: AiDesignPlan['lights']): AiDesignPlan => ({ ...plan(), lights, furniture: [] })
  const LIGHTS_ONLY = { walls: false, floor: false, lights: true, furniture: false }
  /** A light's footprint in world metres (the 4 x 3 m room's corner is at -2, -1.5). */
  const lampRect = (l: { xMm: number; zMm: number }): Rect => ({ x: l.xMm / 1000 - 2, z: l.zMm / 1000 - 1.5, w: 0.4, d: 0.4, rotation: 0 })
  const furnitureRects = () => useRoomStore.getState().furniture.map((f) => ({ x: f.x / 1000, z: f.y / 1000, ...sizes[f.furniture_id], rotation: f.rotation }))
  /** Where the lamp stands in an empty room. */
  const freeSpot = (lights: AiDesignPlan['lights']) => {
    applyDesignPlan(lampPlan(lights), LIGHTS_ONLY, beds)
    const out = useRoomStore.getState().lights.map(({ xMm, zMm }) => ({ xMm, zMm }))
    useRoomStore.setState({ lights: [] })
    return out
  }

  it("a corner lamp whose corner the user's bed takes is moved off the bed, still inside the room", () => {
    const [corner] = freeSpot([{ type: 'floor_lamp', zone: 'corner_A_B' }])
    const at = lampRect(corner)
    useRoomStore.getState().placeFurniture({ id: 'mine', furniture_id: 'bed', x: at.x * 1000, y: at.z * 1000, rotation: 0 })
    applyDesignPlan(lampPlan([{ type: 'floor_lamp', zone: 'corner_A_B' }]), LIGHTS_ONLY, beds)
    const lamp = lampRect(useRoomStore.getState().lights[0])
    expect(furnitureRects().some((r) => overlaps(lamp, r, 0))).toBe(false)
    expect(Math.abs(lamp.x) + 0.2).toBeLessThanOrEqual(2) && expect(Math.abs(lamp.z) + 0.2).toBeLessThanOrEqual(1.5)
  })

  it("does not stand inside the design's own furniture: a sofa running into both corners", () => {
    const p: AiDesignPlan = { ...lampPlan([{ type: 'floor_lamp', zone: 'corner_A_B' }, { type: 'floor_lamp', zone: 'corner_A_D' }]),
      furniture: [{ id: 'long', name: 'Uzun divan', role: 'sofa', zone: 'wall_A' }] }
    applyDesignPlan(p, ALL_PARTS, beds, 'mehmonxona')
    expect(furnitureRects()).toHaveLength(1)
    for (const l of useRoomStore.getState().lights) expect(overlaps(lampRect(l), furnitureRects()[0], 0)).toBe(false)
  })

  it('a lamp clear of the furniture stays where it was', () => {
    const [corner] = freeSpot([{ type: 'floor_lamp', zone: 'corner_A_B' }])
    useRoomStore.getState().placeFurniture({ id: 'mine', furniture_id: 'bed', x: -1000, y: 400, rotation: 0 })
    applyDesignPlan(lampPlan([{ type: 'floor_lamp', zone: 'corner_A_B' }]), LIGHTS_ONLY, beds)
    expect(useRoomStore.getState().lights.map(({ xMm, zMm }) => ({ xMm, zMm }))).toEqual([corner])
  })

  it('two floor lamps in one corner do not stand on the same spot', () => {
    const lights = [{ type: 'floor_lamp', zone: 'corner_A_B' }, { type: 'floor_lamp', zone: 'corner_A_B' }]
    applyDesignPlan(lampPlan(lights), LIGHTS_ONLY, beds)
    const [a, b] = useRoomStore.getState().lights.map(lampRect)
    expect(overlaps(a, b, 0)).toBe(false)
  })

  it('a lamp under a shelf hung on the wall stays where it was', () => {
    const shelf = { ...item('shelf', 'Osma javon', 80, 30, 'javon'), placement: 'devor' as const }
    const [corner] = freeSpot([{ type: 'floor_lamp', zone: 'corner_A_B' }])
    const at = lampRect(corner)
    useRoomStore.getState().placeFurniture({ id: 'mine', furniture_id: 'shelf', x: at.x * 1000, y: at.z * 1000, rotation: 0 })
    applyDesignPlan(lampPlan([{ type: 'floor_lamp', zone: 'corner_A_B' }]), LIGHTS_ONLY, [...beds, shelf])
    expect(useRoomStore.getState().lights.map(({ xMm, zMm }) => ({ xMm, zMm }))).toEqual([corner])
  })

  it('ceiling and wall lights are left where they are, over the furniture or not', () => {
    const lights = [{ type: 'chandelier', zone: 'center' }, { type: 'bra', zone: 'wall_B' }]
    const before = freeSpot(lights)
    useRoomStore.getState().placeFurniture({ id: 'mine', furniture_id: 'bed', x: 0, y: 0, rotation: 0 })
    useRoomStore.getState().placeFurniture({ id: 'mine2', furniture_id: 'bed', x: 1100, y: 0, rotation: 0 })
    applyDesignPlan(lampPlan(lights), LIGHTS_ONLY, beds)
    expect(useRoomStore.getState().lights.map(({ xMm, zMm }) => ({ xMm, zMm }))).toEqual(before)
  })
})

describe('a main piece that does not fit', () => {
  // A narrow bedroom, 2.2 x 3.0 m with its door on a long wall: a 160 cm double bed finds no place, not
  // even along a wall (1.6 m of bed and 0.6 m beside it leave no gap to the wall across), a 140 cm one
  // does. (A door may swing over the floor beside a bed, so the 2.6 m room this was keeps a double.)
  const door = { id: 'door', type: 'eshik', width: 800, height: 2000, sill_height: 0, position: 800, positionAuto: false } as WallElement
  const bedroom = (): RoomGeometry => ({
    walls: ['A', 'B', 'C', 'D'].map((id, i) => ({ id, length: i % 2 ? 3000 : 2200, elements: id === 'B' ? [door] : [] })),
  }) as RoomGeometry
  const bed = (id: string, w: number, d: number, styles: string[] = []): CatalogFurniture =>
    ({ ...item(id, `Karavot ${id}`, w, d, 'karavot'), styles })
  const bedPlan = (): AiDesignPlan => ({ ...plan(), lights: [], furniture: [{ id: 'double', name: 'Karavot double', role: 'bed', zone: 'wall_A' }] })

  beforeEach(() => useRoomStore.setState({ geometry: bedroom() }))

  it('is swapped for a smaller one of the same kind from the catalog', () => {
    const counts = applyDesignPlan(bedPlan(), ALL_PARTS, [bed('double', 160, 200), bed('single', 90, 200)], 'yotoqxona')
    expect(useRoomStore.getState().furniture.map((f) => f.furniture_id)).toEqual(['single'])
    expect(counts.furniture).toBe(1)
    expect(counts.dropped).toEqual([])
  })

  it('prefers a smaller piece of the same style over an even smaller one of another style', () => {
    const catalog = [bed('double', 160, 200, ['klassik']), bed('other', 90, 190, ['zamonaviy']), bed('same', 100, 200, ['klassik'])]
    applyDesignPlan(bedPlan(), ALL_PARTS, catalog, 'yotoqxona')
    expect(useRoomStore.getState().furniture.map((f) => f.furniture_id)).toEqual(['same'])
  })

  it('with no smaller piece of its kind, is left out as before', () => {
    const catalog = [bed('double', 160, 200), item('stand', 'Tumbochka', 45, 40, 'tumbochka')]
    const counts = applyDesignPlan(bedPlan(), ALL_PARTS, catalog, 'yotoqxona')
    expect(useRoomStore.getState().furniture).toHaveLength(0)
    expect(counts.dropped).toEqual([{ name: 'Karavot double', count: 1 }])
  })


  it('takes the largest smaller piece that fits, not the smallest: a 120 cm bed over a 90 cm one', () => {
    // A 140 cm bed is tried first and does not fit either.
    const catalog = [bed('double', 160, 200), bed('single', 90, 200), bed('b140', 140, 200), bed('b120', 120, 200)]
    applyDesignPlan(bedPlan(), ALL_PARTS, catalog, 'yotoqxona')
    expect(useRoomStore.getState().furniture.map((f) => f.furniture_id)).toEqual(['b120'])
  })

  it("a children's bed is not put in a bedroom, but is in a children's room", () => {
    const catalog = [bed('double', 160, 200), bed('single', 90, 200), { ...item('kids', 'Bolalar karavoti', 120, 190, 'karavot'), styles: [] }]
    applyDesignPlan(bedPlan(), ALL_PARTS, catalog, 'yotoqxona')
    expect(useRoomStore.getState().furniture.map((f) => f.furniture_id)).toEqual(['single'])
    applyDesignPlan(bedPlan(), ALL_PARTS, catalog, 'bolalar')
    expect(useRoomStore.getState().furniture.map((f) => f.furniture_id)).toEqual(['kids'])
  })

  it('counts an unstyled piece as one of the same style (it suits every style)', () => {
    const catalog = [bed('double', 160, 200, ['klassik']), bed('other', 140, 200, ['zamonaviy']),
      bed('plain', 120, 200), bed('same', 90, 200, ['klassik'])]
    applyDesignPlan(bedPlan(), ALL_PARTS, catalog, 'yotoqxona')
    expect(useRoomStore.getState().furniture.map((f) => f.furniture_id)).toEqual(['plain'])
  })

  describe('a wardrobe too wide for the bedroom', () => {
    const cabinet = (id: string, name: string, w: number, d: number, more: Partial<CatalogFurniture> = {}): CatalogFurniture =>
      ({ ...item(id, name, w, d, 'shkaf'), ...more })
    const wardrobePlan = (): AiDesignPlan => ({ ...plan(), lights: [], furniture: [{ id: 'big', name: 'Shkaf big', role: 'wardrobe', zone: 'wall_A' }] })
    const big = cabinet('big', 'Shkaf big', 400, 60, { room_type: 'yotoqxona' })
    const placedIds = () => useRoomStore.getState().furniture.map((f) => f.furniture_id)

    it("is not swapped for a kitchen's wall cabinet, a bathroom's cabinet or one hung on a wall", () => {
      const catalog = [big,
        cabinet('kitchen', 'Osma shkaf', 80, 35, { room_type: 'oshxona', placement: 'devor' }),
        cabinet('bath', 'Shkafcha', 60, 30, { room_type: 'hammom' }),
        cabinet('hung', 'Devor shkafi', 70, 30, { placement: 'devor' })]
      applyDesignPlan(wardrobePlan(), ALL_PARTS, catalog, 'yotoqxona')
      expect(placedIds()).toEqual([])
    })

    it("is swapped for a bedroom's wardrobe", () => {
      const catalog = [big, cabinet('bath', 'Shkafcha', 60, 30, { room_type: 'hammom' }),
        cabinet('bedroom', 'Shkaf', 150, 60, { room_type: 'yotoqxona' })]
      applyDesignPlan(wardrobePlan(), ALL_PARTS, catalog, 'yotoqxona')
      expect(placedIds()).toEqual(['bedroom'])
    })

    it("in a children's room, takes a bedroom's wardrobe (the catalog has no children's rooms)", () => {
      const catalog = [big, cabinet('living', 'Shkaf', 120, 50, { room_type: 'mehmonxona' }),
        cabinet('bedroom', 'Shkaf', 150, 60, { room_type: 'yotoqxona' })]
      applyDesignPlan(wardrobePlan(), ALL_PARTS, catalog, 'bolalar')
      expect(placedIds()).toEqual(['bedroom'])
    })
  })
})
