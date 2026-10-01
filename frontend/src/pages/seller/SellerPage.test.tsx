import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SellerPage from './SellerPage'

// vi.mock is hoisted above plain top-level consts, so the stubs live in vi.hoisted.
const api = vi.hoisted(() => ({
  getMyStore: vi.fn(),
  applyForStore: vi.fn(),
  listMyModels: vi.fn(),
  resubmitMyStore: vi.fn(),
  updateMyStore: vi.fn(),
  updateMyModel: vi.fn(),
  deleteMyModel: vi.fn(),
  uploadMyModel: vi.fn(),
}))
vi.mock('@/lib/api', () => ({
  ...Object.fromEntries(Object.entries(api).map(([k, v]) => [k, (...a: unknown[]) => v(...a)])),
  ADMIN_FURNITURE_CATEGORIES: ['divan', 'stol'],
  ADMIN_ROOM_TYPES: ['mehmonxona'],
  ADMIN_PLACEMENTS: ['pol', 'devor', 'shift'],
}))
// The 3D preview needs WebGL; the page logic does not.
vi.mock('@/pages/dokon/admin/ModelPreview3D', () => ({ ModelPreview3D: () => null }))

const store = (over: Record<string, unknown> = {}) => ({
  id: 's1', name: 'Mebel Plus', district: 'Chilonzor', phone: null, telegram: null, logo_color: null,
  partner_tier: 'standard', status: 'approved', moderation_note: null, is_active: true, created_at: '2026-10-01', ...over,
})
const model = (over: Record<string, unknown> = {}) => ({
  id: 'm1', category: 'divan', room_type: null, placement: 'pol', name_uz: 'Divan', price_uzs: 1500000,
  glb_url: 'u', thumbnail_url: null, footprint_w: null, footprint_d: null, is_active: true, status: 'approved',
  moderation_note: null, created_at: '2026-10-01', ...over,
})

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}><MemoryRouter><SellerPage /></MemoryRouter></QueryClientProvider>,
  )
}

beforeEach(() => Object.values(api).forEach((f) => f.mockReset()))

describe('SellerPage', () => {
  it('offers the application form to someone with no shop, and sends it', async () => {
    api.getMyStore.mockResolvedValue(null)
    api.applyForStore.mockResolvedValue(store({ status: 'pending', is_active: false }))
    renderPage()

    fireEvent.change(await screen.findByLabelText("Do'kon nomi"), { target: { value: 'Mebel Plus' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ariza yuborish' }))

    await waitFor(() => expect(api.applyForStore).toHaveBeenCalledWith(expect.objectContaining({ name: 'Mebel Plus' })))
    await screen.findByText(/Arizangiz ko'rib chiqilmoqda/)
  })

  it('does not submit an empty application', async () => {
    api.getMyStore.mockResolvedValue(null)
    renderPage()
    expect(await screen.findByRole('button', { name: 'Ariza yuborish' })).toBeDisabled()
  })

  it('tells a pending shop to wait and offers no upload', async () => {
    api.getMyStore.mockResolvedValue(store({ status: 'pending', is_active: false }))
    renderPage()
    await screen.findByText(/Arizangiz ko'rib chiqilmoqda\. Tasdiqlangach/)
    expect(screen.queryByRole('button', { name: /Yangi model/ })).toBeNull()
    expect(api.listMyModels).not.toHaveBeenCalled()
  })

  it('shows why a shop was rejected and lets the seller send it again', async () => {
    api.getMyStore.mockResolvedValue(store({ status: 'rejected', is_active: false, moderation_note: "Telefon noto'g'ri" }))
    api.resubmitMyStore.mockResolvedValue(store({ status: 'pending', is_active: false }))
    renderPage()
    await screen.findByText(/Telefon noto'g'ri/)
    fireEvent.click(screen.getByRole('button', { name: /qayta yuborish/ }))
    await waitFor(() => expect(api.resubmitMyStore).toHaveBeenCalled())
  })

  it('lists an approved seller\'s models with their review status', async () => {
    api.getMyStore.mockResolvedValue(store())
    api.listMyModels.mockResolvedValue({
      total: 2, page: 1, per_page: 100,
      items: [model(), model({ id: 'm2', name_uz: 'Stol', status: 'pending', is_active: false }), ],
    })
    renderPage()
    await screen.findByText('Divan')
    expect(screen.getByText('Stol')).toBeInTheDocument()
    // the shop's own badge, and the approved model's
    expect(screen.getAllByText('Tasdiqlangan')).toHaveLength(2)
    expect(screen.getAllByText("Ko'rib chiqilmoqda").length).toBeGreaterThan(0)
  })

  it('shows the rejection reason on a rejected model, and offers hide only for approved ones', async () => {
    api.getMyStore.mockResolvedValue(store())
    api.listMyModels.mockResolvedValue({
      total: 2, page: 1, per_page: 100,
      items: [model({ status: 'rejected', is_active: false, moderation_note: 'Sifatsiz' }), model({ id: 'm2', name_uz: 'Stol' })],
    })
    renderPage()
    await screen.findByText(/Sabab: Sifatsiz/)
    expect(screen.getAllByLabelText(/Katalogdan yashirish/)).toHaveLength(1)
  })

  it('hides an approved model from the catalog', async () => {
    api.getMyStore.mockResolvedValue(store())
    api.listMyModels.mockResolvedValue({ total: 1, page: 1, per_page: 100, items: [model()] })
    api.updateMyModel.mockResolvedValue(model({ is_active: false }))
    renderPage()
    fireEvent.click(await screen.findByLabelText('Katalogdan yashirish'))
    await waitFor(() => expect(api.updateMyModel).toHaveBeenCalledWith('m1', { is_active: false }))
  })

  it('asks before deleting', async () => {
    api.getMyStore.mockResolvedValue(store())
    api.listMyModels.mockResolvedValue({ total: 1, page: 1, per_page: 100, items: [model()] })
    api.deleteMyModel.mockResolvedValue(undefined)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    renderPage()
    fireEvent.click(await screen.findByLabelText("O'chirish"))
    expect(api.deleteMyModel).not.toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText("O'chirish"))
    await waitFor(() => expect(api.deleteMyModel).toHaveBeenCalledWith('m1'))
    confirm.mockRestore()
  })

  it('refuses a model file that is not a .glb before uploading', async () => {
    api.getMyStore.mockResolvedValue(store())
    api.listMyModels.mockResolvedValue({ total: 0, page: 1, per_page: 100, items: [] })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Yangi model/ }))
    const input = document.querySelector('input[type=file][accept=".glb"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'sofa.obj')] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('.glb')
    expect(api.uploadMyModel).not.toHaveBeenCalled()
  })
})
