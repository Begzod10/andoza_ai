/**
 * The live "no hole at all" bug: a door drawn in one room, then the user taps
 * the neighbouring room to open it, and the shared wall is solid there.
 *
 * The real pair (apartment 0cda3742, 2026-10-11): room 215919f0, 4 × 3 m at
 * layout (0, 0), has a 900 mm door on wall B; room 49678d4b, 3.5 × 3 m at
 * (3.85, 0), stands 100 mm east of it. Run through the render pipeline the
 * door IS borrowed into 49678d4b's wall D (see the real-pair test in
 * lib/__tests__/flatOpenings.test.ts) — the geometry was fine. What the
 * neighbour was drawn from was not: `/studio/:roomId` keeps ThreeDPage
 * mounted across a room switch, the flat's room list is cached under one key
 * per APARTMENT, and nothing refetched it when the room changed. So the room
 * opened second was drawn against the list as it stood before the door was
 * drawn in the first, which had no door in it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import type { Room } from '@/lib/api'

const api = vi.hoisted(() => ({ getRooms: vi.fn() }))
vi.mock('@/lib/api', async (orig) => ({ ...(await orig<object>()), ...api }))

import { useFlatRooms } from '../useFlatRooms'

const room = (id: string, doors: number): Room => ({
  id, apartment_id: 'apt', name: 'Xona', ceiling_h: 3,
  geometry: {
    walls: [{ id: 'B', length: 3, elements: Array.from({ length: doors }, () => (
      { type: 'eshik', width: 0.9, height: 2.1, position: 0.4155, sill_height: 0 }
    )) }],
  },
} as unknown as Room)

beforeEach(() => { vi.clearAllMocks() })

describe('the flat\'s rooms after switching room', () => {
  it('are fetched again, so a door drawn in the room just left is in the list', async () => {
    // Before the door: what the list held while the user was in 215919f0.
    api.getRooms.mockResolvedValueOnce([room('215919f0', 0), room('49678d4b', 0)])
    // After it was drawn and saved (onOpen saves before navigating).
    api.getRooms.mockResolvedValue([room('215919f0', 1), room('49678d4b', 0)])

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children)
    const { result, rerender } = renderHook(
      ({ roomId }) => useFlatRooms('apt', roomId),
      { wrapper, initialProps: { roomId: '215919f0' } },
    )
    await waitFor(() => expect(result.current).toBeDefined())

    // Tap the neighbour: same page, same apartment, a different room.
    rerender({ roomId: '49678d4b' })
    await waitFor(() => {
      const owner = result.current?.find((r) => r.id === '215919f0')
      expect(owner?.geometry?.walls?.[0]?.elements).toHaveLength(1)
    })
  })
})
