import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { RootLayout } from './RootLayout'
import { useAuthStore } from '@/store/authStore'

const session = vi.hoisted(() => ({ checkSession: vi.fn() }))
vi.mock('@/lib/api', () => ({ checkSession: (...a: unknown[]) => session.checkSession(...a) }))

function setup() {
  const router = createMemoryRouter(
    [{
      element: <RootLayout />,
      children: [
        { path: '/dokon', element: <p>dokon-page</p> },
        { path: '/profile', element: <p>profile-page</p> },
      ],
    }],
    { initialEntries: ['/dokon'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

function scrolledTo(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
}

describe('RootLayout scroll restoration', () => {
  const original = window.scrollTo
  let scrollTo: ReturnType<typeof vi.fn>
  beforeEach(() => {
    scrollTo = vi.fn()
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo
  })
  afterEach(() => {
    window.scrollTo = original
    scrolledTo(0)
    sessionStorage.clear()
  })

  it('opens a new route at the top instead of the old scroll position', async () => {
    const router = setup()
    await screen.findByText('dokon-page')
    scrolledTo(1200)
    scrollTo.mockClear()
    await act(() => router.navigate('/profile'))
    await screen.findByText('profile-page')
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('puts the old position back on going back', async () => {
    const router = setup()
    await screen.findByText('dokon-page')
    scrolledTo(1200)
    await act(() => router.navigate('/profile'))
    await screen.findByText('profile-page')
    scrolledTo(0)
    scrollTo.mockClear()
    await act(() => router.navigate(-1))
    await screen.findByText('dokon-page')
    expect(scrollTo).toHaveBeenCalledWith(0, 1200)
  })
})


describe('RootLayout session check', () => {
  const admin = { id: 'a1', phone: null, username: 'qa_admin', name: 'Admin', is_admin: true, created_at: '' }
  const other = { id: 'u2', phone: null, username: 'qa_user', name: 'User', is_admin: false, created_at: '' }
  beforeEach(() => {
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
    session.checkSession.mockReset()
    useAuthStore.setState({ user: admin, isAuthenticated: true })
  })

  // The signed-in user is kept in localStorage. Without asking the server on
  // load, signing in as someone else in another tab, or losing admin rights,
  // left the old profile (and the admin screens) in place until /profile.
  it('replaces the stored user with the one the server reports', async () => {
    session.checkSession.mockResolvedValue(other)
    setup()
    await vi.waitFor(() => expect(useAuthStore.getState().user).toEqual(other))
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('signs the browser out when the session is gone', async () => {
    session.checkSession.mockResolvedValue(null)
    setup()
    await vi.waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(false))
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('keeps the stored user when the server cannot be reached', async () => {
    session.checkSession.mockRejectedValue(new Error('offline'))
    setup()
    await vi.waitFor(() => expect(session.checkSession).toHaveBeenCalled())
    expect(useAuthStore.getState().user).toEqual(admin)
  })

  it('does not ask when nobody is signed in', async () => {
    useAuthStore.setState({ user: null, isAuthenticated: false })
    setup()
    await screen.findByText('dokon-page')
    expect(session.checkSession).not.toHaveBeenCalled()
  })
})
