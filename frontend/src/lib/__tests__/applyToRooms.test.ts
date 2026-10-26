/**
 * Applying a design to the apartment's other rooms, and undoing it: each room is worked out from what
 * the server holds (`designRoomState` over `planForRoom`) and written back with the PATCH guard, so a
 * room changed elsewhere in the meantime is left as it is.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { CatalogFurniture, Room } from '@/lib/api'
import { DEFAULT_DESIGN_STATE } from '@/store/roomStore'
import { ALL_PARTS } from '../aiDesign'
import { planForRoom, type DesignSource } from '../planForRoom'

// `planForRoom` as it is, but able to throw for one room, to show one room's failure is that room's alone.
const planSpy = vi.hoisted(() => ({ failFor: null as string | null }))
vi.mock('../planForRoom', async (importOriginal) => {
  const real = await importOriginal<typeof import('../planForRoom')>()
  return {
    ...real,
    planForRoom: (...a: Parameters<typeof real.planForRoom>) => {
      if (planSpy.failFor && a[1].geometry.walls.some((w) => w.elements?.some((e) => e.id.startsWith(`${planSpy.failFor}:`)))) {
        throw new Error('bad room')
      }
      return real.planForRoom(...a)
    },
  }
})
import { apiGeometryToStoreGeometry, roomScopedElementId } from '../apiRoomGeometry'

const api = vi.hoisted(() => ({ getRooms: vi.fn(), updateRoom: vi.fn() }))
vi.mock('@/lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/api')>()), ...api }))

import { RoomChangedError } from '@/lib/api'
import { applyToOtherRooms, previewOtherRooms, undoOtherRooms, type RoomsUndo } from '../applyToRooms'

const item = (id: string, name: string, category: string, room_type: string | null = null): CatalogFurniture => ({
  id, name_uz: name, category, room_type, store_id: null, store_name: null, placement: 'pol',
  price_uzs: 1_000_000, glb_url: 'x.glb', thumbnail_url: null, footprint_w: 100, footprint_d: 80, styles: [],
})
const CATALOG = [
  item('sofa', "Uch o'rinli divan", 'divan', 'mehmonxona'),
  item('table', 'Kofe stoli', 'stol', 'mehmonxona'),
  item('bed', 'Karavot 160', 'karavot', 'yotoqxona'),
  item('night', 'Tumbochka', 'boshqa', 'yotoqxona'),
  item('wardrobe', 'Kiyim shkafi', 'shkaf', 'yotoqxona'),
]

/** A 4 x 3.5 m room (the API speaks metres), a door on wall B. */
const GEOMETRY = {
  walls: [
    { id: 'A', length: 4, elements: [] }, { id: 'B', length: 3.5, elements: [{ type: 'eshik' as const, width: 0.9, height: 2.1, position: 0.5 }] },
    { id: 'C', length: 4, elements: [] }, { id: 'D', length: 3.5, elements: [] },
  ],
}

const room = (id: string, name: string, extra: Partial<Room> = {}): Room => ({
  id, apartment_id: 'apt', name, area: 14, ceiling_height: 2.7, width: 3.5, length: 4, num_doors: 1, num_windows: 0,
  has_balcony: false, renovation_level: '', design_state: {}, created_at: '2026-10-01T00:00:00Z',
  ceiling_h: 2.7, geometry: GEOMETRY, updated_at: `${id}-read`, ...extra,
})

const SAVED_STATE = {
  designState: { ...DEFAULT_DESIGN_STATE, wallCoverings: { ALL: { kind: 'paint', color: '#ffffff' } } },
  furniture: [{ id: 'mine', furniture_id: 'sofa', x: 500, y: 500, rotation: 0 }],
  lights: [],
  geometry: { walls: [] },
  electricals: [{ id: 'socket-1' }],
  layoutPos: { x: 4, z: 0 },
}

const CURRENT = room('cur', 'Mehmonxona', { room_type: 'mehmonxona', state: SAVED_STATE })
const BEDROOM = room('bed', 'Yotoqxona', { room_type: 'yotoqxona', state: SAVED_STATE })
const LIVING = room('liv', 'Zal', { state: SAVED_STATE })
const NEVER_OPENED = room('new', 'Xona 3', { state: null })
const SOURCE: DesignSource = { kind: 'preset', id: 'skandinav' }

const args = { aptId: 'apt', currentRoomId: 'cur', source: SOURCE, parts: ALL_PARTS, catalog: CATALOG }
const sentFor = (id: string) => api.updateRoom.mock.calls.find(([roomId]) => roomId === id)?.[1]

beforeEach(() => {
  planSpy.failFor = null
  api.getRooms.mockReset().mockResolvedValue([CURRENT, BEDROOM, LIVING, NEVER_OPENED])
  api.updateRoom.mockReset().mockImplementation(async (id: string) => ({ id, updated_at: `${id}-written` }))
})

describe('applyToOtherRooms', () => {
  it('PATCHes every other room with its merged state and the guard', async () => {
    const { outcomes } = await applyToOtherRooms(args)
    expect(api.getRooms).toHaveBeenCalledWith('apt')
    expect(api.updateRoom.mock.calls.map(([id]) => id).sort()).toEqual(['bed', 'liv', 'new'])
    expect(outcomes).toEqual([
      { roomId: 'bed', name: 'Yotoqxona', status: 'applied' },
      { roomId: 'liv', name: 'Zal', status: 'applied' },
      { roomId: 'new', name: 'Xona 3', status: 'applied' },
    ])
    for (const id of ['bed', 'liv', 'new']) expect(sentFor(id).expected_updated_at).toBe(`${id}-read`)

    const bed = sentFor('bed').state
    // Every other key of the blob stays: the PATCH replaces `state` whole.
    expect(bed.geometry).toEqual(SAVED_STATE.geometry)
    expect(bed.electricals).toEqual(SAVED_STATE.electricals)
    expect(bed.layoutPos).toEqual(SAVED_STATE.layoutPos)
    // The user's own piece stays; the bedroom set is added.
    expect(bed.furniture.find((f: { id: string }) => f.id === 'mine')).toEqual(SAVED_STATE.furniture[0])
    const designed = bed.furniture.filter((f: { fromDesign?: boolean }) => f.fromDesign).map((f: { furniture_id: string }) => f.furniture_id)
    expect(designed).toEqual(expect.arrayContaining(['bed', 'night', 'wardrobe']))
    expect(designed).not.toContain('sofa')
    expect(bed.designState.wallCoverings.ALL).not.toEqual(SAVED_STATE.designState.wallCoverings.ALL)
    expect(bed.lights.length).toBeGreaterThan(0)

    // A room without a type takes the type its name gives: "Zal" is a living room.
    const liv = sentFor('liv').state
    expect(liv.furniture.filter((f: { fromDesign?: boolean }) => f.fromDesign).map((f: { furniture_id: string }) => f.furniture_id))
      .toEqual(expect.arrayContaining(['sofa', 'table']))
  })

  it('designs a room never opened from the default state and the room\'s own geometry', async () => {
    await applyToOtherRooms(args)
    const state = sentFor('new').state
    expect(Object.keys(state).sort()).toEqual(['designState', 'furniture', 'lights'])
    expect(state.designState.wallCoverings.ALL).toBeDefined()
    expect(state.designState.wallCoverings.ALL).not.toEqual(DEFAULT_DESIGN_STATE.wallCoverings.ALL)
    expect(state.furniture.length).toBeGreaterThan(0)
    expect(state.furniture.every((f: { fromDesign?: boolean }) => f.fromDesign)).toBe(true)
    expect(state.lights.length).toBeGreaterThan(0)
  })

  it('a room changed elsewhere is "changed", and the others are still applied', async () => {
    api.updateRoom.mockImplementation(async (id: string) => {
      if (id === 'liv') throw new RoomChangedError()
      return { id, updated_at: `${id}-written` }
    })
    const { outcomes, undo } = await applyToOtherRooms(args)
    expect(outcomes.map((o) => [o.roomId, o.status])).toEqual([['bed', 'applied'], ['liv', 'changed'], ['new', 'applied']])
    expect(undo.map((u) => u.roomId)).toEqual(['bed', 'new'])
  })

  it('a room that could not be saved is "failed"', async () => {
    api.updateRoom.mockImplementation(async (id: string) => {
      if (id === 'bed') throw new TypeError('Failed to fetch')
      return { id, updated_at: `${id}-written` }
    })
    const { outcomes, undo } = await applyToOtherRooms(args)
    expect(outcomes.find((o) => o.roomId === 'bed')?.status).toBe('failed')
    expect(undo.map((u) => u.roomId)).toEqual(['liv', 'new'])
  })

  it('keeps each room\'s state as it was, and the updated_at of the write, to undo', async () => {
    const { undo } = await applyToOtherRooms(args)
    expect(undo).toEqual([
      { roomId: 'bed', name: 'Yotoqxona', prevState: SAVED_STATE, writtenAt: 'bed-written' },
      { roomId: 'liv', name: 'Zal', prevState: SAVED_STATE, writtenAt: 'liv-written' },
      { roomId: 'new', name: 'Xona 3', prevState: null, writtenAt: 'new-written' },
    ])
  })

  it('a room whose design cannot be worked out is "failed" and not written; the rest are written and undoable', async () => {
    planSpy.failFor = 'liv'
    const { outcomes, undo } = await applyToOtherRooms(args)
    expect(outcomes.map((o) => [o.roomId, o.status])).toEqual([['bed', 'applied'], ['liv', 'failed'], ['new', 'applied']])
    expect(api.updateRoom.mock.calls.map(([id]) => id).sort()).toEqual(['bed', 'new'])
    expect(undo.map((u) => u.roomId)).toEqual(['bed', 'new'])
  })

  it('reads a malformed saved state as an empty one: furniture or lights not a list, designState not an object', async () => {
    const broken = room('liv', 'Zal', { state: { designState: 'x', furniture: 'oops', lights: { a: 1 }, electricals: [1] } })
    api.getRooms.mockResolvedValue([CURRENT, broken])
    const { outcomes } = await applyToOtherRooms(args)
    expect(outcomes).toEqual([{ roomId: 'liv', name: 'Zal', status: 'applied' }])
    const state = sentFor('liv').state
    expect(state.electricals).toEqual([1])
    expect(state.furniture.length).toBeGreaterThan(0)
    expect(state.furniture.every((f: { fromDesign?: boolean }) => f.fromDesign)).toBe(true)
    expect(Array.isArray(state.lights)).toBe(true)
    expect(state.designState.wallCoverings.ALL).toBeDefined()
  })

  it('a room read without an updated_at is "failed" and not written: no unguarded write', async () => {
    api.getRooms.mockResolvedValue([CURRENT, BEDROOM, room('liv', 'Zal', { updated_at: null })])
    const { outcomes, undo } = await applyToOtherRooms(args)
    expect(outcomes.map((o) => [o.roomId, o.status])).toEqual([['bed', 'applied'], ['liv', 'failed']])
    expect(api.updateRoom.mock.calls.map(([id]) => id)).toEqual(['bed'])
    expect(undo.map((u) => u.roomId)).toEqual(['bed'])
  })

  it('leaves out a room with no walls: there is nothing to design', async () => {
    api.getRooms.mockResolvedValue([CURRENT, BEDROOM, room('empty', 'Bo\'sh', { geometry: null })])
    const { outcomes } = await applyToOtherRooms(args)
    expect(outcomes.map((o) => o.roomId)).toEqual(['bed'])
    expect(api.updateRoom).toHaveBeenCalledTimes(1)
  })
})

describe('undoOtherRooms', () => {
  const UNDO: RoomsUndo = [
    { roomId: 'bed', name: 'Yotoqxona', prevState: SAVED_STATE, writtenAt: 'bed-written' },
    { roomId: 'new', name: 'Xona 3', prevState: null, writtenAt: 'new-written' },
  ]

  it('puts back each room\'s state, guarded by the updated_at of our write', async () => {
    const outcomes = await undoOtherRooms(UNDO)
    expect(api.updateRoom).toHaveBeenCalledWith('bed', { state: SAVED_STATE, expected_updated_at: 'bed-written' })
    // A room that had no state goes back to an empty one: the PATCH does not take null.
    expect(api.updateRoom).toHaveBeenCalledWith('new', { state: {}, expected_updated_at: 'new-written' })
    expect(outcomes).toEqual([
      { roomId: 'bed', name: 'Yotoqxona', status: 'applied' },
      { roomId: 'new', name: 'Xona 3', status: 'applied' },
    ])
  })

  it('a room changed since is "changed": the server refused the write and it stays as it is', async () => {
    api.updateRoom.mockImplementation(async (id: string) => {
      if (id === 'bed') throw new RoomChangedError()
      return { id, updated_at: 'x' }
    })
    const outcomes = await undoOtherRooms(UNDO)
    expect(outcomes.map((o) => [o.roomId, o.status])).toEqual([['bed', 'changed'], ['new', 'applied']])
    const bedWrites = api.updateRoom.mock.calls.filter(([id]) => id === 'bed')
    expect(bedWrites).toHaveLength(1)
    expect(bedWrites[0][1].expected_updated_at).toBe('bed-written')
  })

  it('an entry without the updated_at of our write is "failed" and not written: no unguarded write', async () => {
    const outcomes = await undoOtherRooms([{ ...UNDO[0], writtenAt: '' }, UNDO[1]])
    expect(outcomes.map((o) => [o.roomId, o.status])).toEqual([['bed', 'failed'], ['new', 'applied']])
    expect(api.updateRoom.mock.calls.map(([id]) => id)).toEqual(['new'])
  })

  it('a room that could not be reached is "failed"', async () => {
    api.updateRoom.mockRejectedValue(new Error('HTTP 500'))
    expect((await undoOtherRooms(UNDO)).map((o) => o.status)).toEqual(['failed', 'failed'])
  })
})

describe('previewOtherRooms', () => {
  it('lists each room\'s type, whether it is guessed, and the furniture it gets', () => {
    const preview = previewOtherRooms([BEDROOM, LIVING, NEVER_OPENED], SOURCE, CATALOG)
    expect(preview.map(({ roomId, name, roomType, guessed }) => ({ roomId, name, roomType, guessed }))).toEqual([
      { roomId: 'bed', name: 'Yotoqxona', roomType: 'yotoqxona', guessed: false },
      { roomId: 'liv', name: 'Zal', roomType: 'mehmonxona', guessed: true },
      { roomId: 'new', name: 'Xona 3', roomType: 'mehmonxona', guessed: true },
    ])
    const geometry = apiGeometryToStoreGeometry(BEDROOM.geometry, roomScopedElementId('bed'))!
    const plan = planForRoom(SOURCE, { geometry, wallIds: ['A', 'B', 'C', 'D'], roomType: 'yotoqxona' }, CATALOG)
    expect(preview[0].furnitureNames).toEqual(plan.furniture.map((f) => f.name))
    expect(preview[0].furnitureNames).toEqual(expect.arrayContaining(['Karavot 160', 'Tumbochka', 'Kiyim shkafi']))
    expect(preview[1].furnitureNames).toEqual(expect.arrayContaining(["Uch o'rinli divan", 'Kofe stoli']))
  })

  it('a room the catalog has no furniture for gets none', () => {
    const [kitchen] = previewOtherRooms([room('k', 'Oshxona', { room_type: 'oshxona' })], SOURCE, CATALOG)
    expect(kitchen.roomType).toBe('oshxona')
    expect(kitchen.furnitureNames).toEqual([])
  })

  it('names a room with no walls as skipped, as applying leaves it out', () => {
    expect(previewOtherRooms([room('empty', 'Bo\'sh', { geometry: null, room_type: 'yotoqxona' })], SOURCE, CATALOG)).toEqual([
      { roomId: 'empty', name: 'Bo\'sh', roomType: 'yotoqxona', guessed: false, furnitureNames: [], skipped: 'no_walls' },
    ])
  })

  it('a room that cannot be worked out is skipped as failed, and the others are still listed', () => {
    planSpy.failFor = 'liv'
    const preview = previewOtherRooms([BEDROOM, LIVING], SOURCE, CATALOG)
    expect(preview.map(({ roomId, skipped }) => ({ roomId, skipped }))).toEqual([
      { roomId: 'bed', skipped: null }, { roomId: 'liv', skipped: 'failed' },
    ])
    expect(preview[1].furnitureNames).toEqual([])
  })
})
