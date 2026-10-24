import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { MemoryRouter, Route, Routes, useOutletContext } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { StudioContext } from '../ThreeDPage'

vi.mock('@/components/ui/ConfirmDialog', () => ({ useConfirm: () => vi.fn() }))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/components/studio/StudioMenu', async () => {
  const React = await import('react')
  return { StudioMenu: React.forwardRef(({ children }: { children: React.ReactNode }, _ref) => <div>{children}</div>) }
})
vi.mock('@/components/studio/RoomSettingsSheet', () => ({ default: () => null }))
vi.mock('@/components/studio/UnsavedChangesGuard', () => ({ UnsavedChangesGuard: () => null }))
vi.mock('@/hooks/useRestoreUserModels', () => ({ useRestoreUserModels: () => {} }))
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  getRoom: vi.fn().mockResolvedValue({ id: 'r1', apartment_id: 'a1', name: 'Zal', length: 4, width: 3, ceiling_height: 2.7, area: 12 }),
}))

import StudioPage from '../StudioPage'

/** A studio tab that asks for the floating header, as the live 3D view does. */
function SceneTab() {
  const { setOverlayHeader } = useOutletContext<StudioContext>()
  useEffect(() => {
    setOverlayHeader?.(true)
    return () => setOverlayHeader?.(false)
  }, [setOverlayHeader])
  return <p>scene</p>
}

function renderAt(url: string) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/studio/:roomId" element={<StudioPage />}>
            <Route index element={<SceneTab />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => sessionStorage.clear())

describe('the studio header over the 3D view', () => {
  it('floats over it with no background inside the native app', async () => {
    renderAt('/studio/r1?app=1')
    await screen.findByText('scene')
    const header = document.querySelector('header')!
    expect(header.className).toContain('absolute')
    expect(header.className).not.toContain('bg-card')
  })

  it('keeps its own row and background in a browser', async () => {
    renderAt('/studio/r1')
    await screen.findByText('scene')
    const header = document.querySelector('header')!
    expect(header.className).toContain('bg-card')
    expect(header.className).not.toContain('absolute')
  })
})
