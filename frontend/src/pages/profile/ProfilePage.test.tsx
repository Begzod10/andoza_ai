/**
 * The profile used to say "Foydalanuvchi" for everyone and show three "—"
 * stat tiles with no data behind them. It now shows who is signed in.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ProfilePage from './ProfilePage'
import { useAuthStore } from '@/store/authStore'
import * as api from '@/lib/api'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof api>('@/lib/api')
  return { ...actual, getMe: vi.fn() }
})

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><ProfilePage /></MemoryRouter>
    </QueryClientProvider>,
  )
}

const USER = { id: 'u1', phone: null, username: 'aziz', name: 'Aziz Karimov', created_at: '2026-01-01' }

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: null, isAuthenticated: false })
})

describe('ProfilePage', () => {
  it("shows the signed-in user's name and username", () => {
    useAuthStore.setState({ user: USER, isAuthenticated: true })
    mount()
    expect(screen.getByText('Aziz Karimov')).toBeTruthy()
    expect(screen.getByText('@aziz')).toBeTruthy()
    expect(api.getMe).not.toHaveBeenCalled()
  })

  it('has no placeholder "—" stats', () => {
    useAuthStore.setState({ user: USER, isAuthenticated: true })
    mount()
    expect(screen.queryByText('—')).toBeNull()
    expect(screen.queryByText('Smetalar')).toBeNull()
  })

  it('fetches the user from the server when the store has none', async () => {
    vi.mocked(api.getMe).mockResolvedValue(USER)
    mount()
    expect(await screen.findByText('Aziz Karimov')).toBeTruthy()
    expect(useAuthStore.getState().user?.id).toBe('u1')
  })
})
