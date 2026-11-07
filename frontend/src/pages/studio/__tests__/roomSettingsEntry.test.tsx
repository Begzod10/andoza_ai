/**
 * The room settings (sizes, doors, windows) opened only from the small "4.5 × 3.2 × 2.8 m ✎"
 * line under the room name: a homeowner never found it, and on a phone that line is hidden.
 * A labelled button in the header and a row in the ⋮ menu open it.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const sheet = vi.hoisted(() => ({ open: false }))
vi.mock('@/components/ui/ConfirmDialog', () => ({ useConfirm: () => vi.fn().mockResolvedValue(false) }))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/components/studio/StudioMenu', async () => {
  const React = await import('react')
  return { StudioMenu: React.forwardRef(({ children }: { children: React.ReactNode }, _ref) => <div>{children}</div>) }
})
vi.mock('@/components/studio/RoomSettingsSheet', () => ({
  default: ({ open }: { open: boolean }) => { sheet.open = open; return open ? <div role="dialog" aria-label="settings" /> : null },
}))
vi.mock('@/components/studio/UnsavedChangesGuard', () => ({ UnsavedChangesGuard: () => null }))
vi.mock('@/hooks/useRestoreUserModels', () => ({ useRestoreUserModels: () => {} }))
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  getRoom: vi.fn().mockResolvedValue({ id: 'r1', apartment_id: 'a1', name: 'Zal', length: 4, width: 3, ceiling_height: 2.7, area: 12 }),
}))

import StudioPage from '../StudioPage'

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/studio/r1']}>
        <Routes><Route path="/studio/:roomId" element={<StudioPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ways into the room settings', () => {
  it('the header has a button that says what it opens', async () => {
    renderPage()
    const btn = await screen.findByRole('button', { name: /xona o'lchami/i })
    fireEvent.click(btn)
    expect(screen.getByRole('dialog', { name: 'settings' })).toBeInTheDocument()
  })

  it('the ⋮ menu has a row for it (the only way on a phone, where the header line is hidden)', async () => {
    renderPage()
    const row = await screen.findByRole('button', { name: /o'lcham, eshik va derazalar/i })
    fireEvent.click(row)
    expect(sheet.open).toBe(true)
  })
})
