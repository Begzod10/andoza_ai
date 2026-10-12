/**
 * The checkout places real orders: one per shop, with the delivery details, and
 * the cart only loses what was actually ordered.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FeedbackProvider } from '@/components/ui/FeedbackProvider'
import DokonPage from './DokonPage'

const listCatalogFurniture = vi.fn()
const getMaterials = vi.fn()
const createOrder = vi.fn()
const getOrder = vi.fn()
const listOrders = vi.fn()
const cancelOrder = vi.fn()
vi.mock('@/lib/api', () => ({
  listCatalogFurniture: (...a: unknown[]) => listCatalogFurniture(...a),
  getMaterials: (...a: unknown[]) => getMaterials(...a),
  createOrder: (...a: unknown[]) => createOrder(...a),
  getOrder: (...a: unknown[]) => getOrder(...a),
  listOrders: (...a: unknown[]) => listOrders(...a),
  cancelOrder: (...a: unknown[]) => cancelOrder(...a),
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
  return render(<QueryClientProvider client={client}><FeedbackProvider><DokonPage /></FeedbackProvider></QueryClientProvider>)
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

describe('DokonPage checkout by shop', () => {
  it('sends one order per shop, even when two shops share a name', async () => {
    const twin = { ...FURNITURE, id: 'f2', name_uz: 'Stol', price_uzs: 1_000_000, store_id: 's9' } // same store_name, other shop
    listCatalogFurniture.mockResolvedValue({ items: [FURNITURE, twin], total: 2, page: 1, per_page: 100 })
    createOrder.mockImplementation(async (o: { dealer_name: string }) => orderOut(o.dealer_name, { id: `${Math.random()}-x` }))
    mount()
    await addFromShop(/Divan, 4\s500\s000/)
    await addFromShop(/Stol, 1\s000\s000/)
    await fillAndConfirm()

    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(2))
    const lineCounts = createOrder.mock.calls.map((c) => c[0].lines.length)
    expect(lineCounts).toEqual([1, 1])
  })
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


describe('DokonPage: my orders', () => {
  const mine = (over: object = {}) => orderOut('Mebel Plus', {
    id: 'aaaabbbb-0000-0000-0000-000000000001', total_uzs: 4_500_000,
    lines: [{ id: 'l1', material_id: null, furniture_id: 'f1', product_name: 'Divan', unit: 'dona', unit_price_uzs: 4_500_000, quantity: 1 }],
    ...over,
  })

  it('lists earlier orders and opens one', async () => {
    listOrders.mockResolvedValue([mine({ status: 'gathering' })])
    getOrder.mockResolvedValue(mine({ status: 'gathering' }))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /Buyurtmalarim/ }))
    fireEvent.click(await screen.findByRole('button', { name: /AAAABBBB/ }))
    expect((await screen.findByText("Yig'ilmoqda")).closest('li')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText('Divan', { exact: false })).toBeInTheDocument()
  })

  it('cancels an order the shop has not started, after confirming', async () => {
    listOrders.mockResolvedValue([mine()])
    getOrder.mockResolvedValue(mine())
    cancelOrder.mockResolvedValue(mine({ status: 'cancelled', cancelled_by: 'buyer', cancel_reason: 'Xaridor bekor qildi' }))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /Buyurtmalarim/ }))
    fireEvent.click(await screen.findByRole('button', { name: /AAAABBBB/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Buyurtmani bekor qilish' }))
    const dialog = await screen.findByRole('dialog', { name: 'Buyurtmani bekor qilasizmi?' })
    expect(cancelOrder).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bekor qilish' }))
    await waitFor(() => expect(cancelOrder).toHaveBeenCalledWith('aaaabbbb-0000-0000-0000-000000000001'))
    expect(await screen.findByText('Buyurtma bekor qilindi')).toBeInTheDocument()
  })

  it('does nothing when the user declines the confirmation', async () => {
    listOrders.mockResolvedValue([mine()])
    getOrder.mockResolvedValue(mine())
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /Buyurtmalarim/ }))
    fireEvent.click(await screen.findByRole('button', { name: /AAAABBBB/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Buyurtmani bekor qilish' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Qoldirish' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(cancelOrder).not.toHaveBeenCalled()
  })

  it('shows why a cancel was refused, and where the order stands now', async () => {
    listOrders.mockResolvedValue([mine()])
    getOrder.mockResolvedValue(mine())
    cancelOrder.mockRejectedValue(new Error(JSON.stringify({ detail: "Bu bosqichda buyurtmani bekor qilib bo'lmaydi." })))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /Buyurtmalarim/ }))
    fireEvent.click(await screen.findByRole('button', { name: /AAAABBBB/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Buyurtmani bekor qilish' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Bekor qilish' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("bekor qilib bo'lmaydi")
  })
})


describe('DokonPage: many orders', () => {
  const some = (n: number, from = 0) => Array.from({ length: n }, (_, i) => orderOut('Mebel Plus', {
    id: `${String(from + i).padStart(8, '0')}-0000-0000-0000-000000000000`, total_uzs: 1000,
    lines: [{ id: `l${from + i}`, material_id: null, furniture_id: 'f1', product_name: 'Divan', unit: 'dona', unit_price_uzs: 1000, quantity: 1 }],
  }))

  it('loads a further page when asked', async () => {
    listOrders.mockResolvedValueOnce(some(50)).mockResolvedValueOnce(some(2, 50))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /Buyurtmalarim/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Yana yuklash' }))
    await waitFor(() => expect(listOrders).toHaveBeenLastCalledWith(2))
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Buyurtma [0-9A-F]{8}/ })).toHaveLength(52))
    expect(screen.queryByRole('button', { name: 'Yana yuklash' })).toBeNull()
  })
})

describe('product detail', () => {
  it('gives a piece of furniture its size in centimetres', async () => {
    // footprint_w/d and height_cm are centimetres (models/furniture.py): a
    // 241 cm sofa used to read "241 × 63 m".
    listCatalogFurniture.mockResolvedValue({
      items: [{ ...FURNITURE, footprint_w: 241, footprint_d: 63, height_cm: 85 }], total: 1, page: 1, per_page: 100,
    })
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /Divan, 4\s500\s000/ }))
    expect(await screen.findByText('241 × 63 × 85 sm')).toBeInTheDocument()
  })
})

describe('material pictures and names', () => {
  // Materials carry image_url, but their cards and detail page always drew a
  // placeholder, and the detail page showed the raw category key ("boyoq").
  const pictured = { ...MATERIAL, image_url: 'https://cdn.example/akril.jpg' }

  it('shows the picture on the card and on the detail page, with a readable category', async () => {
    getMaterials.mockResolvedValue([pictured])
    const { container } = mount()
    fireEvent.click(await screen.findByRole('tab', { name: 'Materiallar' }))
    const card = await screen.findByRole('button', { name: /Akril bo'yoq/ })
    expect(card.querySelector('img')?.getAttribute('src')).toBe(pictured.image_url)

    fireEvent.click(card)
    await screen.findByRole('button', { name: /Savatga qo'shish/ })
    expect(container.querySelector(`img[src="${pictured.image_url}"]`)).not.toBeNull()
    expect(screen.getByText("Bo'yoq")).toBeInTheDocument()
    expect(screen.queryByText('boyoq')).toBeNull()
  })
})

describe('shop browsing', () => {
  it('comes back to the same tab and search after adding to the cart', async () => {
    // Adding a product used to reset the shop to the Mebel tab with an empty
    // search, so a shopper picking several materials started over each time.
    mount()
    fireEvent.click(await screen.findByRole('tab', { name: 'Materiallar' }))
    fireEvent.change(screen.getByLabelText('Qidirish'), { target: { value: 'akril' } })
    fireEvent.click(await screen.findByRole('button', { name: /Akril bo'yoq/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Savatga qo'shish/ }))

    expect(await screen.findByRole('tab', { name: 'Materiallar', selected: true })).toBeInTheDocument()
    expect((screen.getByLabelText('Qidirish') as HTMLInputElement).value).toBe('akril')
  })
})
