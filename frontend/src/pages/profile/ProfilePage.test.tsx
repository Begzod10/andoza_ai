/**
 * The profile used to say "Foydalanuvchi" for everyone and show three "—"
 * stat tiles with no data behind them. It now shows who is signed in.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ProfilePage from './ProfilePage'
import { useAuthStore } from '@/store/authStore'
import * as api from '@/lib/api'
import { applyLanguage, currentLanguage } from '@/i18n'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof api>('@/lib/api')
  return { ...actual, getMe: vi.fn(), updateMe: vi.fn() }
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
  vi.mocked(api.updateMe).mockResolvedValue({ ...USER, language: 'ru' })
})

afterEach(() => applyLanguage('uz'))

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

describe('ProfilePage language section', () => {
  beforeEach(() => useAuthStore.setState({ user: USER, isAuthenticated: true }))

  it('lists the three languages and marks the current one', () => {
    mount()
    expect(screen.getByRole('heading', { name: 'Til' })).toBeTruthy()
    expect(screen.getByRole('button', { name: "O'zbekcha" }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Русский' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'English' })).toBeTruthy()
  })

  it('switches the open page to Russian without a reload and saves the choice', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Русский' }))
    expect(screen.getByRole('heading', { name: 'Язык' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Til' })).toBeNull()
    expect(window.localStorage.getItem('andoza.lang')).toBe('ru')
    expect(api.updateMe).toHaveBeenCalledWith({ language: 'ru' })
    await waitFor(() => expect(useAuthStore.getState().user?.language).toBe('ru'))
  })

  it('stays in the new language, silently, when saving it fails', async () => {
    vi.mocked(api.updateMe).mockRejectedValue(new Error('offline'))
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    await waitFor(() => expect(api.updateMe).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 0))
    expect(currentLanguage()).toBe('en')
    expect(screen.getByRole('heading', { name: 'Language' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(window.localStorage.getItem('andoza.lang')).toBe('en')
  })
})
