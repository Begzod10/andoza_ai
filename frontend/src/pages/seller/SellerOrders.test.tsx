import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SellerOrders } from './SellerOrders'

const api = vi.hoisted(() => ({ listMyOrders: vi.fn(), advanceMyOrder: vi.fn() }))
vi.mock('@/lib/api', () => ({
  listMyOrders: (...a: unknown[]) => api.listMyOrders(...a),
  advanceMyOrder: (...a: unknown[]) => api.advanceMyOrder(...a),
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

beforeEach(() => Object.values(api).forEach((f) => f.mockReset()))

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
