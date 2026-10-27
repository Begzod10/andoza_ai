import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor, within, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { useRoomStore } from '@/store/roomStore'

vi.mock('@/components/ui/ConfirmDialog', () => ({ useConfirm: () => vi.fn() }))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast: vi.fn() }), showToast: vi.fn() }))
vi.mock('@/components/studio/StudioMenu', async () => {
  const React = await import('react')
  return { StudioMenu: React.forwardRef(({ children }: { children: React.ReactNode }, _ref) => <div>{children}</div>) }
})
vi.mock('@/components/studio/RoomSettingsSheet', () => ({ default: () => null }))
vi.mock('@/components/studio/UnsavedChangesGuard', () => ({ UnsavedChangesGuard: () => null }))
vi.mock('@/hooks/useRestoreUserModels', () => ({ useRestoreUserModels: () => {} }))

type ServerRoom = {
  id: string; apartment_id: string; name: string; room_type: string | null
  state: Record<string, unknown>; updated_at: string
  length: number; width: number; ceiling_height: number; area: number
}

/** The backend: two rooms of one flat, both named as the wizard names a room. */
let server: Record<string, ServerRoom>
let tick = 0
const stamp = () => `2026-10-27T10:00:${String(++tick).padStart(2, '0')}Z`
function room(id: string, room_type: string | null): ServerRoom {
  return {
    id, apartment_id: 'apt', name: 'Mening xonam', room_type, state: { name: 'Mening xonam' }, updated_at: stamp(),
    length: 4, width: 3, ceiling_height: 2.7, area: 12,
  }
}

const getRoom = vi.fn(async (id: string) => structuredClone(server[id]))
const updateRoom = vi.fn(async (id: string, data: Record<string, unknown>) => {
  const r = server[id]
  if ('room_type' in data) r.room_type = data.room_type as string | null
  if (data.state) r.state = data.state as Record<string, unknown>
  r.updated_at = stamp()
  return structuredClone(r)
})
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  getRoom: (id: string) => getRoom(id),
  updateRoom: (id: string, data: Record<string, unknown>) => updateRoom(id, data),
}))

import StudioPage from '../StudioPage'

let goTo: (id: string) => void = () => {}
let openFromMenu: (id: string) => void = () => {}
/**
 * The 3D view's room switch, on the same mount (the route has no key): tapping a neighbour seeds
 * its query from the flat's room list (`onSwitchRoom`), then navigates.
 */
function SceneTab({ list }: { list: () => ServerRoom[] }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  goTo = (id) => {
    const target = list().find((r) => r.id === id)
    if (target) queryClient.setQueryData(['room', id], structuredClone(target))
    navigate(`/studio/${id}`)
  }
  // The ⋮ menu's room list (`onOpenRoom`): navigates with nothing seeded, so the room is fetched.
  openFromMenu = (id) => navigate(`/studio/${id}`)
  return <p>scene</p>
}

function renderStudio(at: string, list: () => ServerRoom[] = () => Object.values(server)) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[`/studio/${at}`]}>
        <Routes>
          <Route path="/studio/:roomId" element={<StudioPage />}>
            <Route index element={<SceneTab list={list} />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return document.querySelector('header')!
}

async function pickType(header: HTMLElement, label: RegExp, value: string) {
  fireEvent.click(await within(header).findByRole('button', { name: label }))
  fireEvent.change(within(header).getByLabelText('Xona turi'), { target: { value } })
}

const typePatches = () => updateRoom.mock.calls.filter(([, d]) => 'room_type' in d)

beforeEach(() => {
  tick = 0
  server = { A: room('A', 'mehmonxona'), B: room('B', 'yotoqxona') }
  getRoom.mockClear()
  updateRoom.mockClear()
  localStorage.clear()
  useRoomStore.getState().resetRoom()
})

describe('each room of a flat keeps its own type', () => {
  it('switching rooms on the same mount shows the new room its own type, and the pick went to the first room only', async () => {
    const header = renderStudio('A')
    await waitFor(() => expect(useRoomStore.getState().roomId).toBe('A'))
    await pickType(header, /Mehmonxona/, 'oshxona')
    await waitFor(() => expect(server.A.room_type).toBe('oshxona'))

    act(() => goTo('B'))
    await waitFor(() => expect(useRoomStore.getState().roomId).toBe('B'))
    expect(useRoomStore.getState().roomType).toBe('yotoqxona')
    expect(await within(header).findByRole('button', { name: /Yotoqxona/ })).toBeInTheDocument()
    expect(within(header).queryByText('Oshxona')).not.toBeInTheDocument()
    expect(typePatches()).toEqual([['A', { room_type: 'oshxona' }]])
    expect(server.B.room_type).toBe('yotoqxona')
  })

  it("changing the second room's type leaves the first room's alone, and coming back shows the first room's own", async () => {
    // The flat's list as the 3D view held it when the page opened: read before any pick.
    const listAtOpen = Object.values(structuredClone(server))
    const header = renderStudio('A', () => listAtOpen)
    await waitFor(() => expect(useRoomStore.getState().roomId).toBe('A'))
    await pickType(header, /Mehmonxona/, 'oshxona')
    await waitFor(() => expect(server.A.room_type).toBe('oshxona'))

    act(() => goTo('B'))
    await waitFor(() => expect(useRoomStore.getState().roomId).toBe('B'))
    await pickType(header, /Yotoqxona/, 'bolalar')
    await waitFor(() => expect(server.B.room_type).toBe('bolalar'))
    expect(server.A.room_type).toBe('oshxona')
    expect(typePatches()).toEqual([['A', { room_type: 'oshxona' }], ['B', { room_type: 'bolalar' }]])

    act(() => goTo('A'))
    await waitFor(() => expect(useRoomStore.getState().roomId).toBe('A'))
    await waitFor(() => expect(useRoomStore.getState().roomType).toBe('oshxona'))
    expect(await within(header).findByRole('button', { name: /Oshxona/ })).toBeInTheDocument()
  })

  it("a reload into another room never shows the persisted draft's type as this room's", async () => {
    // Room A was open with type oshxona when the page was reloaded on room B: the store comes back
    // from localStorage (roomId is not persisted), and B is still being fetched.
    useRoomStore.setState({ roomId: 'A', roomType: 'oshxona', name: 'Mening xonam' })
    await useRoomStore.persist.rehydrate()
    useRoomStore.setState({ roomId: null })
    let arrive: (r: ServerRoom) => void = () => {}
    getRoom.mockImplementationOnce(() => new Promise((res) => { arrive = res }))

    const header = renderStudio('B')
    await within(header).findByText(/×/)
    expect(useRoomStore.getState().roomType).not.toBe('oshxona')
    expect(within(header).queryByText('Oshxona')).not.toBeInTheDocument()

    act(() => arrive(structuredClone(server.B)))
    await waitFor(() => expect(useRoomStore.getState().roomId).toBe('B'))
    expect(useRoomStore.getState().roomType).toBe('yotoqxona')
    expect(await within(header).findByRole('button', { name: /Yotoqxona/ })).toBeInTheDocument()
  })

  it("while the next room is still being fetched, the header does not give it the previous room's type", async () => {
    server.A.room_type = 'oshxona'
    const header = renderStudio('A')
    await waitFor(() => expect(useRoomStore.getState().roomId).toBe('A'))
    expect(await within(header).findByRole('button', { name: /Oshxona/ })).toBeInTheDocument()

    let arrive: (r: ServerRoom) => void = () => {}
    getRoom.mockImplementationOnce(() => new Promise((res) => { arrive = res }))
    act(() => openFromMenu('B'))
    await waitFor(() => expect(getRoom).toHaveBeenCalledWith('B'))
    expect(within(header).queryByText('Oshxona')).not.toBeInTheDocument()

    act(() => arrive(structuredClone(server.B)))
    expect(await within(header).findByRole('button', { name: /Yotoqxona/ })).toBeInTheDocument()
  })

  it("when the next room cannot be fetched, the header never shows the previous room's type as its own", async () => {
    server.A.room_type = 'oshxona'
    const header = renderStudio('A')
    await waitFor(() => expect(useRoomStore.getState().roomId).toBe('A'))
    getRoom.mockImplementationOnce(() => Promise.reject(new Error('HTTP 502')))
    act(() => openFromMenu('B'))
    await waitFor(() => expect(getRoom).toHaveBeenCalledWith('B'))
    await new Promise((r) => setTimeout(r, 20))
    expect(within(header).queryByText('Oshxona')).not.toBeInTheDocument()
  })
})
