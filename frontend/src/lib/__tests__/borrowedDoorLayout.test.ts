/**
 * "Barcha xonalarga qo'llash" in a two-room flat put an armchair right in front of the door of the
 * second room: the door is drawn in the FIRST room's geometry, on the wall the two rooms share, and
 * the second room only borrows it at render time (lib/borrowedOpenings). Its layout must keep that
 * door's swing clear too, whether the room is designed from the bulk apply or is the one open.
 *
 * Two 4 x 3.5 m rooms side by side, 20 mm apart (the wizard's gap): room A's wall B (+x) against
 * room B's wall D (-x). The door is stored in room A only.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { AiDesignPlan, CatalogFurniture, Room } from '@/lib/api'
import { useRoomStore, type RoomGeometry } from '@/store/roomStore'
import { ALL_PARTS, applyDesignPlan, designRoomState } from '../aiDesign'
import { overlaps, type Rect } from '../aiDesignLayout'
import { apiGeometryToStoreGeometry, roomScopedElementId } from '../apiRoomGeometry'
import { lightType } from '../lightCatalog'
import { DEFAULT_DESIGN_STATE } from '@/store/roomStore'

const api = vi.hoisted(() => ({ getRooms: vi.fn(), updateRoom: vi.fn() }))
vi.mock('@/lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/api')>()), ...api }))

import { applyToOtherRooms } from '../applyToRooms'
import { withFlatOpenings } from '../layoutOpenings'

const W = 4
const D = 3.5
const DOOR_W = 0.9

const item = (id: string, name: string, category: string, w: number, d: number): CatalogFurniture => ({
  id, name_uz: name, category, room_type: 'mehmonxona', store_id: null, store_name: null, placement: 'pol',
  price_uzs: 1_000_000, glb_url: 'x.glb', thumbnail_url: null, footprint_w: w, footprint_d: d, styles: [],
})
const CATALOG = [
  item('sofa', "Uch o'rinli divan", 'divan', 230, 95), item('table', 'Kofe stoli', 'stol', 110, 60),
  item('arm', 'Kreslo', 'kreslo', 80, 80), item('tv', 'TV tumba', 'tumba', 160, 45),
  item('shelf', 'Kitob javoni', 'shkaf', 100, 40), item('rug', 'Gilam', 'gilam', 200, 140),
]

/** The plan of the screenshot: a living room set with armchairs, and floor lamps by the door wall. */
const PLAN: AiDesignPlan = {
  title: 't', summary: '', warnings: [], walls: {}, floor: null,
  lights: [
    { type: 'floor_lamp', zone: 'corner_D_A' }, { type: 'floor_lamp', zone: 'corner_C_D' }, { type: 'floor_lamp', zone: 'wall_D' },
  ] as AiDesignPlan['lights'],
  furniture: [
    { id: 'sofa', name: "Uch o'rinli divan", role: 'sofa' }, { id: 'table', name: 'Kofe stoli', role: 'coffee_table' },
    { id: 'arm', name: 'Kreslo', role: 'armchair' }, { id: 'arm', name: 'Kreslo', role: 'armchair' },
    { id: 'tv', name: 'TV tumba', role: 'tv_unit' }, { id: 'shelf', name: 'Kitob javoni', role: 'shelf' },
  ] as AiDesignPlan['furniture'],
}

/** Room A with the door at `centre` (0..1 along its wall B, the API's convention), room B with none. */
function flat(centre: number): Room[] {
  const walls = (doorOnB: boolean) => [
    { id: 'A', length: W, elements: [] },
    { id: 'B', length: D, elements: doorOnB ? [{ type: 'eshik' as const, width: DOOR_W, height: 2.1, position: centre }] : [] },
    { id: 'C', length: W, elements: [] },
    { id: 'D', length: D, elements: [] },
  ]
  const room = (id: string, name: string, x: number, doorOnB: boolean): Room => ({
    id, apartment_id: 'apt', name, area: W * D, ceiling_height: 2.7, width: D, length: W, num_doors: 0, num_windows: 0,
    has_balcony: false, renovation_level: '', design_state: {}, created_at: '2026-10-01T00:00:00Z', ceiling_h: 2.7,
    room_type: 'mehmonxona', geometry: { walls: walls(doorOnB) }, updated_at: `${id}-read`,
    state: { layoutPos: { x, z: 0 } },
  })
  return [room('roomA', 'Mehmonxona', 0, true), room('roomB', 'Zal', W + 0.02, false)]
}

/**
 * The floor in front of the borrowed door, in room B's own frame: on its wall D (x = -W/2), as wide
 * as the door plus its frame, as deep as it swings. Built from the numbers here, not from the code
 * under test.
 */
function swingInB(centre: number): Rect {
  const z = -D / 2 + centre * D
  return { x: -W / 2 + 0.95 / 2, z, w: DOOR_W + 0.2, d: 0.95, rotation: Math.PI / 2 }
}

const rectOf = (f: { x: number; y: number; rotation: number; furniture_id: string }): Rect => {
  const c = CATALOG.find((i) => i.id === f.furniture_id)!
  return { x: f.x / 1000, z: f.y / 1000, w: c.footprint_w! / 100, d: c.footprint_d! / 100, rotation: f.rotation }
}
const lampRect = (l: { xMm: number; zMm: number; type?: string }): Rect => {
  const { w, d } = lightType(l.type).sizeM
  return { x: (l.xMm - (W * 1000) / 2) / 1000, z: (l.zMm - (D * 1000) / 2) / 1000, w, d, rotation: 0 }
}

/** What stands in the door's way: furniture bodies (a rug lies under the door) and floor lamps. */
function blockers(
  state: { furniture: Array<{ x: number; y: number; rotation: number; furniture_id: string }>; lights: Array<{ xMm: number; zMm: number; type?: string }> },
  centre: number,
): string[] {
  const swing = swingInB(centre)
  return [
    ...state.furniture.filter((f) => f.furniture_id !== 'rug' && overlaps(rectOf(f), swing, 0)).map((f) => f.furniture_id),
    ...state.lights.filter((l) => lightType(l.type).mount === 'floor' && overlaps(lampRect(l), swing, 0)).map(() => 'floor_lamp'),
  ]
}

const CENTRES = [0.2, 0.35, 0.5, 0.65, 0.8]
const EMPTY = { designState: DEFAULT_DESIGN_STATE, furniture: [], lights: [] }

beforeEach(() => {
  api.getRooms.mockReset()
  api.updateRoom.mockReset().mockImplementation(async (id: string) => ({ id, updated_at: `${id}-written` }))
})

describe('a door borrowed through the shared wall stays clear', () => {
  it('hands the layout room A\'s door on room B\'s wall D, mirrored, and nothing else', () => {
    const rooms = flat(0.3)
    const geometry = apiGeometryToStoreGeometry(rooms[1].geometry, roomScopedElementId('roomB'))!
    const layout = withFlatOpenings(geometry, 'roomB', rooms, { x: W + 0.02, z: 0 })
    const onD = layout.walls.find((w) => w.id === 'D')!.elements
    expect(onD).toHaveLength(1)
    // Both walls measure from -z and the rooms line up, so the left edge is the same number.
    expect(onD[0]).toMatchObject({ type: 'eshik', borrowedFrom: 'roomA', width: DOOR_W * 1000, position: Math.round(0.3 * D * 1000 - DOOR_W * 500) })
    // Seen from the other face: the hinge on the other side.
    expect(onD[0].hinge).toBe('right')
    expect(layout.walls.filter((w) => w.id !== 'D').every((w) => w.elements.length === 0)).toBe(true)
    // A room alone in its flat, or one with no neighbour against it, is laid out from its own geometry.
    expect(withFlatOpenings(geometry, 'roomB', [rooms[1]], null)).toBe(geometry)
  })

  it.each(CENTRES)('applyToOtherRooms keeps room B clear of room A\'s door at %s', async (centre) => {
    api.getRooms.mockResolvedValue(flat(centre))
    const plan = { ...PLAN }
    await applyToOtherRooms({
      aptId: 'apt', currentRoomId: 'roomA', source: { kind: 'ai', plan, wallIds: ['A', 'B', 'C', 'D'] },
      parts: ALL_PARTS, catalog: CATALOG,
    })
    const sent = api.updateRoom.mock.calls.find(([id]) => id === 'roomB')?.[1]
    expect(sent).toBeDefined()
    expect(sent.state.furniture.length).toBeGreaterThan(0)
    expect(blockers(sent.state, centre)).toEqual([])
  })

  it.each(CENTRES)('designRoomState over room B with its borrowed doors keeps the door at %s clear', (centre) => {
    const rooms = flat(centre)
    const geometry = apiGeometryToStoreGeometry(rooms[1].geometry, roomScopedElementId('roomB'))!
    // Pure: the borrowed openings come in with the geometry handed to it.
    const layout = withFlatOpenings(geometry, 'roomB', rooms, { x: W + 0.02, z: 0 })
    const next = designRoomState(EMPTY, layout, PLAN, ALL_PARTS, CATALOG, 'mehmonxona')
    expect(next.furniture.length).toBeGreaterThan(0)
    expect(blockers(next, centre)).toEqual([])
  })

  it.each(CENTRES)('the open room B (applyDesignPlan) keeps the borrowed door at %s clear', (centre) => {
    const rooms = flat(centre)
    const geometry: RoomGeometry = apiGeometryToStoreGeometry(rooms[1].geometry)!
    useRoomStore.getState().resetRoom()
    useRoomStore.setState({ geometry, furniture: [], lights: [], layoutPos: { x: W + 0.02, z: 0 } })
    // The studio's own list of the flat's rooms (`['apt-rooms']`), the open room among them.
    applyDesignPlan(PLAN, ALL_PARTS, CATALOG, 'mehmonxona', { roomId: 'roomB', rooms })
    const state = useRoomStore.getState()
    expect(state.furniture.length).toBeGreaterThan(0)
    expect(blockers(state, centre)).toEqual([])
    // Nothing borrowed is written to the room's own geometry.
    expect(state.geometry).toBe(geometry)
  })
})
