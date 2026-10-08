import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { S3_ProductDetail, S5_Cart, S6_Payment, S7_OrderTracking, S8_MyOrders } from './screens'

const noop = () => {}

describe('S3_ProductDetail', () => {
  const base = { id: 'p1', name: 'Divan', images: [], specs: [{ label: 'Kategoriya', value: 'divan' }], dealers: [], description: '', onBack: noop }

  it('adds the chosen quantity to the cart', () => {
    const onAddToCart = vi.fn()
    render(<S3_ProductDetail {...base} price={4_500_000} onAddToCart={onAddToCart} />)
    fireEvent.click(screen.getByLabelText('Ko\'paytirish'))
    fireEvent.click(screen.getByRole('button', { name: /Savatga qo'shish/ }))
    expect(onAddToCart).toHaveBeenCalledWith('p1', 2)
  })

  it('asks for a price when the shop set none, and keeps the quantity at 1 or more', () => {
    render(<S3_ProductDetail {...base} price={null} onAddToCart={noop} />)
    expect(screen.getByText("Narx so'rang")).toBeInTheDocument()
    expect(screen.getByLabelText('Kamaytirish')).toBeDisabled()
  })

  it('does not let an unpriced product into the cart', () => {
    const onAddToCart = vi.fn()
    render(<S3_ProductDetail {...base} price={null} onAddToCart={onAddToCart} />)
    const add = screen.getByRole('button', { name: /Savatga qo'shish/ })
    expect(add).toBeDisabled()
    fireEvent.click(add)
    expect(onAddToCart).not.toHaveBeenCalled()
  })
})

describe('S5_Cart', () => {
  const items = [{ id: 'a', name: 'Bo\'yoq', price: 1000, quantity: 2, dealer: 'Yashil Savdo', unit: 'litr' }]

  it('shows an empty cart with a way back', () => {
    const onBack = vi.fn()
    render(<S5_Cart items={[]} onUpdateQuantity={noop} onRemove={noop} onCheckout={noop} onBack={onBack} />)
    expect(screen.getByText("Savat bo'sh")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: "Do'konga qaytish" }))
    expect(onBack).toHaveBeenCalled()
  })

  it('totals the lines and passes quantity changes, removal and checkout through', () => {
    const onUpdateQuantity = vi.fn(), onRemove = vi.fn(), onCheckout = vi.fn()
    render(<S5_Cart items={items} onUpdateQuantity={onUpdateQuantity} onRemove={onRemove} onCheckout={onCheckout} onBack={noop} />)
    expect(screen.getAllByText(/2\s?000/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByLabelText("Ko'paytirish"))
    expect(onUpdateQuantity).toHaveBeenCalledWith('a', 3)
    fireEvent.click(screen.getByLabelText(/olib tashlash/))
    expect(onRemove).toHaveBeenCalledWith('a')
    fireEvent.click(screen.getByRole('button', { name: 'Buyurtma berish' }))
    expect(onCheckout).toHaveBeenCalled()
  })
})

describe('S6_Payment', () => {
  it('cannot be confirmed until an address and phone are given, then submits them', () => {
    const onSubmit = vi.fn()
    render(<S6_Payment subtotal={2000} itemCount={1} onSubmit={onSubmit} onBack={noop} />)
    const confirm = screen.getByRole('button', { name: 'Buyurtmani tasdiqlash' })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Manzil'), { target: { value: 'Chilonzor 5' } })
    fireEvent.change(screen.getByLabelText('Telefon'), { target: { value: '+998901234567' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Karta' }))
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)
    expect(onSubmit).toHaveBeenCalledWith({ address: 'Chilonzor 5', phone: '+998901234567', paymentMethod: 'card' })
  })
})

describe('S6_Payment (real totals and failures)', () => {
  it('invents no delivery price: it says it is agreed with the shop and totals only the goods', () => {
    render(<S6_Payment subtotal={2000} itemCount={1} onSubmit={noop} onBack={noop} />)
    expect(screen.getByText(/do'kon bilan kelishiladi/)).toBeInTheDocument()
    expect(screen.queryByText('Yetkazish')).toBeNull()
  })

  it('shows a known delivery fee in the total', () => {
    render(<S6_Payment subtotal={2000} deliveryFee={500} itemCount={1} onSubmit={noop} onBack={noop} />)
    expect(screen.getByText('Yetkazish')).toBeInTheDocument()
    expect(screen.getAllByText(/2\s500/).length).toBeGreaterThan(0)
  })

  it('shows why an order failed, and blocks a second tap while one is being sent', () => {
    render(<S6_Payment subtotal={2000} itemCount={1} onSubmit={noop} onBack={noop} submitting error="Noto'g'ri material ID." />)
    expect(screen.getByRole('alert')).toHaveTextContent("Noto'g'ri material ID.")
    fireEvent.change(screen.getByLabelText('Manzil'), { target: { value: 'x' } })
    fireEvent.change(screen.getByLabelText('Telefon'), { target: { value: '1' } })
    expect(screen.getByRole('button', { name: /Buyurtmani tasdiqlash/ })).toBeDisabled()
  })
})

describe('S7_OrderTracking', () => {
  const props = {
    orderId: 'ORD-1', orderDate: '08.10.2026',
    items: [{ name: 'Qum', quantity: 3, price: 95000 }], total: 285000, onBack: noop,
  }

  it('marks the current stage and lists what was ordered', () => {
    render(<S7_OrderTracking {...props} status="on_the_way" />)
    expect(screen.getByText("Yo'lda").closest('li')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText("Qabul qilindi").closest('li')).not.toHaveAttribute('aria-current')
    expect(screen.getByText('Qum')).toBeInTheDocument()
  })

  it('shows the delivery details the server holds, and nothing it does not', () => {
    const { rerender } = render(
      <S7_OrderTracking {...props} status="accepted" dealerName="Mebel Plus" address="Chilonzor 5" phone="+998 90 111 22 33" paymentMethod="card" />,
    )
    expect(screen.getByText('Chilonzor 5')).toBeInTheDocument()
    expect(screen.getByText('Mebel Plus')).toBeInTheDocument()
    expect(screen.getByText('Karta')).toBeInTheDocument()
    rerender(<S7_OrderTracking {...props} status="accepted" />)
    expect(screen.queryByText('Manzil')).toBeNull()
    expect(screen.queryByText(/kuryer/i)).toBeNull()
  })

  it('starts at the first stage for an unknown status', () => {
    render(<S7_OrderTracking {...props} status="???" />)
    expect(screen.getByText('Qabul qilindi').closest('li')).toHaveAttribute('aria-current', 'step')
  })
})


describe('S7_OrderTracking: cancelling', () => {
  const base = { orderId: '№ 1', orderDate: '08.10.2026', items: [{ name: 'Qum', quantity: 3, price: 95000 }], total: 285000, onBack: noop }

  it('offers to cancel while the shop has not started, and only then', () => {
    const onCancel = vi.fn()
    const { rerender } = render(<S7_OrderTracking {...base} status="accepted" onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Buyurtmani bekor qilish' }))
    expect(onCancel).toHaveBeenCalled()
    rerender(<S7_OrderTracking {...base} status="gathering" onCancel={onCancel} />)
    expect(screen.queryByRole('button', { name: 'Buyurtmani bekor qilish' })).toBeNull()
    expect(screen.getByText(/do'kon bilan bog'laning/)).toBeInTheDocument()
  })

  it('does not offer it where no cancel handler is given (a shop or admin view)', () => {
    render(<S7_OrderTracking {...base} status="accepted" />)
    expect(screen.queryByRole('button', { name: 'Buyurtmani bekor qilish' })).toBeNull()
  })

  it('shows who cancelled and why, instead of the stages', () => {
    render(<S7_OrderTracking {...base} status="cancelled" cancelledBy="seller" cancelReason="Omborda qolmadi" onCancel={noop} />)
    expect(screen.getByRole('status')).toHaveTextContent('Buyurtma bekor qilindi')
    expect(screen.getByText(/do'kon/)).toBeInTheDocument()
    expect(screen.getByText(/Omborda qolmadi/)).toBeInTheDocument()
    expect(screen.queryByText("Yig'ilmoqda")).toBeNull()
    expect(screen.queryByRole('button', { name: 'Buyurtmani bekor qilish' })).toBeNull()
  })

  it('says why a cancel failed', () => {
    render(<S7_OrderTracking {...base} status="accepted" onCancel={noop} cancelError="Bu bosqichda buyurtmani bekor qilib bo'lmaydi." />)
    expect(screen.getByRole('alert')).toHaveTextContent("bekor qilib bo'lmaydi")
  })
})

describe('S8_MyOrders', () => {
  const orders = [
    { id: 'aaaabbbb-0000-0000-0000-000000000001', dealer_name: 'Mebel Plus', total_uzs: 4_500_000, status: 'gathering', created_at: '2026-10-08T08:00:00Z', lines: [{ product_name: 'Divan' }] },
    { id: 'ccccdddd-0000-0000-0000-000000000002', dealer_name: 'Stol Markazi', total_uzs: 900_000, status: 'cancelled', created_at: '2026-10-07T08:00:00Z', lines: [{ product_name: 'Stol' }, { product_name: 'Stul' }] },
  ]

  it('lists the orders with their stage, and opens one', () => {
    const onOpen = vi.fn()
    render(<S8_MyOrders orders={orders} loading={false} error={null} onOpen={onOpen} onBack={noop} />)
    expect(screen.getByText("Yig'ilmoqda")).toBeInTheDocument()
    expect(screen.getByText('Bekor qilindi')).toBeInTheDocument()
    expect(screen.getByText('Stol, Stul')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /AAAABBBB/ }))
    expect(onOpen).toHaveBeenCalledWith('aaaabbbb-0000-0000-0000-000000000001')
  })

  it('says there are none yet, and offers the way back', () => {
    const onBack = vi.fn()
    render(<S8_MyOrders orders={[]} loading={false} error={null} onOpen={noop} onBack={onBack} />)
    expect(screen.getByText("Hali buyurtma yo'q")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: "Do'konga qaytish" }))
    expect(onBack).toHaveBeenCalled()
  })

  it('reports a list that could not be loaded rather than an empty one', () => {
    render(<S8_MyOrders orders={undefined} loading={false} error="Server javob bermadi" onOpen={noop} onBack={noop} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Server javob bermadi')
    expect(screen.queryByText("Hali buyurtma yo'q")).toBeNull()
  })
})
