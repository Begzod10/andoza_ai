import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { S3_ProductDetail, S5_Cart, S6_Payment, S7_OrderTracking } from './screens'

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
    render(<S6_Payment subtotal={2000} deliveryFee={500} itemCount={1} onSubmit={onSubmit} onBack={noop} />)
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

describe('S7_OrderTracking', () => {
  const props = {
    orderId: 'ORD-1', orderDate: '08.10.2026', expectedDelivery: '11.10.2026',
    courierName: 'Bobur', courierPhone: '+998 90 123 45 67', courierMessage: '@courier_bot',
    items: [{ name: 'Qum', quantity: 3, price: 95000 }], total: 285000, onBack: noop,
  }

  it('marks the current stage and lists what was ordered', () => {
    render(<S7_OrderTracking {...props} status="on_the_way" />)
    expect(screen.getByText("Yo'lda").closest('li')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText("Qabul qilindi").closest('li')).not.toHaveAttribute('aria-current')
    expect(screen.getByText('Qum')).toBeInTheDocument()
  })

  it('starts at the first stage for an unknown status', () => {
    render(<S7_OrderTracking {...props} status="???" />)
    expect(screen.getByText('Qabul qilindi').closest('li')).toHaveAttribute('aria-current', 'step')
  })
})
