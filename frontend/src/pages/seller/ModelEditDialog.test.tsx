import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModelEditDialog } from './ModelEditDialog'
import type { SellerModel } from '@/lib/api'

const api = vi.hoisted(() => ({ updateMyModel: vi.fn() }))
vi.mock('@/lib/api', () => ({
  ...Object.fromEntries(Object.entries(api).map(([k, v]) => [k, (...a: unknown[]) => v(...a)])),
}))

const model = (styles: string[], styles_source: string | null): SellerModel => ({
  id: 'm1', category: 'divan', room_type: null, placement: 'pol', name_uz: 'Divan', price_uzs: 100,
  glb_url: null, thumbnail_url: null, footprint_w: null, footprint_d: null, styles, styles_source,
  is_active: true, status: 'approved', moderation_note: null, created_at: '2026-10-19T00:00:00Z',
} as SellerModel)

function open(m: SellerModel) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <ModelEditDialog model={m} onClose={() => {}} onSaved={() => {}} />
    </QueryClientProvider>,
  )
}

const save = () => fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }))
const payload = () => api.updateMyModel.mock.calls[0][1]

beforeEach(() => { api.updateMyModel.mockReset(); api.updateMyModel.mockResolvedValue({}) })

describe('seller model edit — when styles are sent', () => {
  // The backend marks styles 'manual' whenever `styles` is in the PATCH, which locks the
  // AI out; a seller fixing only the price must not do that.
  it('a price-only save of a never-styled model leaves styles out', async () => {
    open(model([], null))
    fireEvent.change(screen.getByLabelText("Narxi (so'm)"), { target: { value: '250' } })
    save()
    await waitFor(() => expect(api.updateMyModel).toHaveBeenCalled())
    expect(payload().price_uzs).toBe(250)
    expect(payload()).not.toHaveProperty('styles')
  })

  it('changing a chip sends styles', async () => {
    open(model([], null))
    fireEvent.click(screen.getByRole('button', { name: 'Loft' }))
    save()
    await waitFor(() => expect(api.updateMyModel).toHaveBeenCalled())
    expect(payload().styles).toEqual(['loft'])
  })

  it('saving AI-set styles unchanged sends them, confirming them', async () => {
    open(model(['loft'], 'ai'))
    save()
    await waitFor(() => expect(api.updateMyModel).toHaveBeenCalled())
    expect(payload().styles).toEqual(['loft'])
  })
})
