import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StoreContactLinks } from './StoreContactLinks'

describe('StoreContactLinks', () => {
  it('renders a call link and a Telegram link that opens in a new tab safely', () => {
    render(<StoreContactLinks store={{ phone: '+998 90 123 45 67', telegram: '@mebelplus' }} />)
    expect(screen.getByRole('link', { name: /Qo'ng'iroq qilish/ })).toHaveAttribute('href', 'tel:+998901234567')
    const tg = screen.getByRole('link', { name: /Telegramda yozish/ })
    expect(tg).toHaveAttribute('href', 'https://t.me/mebelplus')
    expect(tg).toHaveAttribute('target', '_blank')
    expect(tg.getAttribute('rel')).toContain('noopener')
  })

  it('renders nothing when the shop has no usable contact', () => {
    const { container } = render(<StoreContactLinks store={{ phone: null, telegram: 'javascript:alert(1)' }} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for a model with no shop', () => {
    const { container } = render(<StoreContactLinks store={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
