/**
 * `?place=<furniture id>`: the mobile app opens a room this way from a shop's
 * product page, and the studio drops that model into the room once — only
 * after the room's own copy has loaded, so the load neither wipes it nor is
 * blocked by it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { createElement, type ReactNode } from 'react'
import type { CatalogFurniture } from '@/lib/api'
import { useRoomStore } from '@/store/roomStore'

const api = vi.hoisted(() => ({ getCatalogFurniture: vi.fn() }))
vi.mock('@/lib/api', async (orig) => ({ ...(await orig<object>()), ...api }))

import { placeParam, usePlaceFromLink } from '../usePlaceFromLink'

const ID = '3f2b8c1e-5d4a-4b6f-9e0d-1a2b3c4d5e6f'

const sofa: CatalogFurniture = {
  id: ID, store_id: 's1', store_name: 'Mebel Plus', category: 'divan', room_type: null,
  placement: 'pol', name_uz: 'Divan', price_uzs: 4_500_000,
  glb_url: 'https://andozaai.uz/media/a.glb', thumbnail_url: null,
  footprint_w: 220, footprint_d: 90,
}

function setup(search: string, roomReady: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onPlaced = vi.fn()
  const onFailed = vi.fn()
  let currentSearch = ''
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client },
      createElement(MemoryRouter, { initialEntries: [`/studio/r1/ichkarida${search}`] }, children))
  const hook = renderHook(
    ({ ready }) => {
      currentSearch = useLocation().search
      usePlaceFromLink({ roomReady: ready, onPlaced, onFailed })
    },
    { wrapper, initialProps: { ready: roomReady } },
  )
  return { ...hook, onPlaced, onFailed, search: () => currentSearch }
}

beforeEach(() => {
  vi.clearAllMocks()
  useRoomStore.getState().resetRoom()
  useRoomStore.setState({ catalogFurniture: [] })
})

describe('placeParam', () => {
  it('reads a furniture id', () => {
    expect(placeParam(`?place=${ID}`)).toBe(ID)
  })
  it('ignores anything that is not an id', () => {
    expect(placeParam('?place=../admin')).toBeNull()
    expect(placeParam('')).toBeNull()
  })
})

describe('usePlaceFromLink', () => {
  it('places the model once the room is ready, and drops the param', async () => {
    api.getCatalogFurniture.mockResolvedValue(sofa)
    const { rerender, onPlaced, search } = setup(`?place=${ID}&focus=1`, false)

    await waitFor(() => expect(api.getCatalogFurniture).toHaveBeenCalledWith(ID))
    expect(search()).toBe('?focus=1')
    // Not before the room has loaded.
    expect(useRoomStore.getState().furniture).toHaveLength(0)

    rerender({ ready: true })
    await waitFor(() => expect(onPlaced).toHaveBeenCalledWith(sofa))
    const placed = useRoomStore.getState().furniture
    expect(placed).toHaveLength(1)
    expect(placed[0].furniture_id).toBe(ID)
    // Priced and named from the shop catalog, like a model placed from the panel.
    expect(placed[0].unitPriceUzs).toBe(4_500_000)
    expect(placed[0].name).toBe('Divan')

    rerender({ ready: true })
    expect(useRoomStore.getState().furniture).toHaveLength(1)
  })

  it('keeps the model in the shop catalog when the studio replaces that list', async () => {
    api.getCatalogFurniture.mockResolvedValue(sofa)
    const { onPlaced } = setup(`?place=${ID}`, true)
    await waitFor(() => expect(onPlaced).toHaveBeenCalled())

    useRoomStore.getState().setCatalogFurniture([])
    expect(useRoomStore.getState().catalogFurniture.map((f) => f.id)).toEqual([ID])
  })

  it('reports a model that is no longer for sale', async () => {
    api.getCatalogFurniture.mockRejectedValue(new Error('HTTP 404'))
    const { onFailed, onPlaced } = setup(`?place=${ID}`, true)
    await waitFor(() => expect(onFailed).toHaveBeenCalledTimes(1))
    expect(onPlaced).not.toHaveBeenCalled()
    expect(useRoomStore.getState().furniture).toHaveLength(0)
  })

  it('reports a listing without a 3-D model', async () => {
    api.getCatalogFurniture.mockResolvedValue({ ...sofa, glb_url: null })
    const { onFailed } = setup(`?place=${ID}`, true)
    await waitFor(() => expect(onFailed).toHaveBeenCalledTimes(1))
    expect(useRoomStore.getState().furniture).toHaveLength(0)
  })

  it('does nothing without the param', async () => {
    const { onFailed, onPlaced } = setup('?focus=1', true)
    await new Promise((r) => setTimeout(r, 20))
    expect(api.getCatalogFurniture).not.toHaveBeenCalled()
    expect(onPlaced).not.toHaveBeenCalled()
    expect(onFailed).not.toHaveBeenCalled()
  })
})
