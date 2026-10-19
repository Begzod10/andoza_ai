import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModelEditDialog } from './ModelEditDialog'
import type { AdminFurniture } from '@/lib/api'

const api = vi.hoisted(() => ({ updateAdminFurniture: vi.fn() }))
vi.mock('@/lib/api', () => ({
  ...Object.fromEntries(Object.entries(api).map(([k, v]) => [k, (...a: unknown[]) => v(...a)])),
  ADMIN_FURNITURE_CATEGORIES: ['divan', 'stol'],
  ADMIN_ROOM_TYPES: ['mehmonxona'],
  ADMIN_PLACEMENTS: ['pol', 'devor', 'shift'],
}))

const model = (styles?: string[]): AdminFurniture => ({
  id: 'm1', store_id: null, store_name: null, category: 'divan', room_type: null, placement: 'pol',
  name_uz: 'Divan', price_uzs: null, glb_url: null, thumbnail_url: null, footprint_w: null, footprint_d: null,
  is_active: true, created_at: '2026-10-19T00:00:00Z', ...(styles ? { styles } : {}),
})

function open(m: AdminFurniture) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <ModelEditDialog model={m} open onOpenChange={() => {}} stores={[]} onError={() => {}} />
    </QueryClientProvider>,
  )
}

beforeEach(() => { api.updateAdminFurniture.mockReset(); api.updateAdminFurniture.mockResolvedValue({}) })

describe('admin model edit — styles', () => {
  it("shows the model's styles and saves the changed set", async () => {
    open(model(['loft']))
    expect(screen.getByRole('button', { name: 'Loft' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Loft' }))
    fireEvent.click(screen.getByRole('button', { name: 'Milliy' }))
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }))
    await waitFor(() => expect(api.updateAdminFurniture).toHaveBeenCalled())
    expect(api.updateAdminFurniture.mock.calls[0][1].styles).toEqual(['milliy'])
  })

  it('an older model without styles opens with none and says it suits every style', () => {
    open(model())
    expect(screen.getByText('Hamma uslubga mos')).toBeInTheDocument()
  })
})
