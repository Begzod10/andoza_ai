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

const model = (styles?: string[], styles_source?: string | null): AdminFurniture => ({
  id: 'm1', store_id: null, store_name: null, category: 'divan', room_type: null, placement: 'pol',
  name_uz: 'Divan', price_uzs: null, glb_url: null, thumbnail_url: null, footprint_w: null, footprint_d: null,
  is_active: true, created_at: '2026-10-19T00:00:00Z', ...(styles ? { styles } : {}), ...(styles_source !== undefined ? { styles_source } : {}),
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

  it("notes when the AI set the styles, and not otherwise", () => {
    open(model(['loft'], 'ai'))
    expect(screen.getByText("AI qo'ygan — tekshirib, kerak bo'lsa tuzating")).toBeInTheDocument()
  })

  it.each([['manual' as string | null], [null], [undefined]])('no AI note when source is %s', (src) => {
    open(model(['loft'], src))
    expect(screen.queryByText(/AI qo'ygan/)).not.toBeInTheDocument()
  })
})

describe('admin model edit — when styles are sent', () => {
  // The backend marks styles 'manual' whenever `styles` is in the PATCH, which locks the
  // AI out; so only send them when the admin actually set or confirmed them.
  it('a name-only save of a never-styled model leaves styles out', async () => {
    open(model([], null))
    fireEvent.change(screen.getByLabelText('Nomi'), { target: { value: 'Yangi divan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }))
    await waitFor(() => expect(api.updateAdminFurniture).toHaveBeenCalled())
    const payload = api.updateAdminFurniture.mock.calls[0][1]
    expect(payload.name_uz).toBe('Yangi divan')
    expect(payload).not.toHaveProperty('styles')
  })

  it('an unchanged manual set is not resent', async () => {
    open(model(['loft', 'milliy'], 'manual'))
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }))
    await waitFor(() => expect(api.updateAdminFurniture).toHaveBeenCalled())
    expect(api.updateAdminFurniture.mock.calls[0][1]).not.toHaveProperty('styles')
  })

  it('changing a chip sends styles', async () => {
    open(model([], null))
    fireEvent.click(screen.getByRole('button', { name: 'Loft' }))
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }))
    await waitFor(() => expect(api.updateAdminFurniture).toHaveBeenCalled())
    expect(api.updateAdminFurniture.mock.calls[0][1].styles).toEqual(['loft'])
  })

  it('saving AI-set styles unchanged sends them, confirming them', async () => {
    open(model(['loft'], 'ai'))
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }))
    await waitFor(() => expect(api.updateAdminFurniture).toHaveBeenCalled())
    expect(api.updateAdminFurniture.mock.calls[0][1].styles).toEqual(['loft'])
  })
})
