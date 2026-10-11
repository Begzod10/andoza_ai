/**
 * Tapping "add room" twice in quick succession must add one room, not two.
 *
 * The guard used to be React state (`addingRoom`), which only changes on the
 * next render; a second tap landing before that render passed the guard too,
 * and the flat got two rooms in the same spot.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { Room } from '@/lib/api'
import type { WallAnchor } from '@/lib/newRoomFromWall'

const api = vi.hoisted(() => ({
  createRoom: vi.fn(),
  getRooms: vi.fn(),
  updateRoom: vi.fn(),
}))
vi.mock('@/lib/api', async (orig) => ({ ...(await orig<object>()), ...api }))

import { useAddRoomNavigation } from '../useAddRoomNavigation'
import { useRoomStore } from '@/store/roomStore'
import { FeedbackProvider } from '@/components/ui/FeedbackProvider'

const ROOM = { id: 'r1', apartment_id: 'apt1', name: 'Xona', state: {} } as unknown as Room
const EAST: WallAnchor = { wallId: 'B', midXM: 2, midZM: 0, outX: 1, outZ: 0, side: 'right' } as WallAnchor
const DIMS = { widthMm: 3000, depthMm: 3000, heightMm: 2700, wallThicknessMm: 100 }

function setup() {
  const navigate = vi.fn()
  const onSave = vi.fn(async () => {})
  const { result } = renderHook(
    () => useAddRoomNavigation({ room: ROOM, onSave, resetRoom: () => {}, navigate, W: 4, D: 3 }),
    { wrapper: FeedbackProvider },
  )
  return { result, navigate }
}

beforeEach(() => {
  vi.clearAllMocks()
  useRoomStore.getState().resetRoom()
  useRoomStore.setState({ layoutPos: { x: 0, z: 0 } })
  api.getRooms.mockResolvedValue([])
  api.updateRoom.mockResolvedValue({})
  api.createRoom.mockImplementation(async () => {
    await new Promise((r) => setTimeout(r, 20))
    return { id: 'new-room' }
  })
})

describe('adding a room through a wall', () => {
  it('creates one room when the button is tapped twice before the first finishes', async () => {
    const { result, navigate } = setup()
    await act(async () => {
      await Promise.all([
        result.current.createRoomThroughWall(EAST, DIMS),
        result.current.createRoomThroughWall(EAST, DIMS),
      ])
    })
    expect(api.createRoom).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledTimes(1)
  })

  it('can add another room once the first has finished', async () => {
    const { result } = setup()
    await act(async () => { await result.current.createRoomThroughWall(EAST, DIMS) })
    await act(async () => { await result.current.createRoomThroughWall(EAST, DIMS) })
    expect(api.createRoom).toHaveBeenCalledTimes(2)
  })
})
