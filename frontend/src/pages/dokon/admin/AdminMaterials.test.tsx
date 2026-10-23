import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AdminMaterials } from './AdminMaterials'
import AdminCatalogPanel from '../AdminCatalogPanel'

const api = vi.hoisted(() => ({
  listAdminMaterials: vi.fn(), updateAdminMaterial: vi.fn(), listAdminStores: vi.fn(), createAdminMaterial: vi.fn(),
}))
vi.mock('@/lib/api', async () => {
  const consts = await vi.importActual<typeof import('@/lib/api/adminMaterials')>('@/lib/api/adminMaterials')
  return {
    MATERIAL_CATEGORIES: consts.MATERIAL_CATEGORIES,
    MATERIAL_UNITS: consts.MATERIAL_UNITS,
    SMETA_KEYS: consts.SMETA_KEYS,
    listAdminMaterials: (...a: unknown[]) => api.listAdminMaterials(...a),
    updateAdminMaterial: (...a: unknown[]) => api.updateAdminMaterial(...a),
    createAdminMaterial: (...a: unknown[]) => api.createAdminMaterial(...a),
    listAdminStores: (...a: unknown[]) => api.listAdminStores(...a),
  }
})
vi.mock('./ModerationQueue', () => ({ ModerationQueue: () => null }))
vi.mock('./AdminOrders', () => ({ AdminOrders: () => null }))
vi.mock('./CatalogOverview', () => ({ CatalogOverview: () => null }))
vi.mock('./StoreProfile', () => ({ StoreProfile: () => null }))

const material = (over: Record<string, unknown> = {}) => ({
  id: 'm1', store_id: 's1', store_name: 'Qurilish Mart', category: 'gips', name_uz: 'Gips suvoq',
  unit: 'qop', price_uzs: 1_250_000, pack_qty: 30, pack_unit: 'kg', smeta_key: 'suvoq',
  roll_width_cm: null, roll_length_m: null, color_hex: null, image_url: null, is_active: true, ...over,
})
const page = (items: unknown[]) => ({ items, total: items.length, page: 1, per_page: 20 })

function mount(onError = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><AdminMaterials onError={onError} /></QueryClientProvider>)
  return { onError }
}

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset())
  api.listAdminMaterials.mockResolvedValue(page([material()]))
  api.updateAdminMaterial.mockResolvedValue({})
  api.listAdminStores.mockResolvedValue([{ id: 's1', name: 'Qurilish Mart' }])
})

const lastCall = () => api.listAdminMaterials.mock.calls.at(-1)![0]

describe('AdminMaterials list', () => {
  it('shows name, shop, category, price per unit, pack and smeta badge', async () => {
    mount()
    expect(await screen.findByText('Gips suvoq')).toBeInTheDocument()
    expect(screen.getAllByText('Qurilish Mart').length).toBeGreaterThan(0)
    expect(screen.getByText(/Gips/, { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText("1 250 000 so'm / qop")).toBeInTheDocument()
    expect(screen.getByText('30 kg')).toBeInTheDocument()
    expect(screen.getByText('Smeta: Suvoq')).toBeInTheDocument()
    expect(screen.queryByText('Yashirin')).not.toBeInTheDocument()
  })

  it('marks hidden materials', async () => {
    api.listAdminMaterials.mockResolvedValue(page([material({ is_active: false })]))
    mount()
    expect(await screen.findByText('Yashirin')).toBeInTheDocument()
  })
})

describe('AdminMaterials filters', () => {
  it('smeta checkbox refetches with smeta: true', async () => {
    mount()
    await screen.findByText('Gips suvoq')
    fireEvent.click(screen.getByLabelText('Faqat smeta mahsulotlari'))
    await waitFor(() => expect(lastCall().smeta).toBe(true))
  })

  it('category select refetches with category', async () => {
    mount()
    await screen.findByText('Gips suvoq')
    fireEvent.change(screen.getByLabelText('Kategoriya'), { target: { value: 'oboy' } })
    await waitFor(() => expect(lastCall().category).toBe('oboy'))
  })

  it('shop select refetches with store_id', async () => {
    mount()
    await screen.findByText('Gips suvoq')
    await screen.findByRole('option', { name: 'Qurilish Mart' })
    fireEvent.change(screen.getByLabelText("Do'kon"), { target: { value: 's1' } })
    await waitFor(() => expect(lastCall().store_id).toBe('s1'))
  })

  it('search text refetches with q', async () => {
    mount()
    await screen.findByText('Gips suvoq')
    fireEvent.change(screen.getByLabelText('Qidirish'), { target: { value: 'suvoq' } })
    await waitFor(() => expect(lastCall().q).toBe('suvoq'))
  })
})

describe('AdminMaterials hide/show', () => {
  it('Yashirish sends is_active false', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Yashirish' }))
    await waitFor(() => expect(api.updateAdminMaterial).toHaveBeenCalledWith('m1', { is_active: false }))
  })

  it("Ko'rsatish sends is_active true on a hidden row", async () => {
    api.listAdminMaterials.mockResolvedValue(page([material({ is_active: false })]))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: "Ko'rsatish" }))
    await waitFor(() => expect(api.updateAdminMaterial).toHaveBeenCalledWith('m1', { is_active: true }))
  })

  it('reports a failed update through onError', async () => {
    api.updateAdminMaterial.mockRejectedValue(new Error('boom'))
    const { onError } = mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Yashirish' }))
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(String)))
  })
})

describe('AdminMaterials dialog', () => {
  it("opens the form from Material qo'shish and from Tahrirlash", async () => {
    mount()
    await screen.findByText('Gips suvoq')
    fireEvent.click(screen.getByRole('button', { name: "Material qo'shish" }))
    expect(await screen.findByLabelText('Nomi')).toHaveValue('')
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByLabelText('Nomi')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Tahrirlash' }))
    expect(await screen.findByLabelText('Nomi')).toHaveValue('Gips suvoq')
  })
})

describe('AdminCatalogPanel', () => {
  it('shows the Materiallar section when no shop is selected', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={qc}><AdminCatalogPanel /></QueryClientProvider>)
    expect(await screen.findByRole('heading', { name: /^Materiallar/ })).toBeInTheDocument()
  })
})
