import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AdminOrders } from './AdminOrders'

const api = vi.hoisted(() => ({ listAdminOrders: vi.fn(), setAdminOrderStatus: vi.fn() }))
vi.mock('@/lib/api', () => ({
  listAdminOrders: (...a: unknown[]) => api.listAdminOrders(...a),
  setAdminOrderStatus: (...a: unknown[]) => api.setAdminOrderStatus(...a),
}))

const order = (over: Record<string, unknown> = {}) => ({
  id: 'aaaabbbb-0000-4000-8000-000000000001', user_id: 'u1', store_id: 's1', store_name: 'Mebel Plus', dealer_name: 'Mebel Plus',
  total_uzs: 4_500_000, status: 'accepted', delivery_address: 'Chilonzor 5', phone: '+998 90 123 45 67', payment_method: 'cash',
  cancelled_by: null, cancel_reason: null, created_at: '2026-10-08T08:00:00Z',
  lines: [{ id: 'l1', material_id: null, furniture_id: 'f1', product_name: 'Divan', unit: 'dona', unit_price_uzs: 4_500_000, quantity: 1 }],
  ...over,
})

function mount(onError = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><AdminOrders onError={onError} /></QueryClientProvider>)
  return { onError }
}

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset())
})

describe('AdminOrders', () => {
  it('lists orders with their shop, buyer details and lines', async () => {
    api.listAdminOrders.mockResolvedValue([order()])
    mount()
    expect(await screen.findByText(/Mebel Plus/)).toBeInTheDocument()
    expect(screen.getByText('Chilonzor 5')).toBeInTheDocument()
    expect(screen.getByText(/Divan/)).toBeInTheDocument()
    expect(api.listAdminOrders).toHaveBeenCalledWith(undefined)
  })

  it('says when an order belongs to no shop, since only an administrator can act on it', async () => {
    api.listAdminOrders.mockResolvedValue([order({ store_id: null, store_name: null, dealer_name: "Do'kon" })])
    mount()
    expect(await screen.findByText(/do'konsiz mahsulot/)).toBeInTheDocument()
  })

  it('asks the server for one stage when a filter is chosen', async () => {
    api.listAdminOrders.mockResolvedValue([])
    mount()
    await screen.findByText('Buyurtma topilmadi.')
    fireEvent.click(screen.getByRole('button', { name: 'Yo\'lda' }))
    await waitFor(() => expect(api.listAdminOrders).toHaveBeenLastCalledWith('on_the_way'))
  })

  it('moves an order to its next stage', async () => {
    api.listAdminOrders.mockResolvedValue([order()])
    api.setAdminOrderStatus.mockResolvedValue(order({ status: 'gathering' }))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: "Yig'ishni boshlash" }))
    await waitFor(() => expect(api.setAdminOrderStatus).toHaveBeenCalledWith('aaaabbbb-0000-4000-8000-000000000001', 'gathering'))
  })

  it('cancels with a reason', async () => {
    api.listAdminOrders.mockResolvedValue([order({ status: 'on_the_way' })])
    api.setAdminOrderStatus.mockResolvedValue(order({ status: 'cancelled' }))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Bekor qilish' }))
    const confirm = screen.getByRole('button', { name: 'Bekor qilishni tasdiqlash' })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Bekor qilish sababi'), { target: { value: "Yo'qolgan" } })
    fireEvent.click(confirm)
    await waitFor(() => expect(api.setAdminOrderStatus).toHaveBeenCalledWith('aaaabbbb-0000-4000-8000-000000000001', 'cancelled', "Yo'qolgan"))
  })

  it('cannot touch a delivered order and shows why a cancelled one was cancelled', async () => {
    api.listAdminOrders.mockResolvedValue([
      order({ status: 'delivered' }),
      order({ id: 'ccccdddd-0000-4000-8000-000000000002', status: 'cancelled', cancelled_by: 'buyer', cancel_reason: 'Fikrim o\'zgardi' }),
    ])
    mount()
    await screen.findByText(/Bekor qilgan: xaridor/)
    expect(screen.getByText(/Fikrim o'zgardi/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Bekor qilish' })).toBeNull()
  })

  it('reports a refusal to the page', async () => {
    api.listAdminOrders.mockResolvedValue([order()])
    api.setAdminOrderStatus.mockRejectedValue(new Error(JSON.stringify({ detail: 'Buyurtma topilmadi' })))
    const { onError } = mount()
    fireEvent.click(await screen.findByRole('button', { name: "Yig'ishni boshlash" }))
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Buyurtma topilmadi'))
  })
})
