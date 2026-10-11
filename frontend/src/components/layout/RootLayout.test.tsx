import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { RootLayout } from './RootLayout'

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
