/**
 * `designRoomState` is `applyDesignPlan` without the store: it works out a room's design from the
 * room as it was, so a room that is not open in the studio can be designed too.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useRoomStore } from '@/store/roomStore'
import type { PlacedFurniture, PlacedLight, RoomGeometry, WallElement } from '@/store/roomStore'
import type { AiDesignPlan, CatalogFurniture } from '@/lib/api'
import { ALL_PARTS, applyDesignPlan, designRoomState } from '../aiDesign'

const el = (type: WallElement['type'], width: number, position: number): WallElement =>
  ({ id: `${type}-${position}`, type, width, height: 2100, sill_height: 0, position, positionAuto: false }) as WallElement

/** 4.0 m (walls A, C) x 3.0 m (walls B, D), a door on wall B. */
const geometry = (): RoomGeometry => ({
  walls: [
    { id: 'A', length: 4000, elements: [] }, { id: 'B', length: 3000, elements: [el('eshik', 900, 350)] },
    { id: 'C', length: 4000, elements: [] }, { id: 'D', length: 3000, elements: [] },
  ],
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
  trim: { ceiling: { design: 'double_layer' }, skirting: { id: 'b054' } },
  lights: [{ type: 'chandelier', zone: 'center' }, { type: 'floor_lamp', zone: 'corner_A_B' },
    { type: 'floor_lamp', zone: 'corner_A_D' }, { type: 'bra', zone: 'wall_B' }],
  furniture: [{ id: 'table', name: 'Kofe stoli', zone: 'center' }, { id: 'rug', name: 'Gilam', zone: 'center' }, { id: 'sofa', name: 'Divan', zone: 'wall_A' }],
})

const mine: PlacedFurniture = { id: 'mine', furniture_id: 'sofa', x: 0, y: 1000, rotation: 0 }
const oldPiece: PlacedFurniture = { id: 'old', furniture_id: 'table', x: 500, y: 500, rotation: 0, fromDesign: true }
const myLight: PlacedLight = { id: 'my-light', xMm: 500, zMm: 500, type: 'spotlight' }
const oldLight: PlacedLight = { id: 'old-light', xMm: 2000, zMm: 1500, type: 'chandelier', fromDesign: true }

/** A room that has been worked on: a wall of its own, the user's ceiling, the user's things and an earlier design's. */
function prevRoom() {
  const s = useRoomStore.getState()
  return {
    designState: {
      ...s.designState,
      wallCoverings: { ALL: { kind: 'paint' as const, color: '#ffffff' }, D: { kind: 'paint' as const, color: '#ff0000' } },
      ceiling: { design: 'double_layer', settings: { color: '#abcdef', stripK: 4000 } },
    },
    furniture: [mine, oldPiece],
    lights: [myLight, oldLight],
  }
}

/** The ids are new each time (nanoid): compare the rest. */
const noIds = <T extends { id: string }>(xs: T[]) => xs.map(({ id, ...rest }) => ({ ...rest, id: rest.fromDesign ? 'new' : id }))

beforeEach(() => {
  useRoomStore.getState().resetRoom()
  useRoomStore.setState({ geometry: geometry(), lights: [], furniture: [], catalogFurniture: catalog })
})
afterEach(() => vi.restoreAllMocks())

describe('designRoomState', () => {
  it("keeps the user's own furniture and lights", () => {
    const next = designRoomState(prevRoom(), geometry(), plan(), ALL_PARTS, catalog, 'mehmonxona')
    expect(next.furniture.filter((f) => !f.fromDesign)).toEqual([mine])
    expect(next.lights.filter((l) => !l.fromDesign)).toEqual([myLight])
  })

  it('replaces only fromDesign items', () => {
    const next = designRoomState(prevRoom(), geometry(), plan(), ALL_PARTS, catalog, 'mehmonxona')
    expect(next.furniture.map((f) => f.id)).not.toContain('old')
    expect(next.lights.map((l) => l.id)).not.toContain('old-light')
    expect(next.furniture.filter((f) => f.fromDesign)).toHaveLength(next.applied.furniture)
    expect(next.lights.filter((l) => l.fromDesign)).toHaveLength(next.applied.lights)
  })

  it('with a part switched off, that part is left as it was', () => {
    const prev = prevRoom()
    const next = designRoomState(prev, geometry(), plan(), { ...ALL_PARTS, furniture: false, lights: false }, catalog)
    expect(next.furniture).toEqual(prev.furniture)
    expect(next.lights).toEqual(prev.lights)
  })

  it('a wall finish for every wall clears the walls of their own, and the user\'s ceiling settings stay', () => {
    const next = designRoomState(prevRoom(), geometry(), plan(), ALL_PARTS, catalog)
    expect(next.designState.wallCoverings).toEqual({ ALL: { kind: 'paint', color: '#2c2c2c' }, C: { kind: 'paint', color: '#1a1a1a' } })
    expect(next.designState.ceiling).toEqual({ design: 'double_layer', settings: { color: '#abcdef', stripK: 4000 } })
  })

  it('does not touch the store', () => {
    const prev = prevRoom()
    const before = structuredClone(prev)
    const setState = vi.spyOn(useRoomStore, 'setState')
    const getState = vi.spyOn(useRoomStore, 'getState')
    designRoomState(prev, geometry(), plan(), ALL_PARTS, catalog, 'mehmonxona')
    expect(setState).not.toHaveBeenCalled()
    expect(getState).not.toHaveBeenCalled()
    expect(prev).toEqual(before)
  })

  it('equals what applyDesignPlan writes for the same input', () => {
    const prev = prevRoom()
    useRoomStore.setState(structuredClone(prev))
    const next = designRoomState(structuredClone(prev), geometry(), plan(), ALL_PARTS, catalog, 'mehmonxona')
    const applied = applyDesignPlan(plan(), ALL_PARTS, catalog, 'mehmonxona')
    const s = useRoomStore.getState()
    expect(s.designState).toEqual(next.designState)
    expect(noIds(s.furniture)).toEqual(noIds(next.furniture))
    expect(noIds(s.lights)).toEqual(noIds(next.lights))
    expect(applied).toEqual(next.applied)
    // The plan's floor lamps came into it: one corner is clear of the door and the sofa, or is left out.
    expect(applied.placedLights.length + applied.droppedLights.reduce((n, d) => n + d.count, 0)).toBe(4)
  })
})
