/**
 * The checkout places real orders: one per shop, with the delivery details, and
 * the cart only loses what was actually ordered.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DokonPage from './DokonPage'

const listCatalogFurniture = vi.fn()
const getMaterials = vi.fn()
const createOrder = vi.fn()
const getOrder = vi.fn()
vi.mock('@/lib/api', () => ({
  listCatalogFurniture: (...a: unknown[]) => listCatalogFurniture(...a),
  getMaterials: (...a: unknown[]) => getMaterials(...a),
  createOrder: (...a: unknown[]) => createOrder(...a),
  getOrder: (...a: unknown[]) => getOrder(...a),
}))

const FURNITURE = {
  id: 'f1', name_uz: 'Divan', category: 'divan', price_uzs: 4_500_000, store_name: 'Mebel Plus', store_id: 's1',
  thumbnail_url: null, room_type: null, placement: 'pol', glb_url: null, footprint_w: 2, footprint_d: 1,
}
const MATERIAL = {
  id: 'm1', name_uz: "Akril bo'yoq", category: 'boyoq', price_uzs: 45_000, unit: 'litr', color_hex: '#fff',
  store_id: 's2', texture_key: null, pbr_roughness: 0.5,
}

const orderOut = (dealer: string, over: object = {}) => ({
  id: `${dealer}-0000-0000-0000`, user_id: 'u', dealer_name: dealer, total_uzs: 0, status: 'accepted',
  delivery_address: 'Chilonzor 5', phone: '+998901234567', payment_method: 'cash',
  created_at: '2026-10-08T08:00:00Z', lines: [], ...over,
})

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><DokonPage /></QueryClientProvider>)
}

async function addFromShop(buttonName: RegExp, tab?: string) {
  if (tab) fireEvent.click(await screen.findByRole('tab', { name: tab }))
  fireEvent.click(await screen.findByRole('button', { name: buttonName }))
  fireEvent.click(await screen.findByRole('button', { name: /Savatga qo'shish/ }))
}

async function fillAndConfirm() {
  fireEvent.click(await screen.findByRole('button', { name: /Savat \(/ }))
  fireEvent.click(await screen.findByRole('button', { name: 'Buyurtma berish' }))
  fireEvent.change(await screen.findByLabelText('Manzil'), { target: { value: 'Chilonzor 5' } })
  fireEvent.change(screen.getByLabelText('Telefon'), { target: { value: '+998901234567' } })
  fireEvent.click(screen.getByRole('button', { name: 'Buyurtmani tasdiqlash' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  listCatalogFurniture.mockResolvedValue({ items: [FURNITURE], total: 1, page: 1, per_page: 100 })
  getMaterials.mockResolvedValue([MATERIAL])
  getOrder.mockImplementation(async (id: string) => orderOut(id.split('-')[0]))
})

describe('DokonPage checkout', () => {
  it('sends the order with delivery details and shows what the server answered', async () => {
    const placed = orderOut('Mebel Plus', {
      status: 'gathering', total_uzs: 4_500_000,
      lines: [{ id: 'l1', material_id: null, furniture_id: 'f1', product_name: 'Divan', unit: 'dona', unit_price_uzs: 4_500_000, quantity: 1 }],
    })
    createOrder.mockResolvedValue(placed)
    getOrder.mockResolvedValue(placed) // the refresh of the tracking screen
    mount()
    await addFromShop(/Divan, 4\s500\s000/)
    await fillAndConfirm()

    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1))
    expect(createOrder).toHaveBeenCalledWith({
      dealer_name: 'Mebel Plus',
      delivery_address: 'Chilonzor 5',
      phone: '+998901234567',
      payment_method: 'cash',
      lines: [{ material_id: null, furniture_id: 'f1', product_name: 'Divan', unit: 'dona', unit_price_uzs: 4_500_000, quantity: 1 }],
    })
    // The status shown is the server's, not an invented one.
    expect((await screen.findByText("Yig'ilmoqda")).closest('li')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText('Chilonzor 5')).toBeInTheDocument()
  })

  it('sends a catalog material with its id, so the server prices it', async () => {
    createOrder.mockResolvedValue(orderOut('Do\'kon'))
    mount()
    await addFromShop(/Akril bo'yoq, 45\s000/, 'Materiallar')
    await fillAndConfirm()

    await waitFor(() => expect(createOrder).toHaveBeenCalled())
    expect(createOrder.mock.calls[0][0].lines[0]).toMatchObject({ material_id: 'm1', furniture_id: null, unit: 'litr' })
  })

  it('keeps the cart and says why when the order is refused', async () => {
    createOrder.mockRejectedValue(new Error(JSON.stringify({ detail: "Noto'g'ri material ID." })))
    mount()
    await addFromShop(/Divan, 4\s500\s000/)
    await fillAndConfirm()

    expect(await screen.findByRole('alert')).toHaveTextContent("Noto'g'ri material ID.")
    fireEvent.click(screen.getByLabelText('Orqaga'))
    fireEvent.click(await screen.findByLabelText('Orqaga'))
    expect(await screen.findByRole('button', { name: /Savat \(1\)/ })).toBeInTheDocument()
  })
})
