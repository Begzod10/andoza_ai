import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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

const getRoom = vi.fn()
const updateRoom = vi.fn()
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  getRoom: (...a: unknown[]) => getRoom(...a),
  updateRoom: (...a: unknown[]) => updateRoom(...a),
}))

import StudioPage from '../StudioPage'

function apiRoom(name: string, room_type: string | null) {
  return { id: 'r1', apartment_id: 'a1', name, room_type, length: 4, width: 3, ceiling_height: 2.8, area: 12 }
}

function renderStudio() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/studio/r1']}>
        <Routes>
          <Route path="/studio/:roomId" element={<StudioPage />}>
            <Route index element={<p>scene</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return document.querySelector('header')!
}

beforeEach(() => {
  getRoom.mockReset()
  updateRoom.mockReset()
  updateRoom.mockResolvedValue({})
  useRoomStore.getState().resetRoom()
})

describe('the room type in the studio header', () => {
  it('shows the set type next to the dimensions', async () => {
    getRoom.mockResolvedValue(apiRoom('Mening xonam', 'mehmonxona'))
    const header = renderStudio()
    expect(await within(header).findByRole('button', { name: /Mehmonxona/ })).toBeInTheDocument()
  })

  it('shows the guessed type with the guess mark', async () => {
    getRoom.mockResolvedValue(apiRoom('Katta yotoq', null))
    const header = renderStudio()
    const badge = await within(header).findByRole('button', { name: /Yotoqxona/ })
    expect(badge).toHaveTextContent('(taxmin)')
  })

  it('asks to choose a type when it is unknown; choosing PATCHes it and the badge updates', async () => {
    getRoom.mockResolvedValue(apiRoom('Mening xonam', null))
    const header = renderStudio()
    await waitFor(() => expect(useRoomStore.getState().roomId).toBe('r1'))
    fireEvent.click(await within(header).findByRole('button', { name: 'Xona turini tanlang' }))
    fireEvent.change(within(header).getByLabelText('Xona turi'), { target: { value: 'oshxona' } })
    await waitFor(() => expect(updateRoom).toHaveBeenCalledWith('r1', { room_type: 'oshxona' }))
    expect(within(header).getByRole('button', { name: /Oshxona/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xona turini tanlang' })).not.toBeInTheDocument()
  })
})
