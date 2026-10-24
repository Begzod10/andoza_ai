import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { applyLanguage } from '@/i18n'

const confirm = vi.hoisted(() => vi.fn().mockResolvedValue(false))

vi.mock('@/components/ui/ConfirmDialog', () => ({ useConfirm: () => confirm }))
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
  createShareLink: vi.fn().mockResolvedValue({ share_token: 'tok' }),
  revokeShareLink: vi.fn(),
}))

import StudioPage from '../StudioPage'

afterEach(() => act(() => applyLanguage('uz')))

describe('revoking a share link', () => {
  it('labels the destructive button "Revoke" in English, not Cancel', async () => {
    act(() => applyLanguage('en'))
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/studio/r1']}>
          <Routes><Route path="/studio/:roomId" element={<StudioPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(confirm).toHaveBeenCalled())
    expect(confirm.mock.calls[0][0]).toMatchObject({ confirmLabel: 'Revoke', cancelLabel: 'Keep it' })
  })
})
