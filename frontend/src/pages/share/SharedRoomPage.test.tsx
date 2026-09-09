import * as React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SharedRoomPage from './SharedRoomPage'

// ─── Scope of this test file ───────────────────────────────────────────────
//
// Only the pre-Canvas branches (loading / not-found) are covered here.
// The happy path mounts a react-three-fiber <Canvas>, which needs a real
// WebGL context — jsdom's canvas.getContext() returns null, so three.js
// throws constructing its WebGLRenderer without extensive mocking (canvas
// context, RAF, ResizeObserver, ...). Every other Canvas/R3F page in this
// repo (ThreeDPage.tsx and friends) has gone deliberately untested for the
// exact same reason — skipping the happy-path render here follows that same
// precedent rather than bolting on a one-off WebGL mock for this page alone.

const getPublicRoom = vi.fn()

vi.mock('@/lib/api', () => ({
  getPublicRoom: (...args: unknown[]) => getPublicRoom(...args),
}))

function renderShared(token = 'tok123') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/share/${token}`]}>
        <Routes>
          <Route path="/share/:token" element={<SharedRoomPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  getPublicRoom.mockClear()
})

describe('SharedRoomPage (public read-only share link)', () => {
  it('shows a loading message before the API responds', () => {
    getPublicRoom.mockReturnValue(new Promise(() => {})) // never resolves
    renderShared()

    expect(screen.getByText(/Yuklanmoqda/i)).toBeInTheDocument()
  })

  it('shows a not-found message for an invalid or revoked token, without leaking which', async () => {
    getPublicRoom.mockRejectedValue(new Error('HTTP 404'))
    renderShared('does-not-exist')

    await waitFor(() => {
      expect(screen.getByText(/Havola topilmadi/i)).toBeInTheDocument()
    })
    // No hint anywhere in the DOM about whether the room ever existed.
    expect(screen.queryByText(/xona/i)).not.toBeInTheDocument()
  })

  it('requests the room by the token taken from the URL', () => {
    getPublicRoom.mockReturnValue(new Promise(() => {}))
    renderShared('my-specific-token')

    expect(getPublicRoom).toHaveBeenCalledWith('my-specific-token')
  })
})
