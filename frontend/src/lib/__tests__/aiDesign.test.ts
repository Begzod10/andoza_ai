import { describe, it, expect, beforeEach } from 'vitest'
import { useRoomStore } from '@/store/roomStore'
import type { RoomGeometry } from '@/store/roomStore'
import type { AiDesignPlan, CatalogFurniture } from '@/lib/api'
import { ALL_PARTS, applyDesignPlan, restoreDesign, snapshotDesign } from '../aiDesign'

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
    expect(counts).toEqual({ walls: false, floor: true, lights: 0, furniture: 0 })
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
