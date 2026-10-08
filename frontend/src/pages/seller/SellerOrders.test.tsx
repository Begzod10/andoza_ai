import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SellerOrders } from './SellerOrders'

const api = vi.hoisted(() => ({ listMyOrders: vi.fn(), advanceMyOrder: vi.fn(), cancelMyOrder: vi.fn() }))
vi.mock('@/lib/api', () => ({
  listMyOrders: (...a: unknown[]) => api.listMyOrders(...a),
  advanceMyOrder: (...a: unknown[]) => api.advanceMyOrder(...a),
  cancelMyOrder: (...a: unknown[]) => api.cancelMyOrder(...a),
}))

const order = (over: Record<string, unknown> = {}) => ({
  id: 'aaaabbbb-0000-0000-0000-000000000000', dealer_name: 'Mebel Plus', total_uzs: 4_500_000, status: 'accepted',
  delivery_address: 'Chilonzor 5, 12-uy', phone: '+998 90 123 45 67', payment_method: 'cash',
  created_at: '2026-10-08T08:00:00Z',
  lines: [{ id: 'l1', material_id: null, furniture_id: 'f1', product_name: 'Divan', unit: 'dona', unit_price_uzs: 4_500_000, quantity: 1 }],
  ...over,
})

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><SellerOrders /></QueryClientProvider>)
}

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset())
})

describe('SellerOrders', () => {
  it('lists an order with where to bring it and what is in it', async () => {
    api.listMyOrders.mockResolvedValue([order()])
    mount()
    expect(await screen.findByText('Chilonzor 5, 12-uy')).toBeInTheDocument()
    expect(screen.getByText('+998 90 123 45 67')).toBeInTheDocument()
    expect(screen.getByText(/Naqd pul/)).toBeInTheDocument()
    expect(screen.getByText(/\d{2}\.\d{2}\.2026 \d{2}:\d{2}/)).toBeInTheDocument()
    expect(screen.getByText(/Divan/)).toBeInTheDocument()
    expect(screen.getByText('Qabul qilindi')).toBeInTheDocument()
    expect(screen.getByText('№ AAAABBBB')).toBeInTheDocument()
  })

  it('says so when there are no orders yet', async () => {
    api.listMyOrders.mockResolvedValue([])
    mount()
    expect(await screen.findByText("Hali buyurtma yo'q.")).toBeInTheDocument()
  })

  it('moves an order to its next stage and shows the new one', async () => {
    api.listMyOrders.mockResolvedValue([order()])
    api.advanceMyOrder.mockResolvedValue(order({ status: 'gathering' }))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: "Yig'ishni boshlash" }))
    await waitFor(() => expect(api.advanceMyOrder).toHaveBeenCalledWith('aaaabbbb-0000-0000-0000-000000000000', 'gathering'))
    expect(await screen.findByRole('button', { name: "Yo'lga chiqarish" })).toBeInTheDocument()
    expect(screen.getByText("Yig'ilmoqda")).toBeInTheDocument()
  })

  it.each([
    ['gathering', "Yo'lga chiqarish", 'on_the_way'],
    ['on_the_way', 'Yetkazildi deb belgilash', 'delivered'],
  ])('offers the right action at stage %s', async (status, label, target) => {
    api.listMyOrders.mockResolvedValue([order({ status })])
    api.advanceMyOrder.mockResolvedValue(order({ status: target }))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: label }))
    await waitFor(() => expect(api.advanceMyOrder).toHaveBeenCalledWith(expect.any(String), target))
  })

  it('has no action for a delivered order', async () => {
    api.listMyOrders.mockResolvedValue([order({ status: 'delivered' })])
    mount()
    expect(await screen.findByText('Buyurtma yetkazildi')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Yig'ish|Yo'lga|deb belgilash/ })).toBeNull()
  })

  it("shows the server's reason when the change is refused", async () => {
    api.listMyOrders.mockResolvedValue([order()])
    api.advanceMyOrder.mockRejectedValue(new Error(JSON.stringify({ detail: "Buyurtma holatini faqat keyingi bosqichga o'tkazish mumkin." })))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: "Yig'ishni boshlash" }))
    expect(await screen.findByRole('alert')).toHaveTextContent('faqat keyingi bosqichga')
  })

  it('reports a list that could not be loaded, not an empty one', async () => {
    api.listMyOrders.mockRejectedValue(new Error('Failed to fetch'))
    mount()
    expect(await screen.findByText(/yuklab bo'lmadi|Failed to fetch/)).toBeInTheDocument()
    expect(screen.queryByText("Hali buyurtma yo'q.")).toBeNull()
  })
})


describe('SellerOrders: cancelling', () => {
  it('asks for a reason, and sends it with the cancel', async () => {
    api.listMyOrders.mockResolvedValue([order()])
    api.cancelMyOrder.mockResolvedValue(order({ status: 'cancelled', cancelled_by: 'seller', cancel_reason: 'Omborda tugagan' }))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Buyurtmani bekor qilish' }))
    const confirm = screen.getByRole('button', { name: 'Bekor qilishni tasdiqlash' })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/sababi/), { target: { value: 'Omborda tugagan' } })
    fireEvent.click(confirm)
    await waitFor(() => expect(api.cancelMyOrder).toHaveBeenCalledWith('aaaabbbb-0000-0000-0000-000000000000', 'Omborda tugagan'))
    expect(await screen.findByText('Bekor qilingan')).toBeInTheDocument()
    expect(screen.getByText(/Omborda tugagan/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: "Yig'ishni boshlash" })).toBeNull()
  })

  it('can back out without cancelling', async () => {
    api.listMyOrders.mockResolvedValue([order()])
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Buyurtmani bekor qilish' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ortga' }))
    expect(screen.getByRole('button', { name: "Yig'ishni boshlash" })).toBeInTheDocument()
    expect(api.cancelMyOrder).not.toHaveBeenCalled()
  })

  it('does not offer cancelling once the order is on its way', async () => {
    api.listMyOrders.mockResolvedValue([order({ status: 'on_the_way' })])
    mount()
    await screen.findByRole('button', { name: 'Yetkazildi deb belgilash' })
    expect(screen.queryByRole('button', { name: 'Buyurtmani bekor qilish' })).toBeNull()
  })

  it("shows the server's reason when it refuses", async () => {
    api.listMyOrders.mockResolvedValue([order()])
    api.cancelMyOrder.mockRejectedValue(new Error(JSON.stringify({ detail: "Bu bosqichda buyurtmani bekor qilib bo'lmaydi." })))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Buyurtmani bekor qilish' }))
    fireEvent.change(screen.getByLabelText(/sababi/), { target: { value: 'Sabab bor' } })
    fireEvent.click(screen.getByRole('button', { name: 'Bekor qilishni tasdiqlash' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("bekor qilib bo'lmaydi")
  })
})


describe('SellerOrders: new orders', () => {
  it('marks an order nobody has started on as new, and counts them in the tab title', async () => {
    document.title = 'andoza.ai'
    api.listMyOrders.mockResolvedValue([order(), order({ id: 'bbbbcccc-0000-0000-0000-000000000001', status: 'gathering' })])
    mount()
    expect(await screen.findAllByText('Yangi')).toHaveLength(1)
    await waitFor(() => expect(document.title).toBe('(1) andoza.ai'))
  })

  it('leaves the tab title alone when nothing is new', async () => {
    document.title = 'andoza.ai'
    api.listMyOrders.mockResolvedValue([order({ status: 'delivered' })])
    mount()
    await screen.findByText('Buyurtma yetkazildi')
    expect(document.title).toBe('andoza.ai')
    expect(screen.queryByText('Yangi')).toBeNull()
  })
})
