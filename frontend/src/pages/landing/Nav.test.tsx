import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { applyLanguage } from '@/i18n'
import ru from '@/i18n/locales/ru.json'
import Nav from './Nav'
import Hero from './Hero'

// The hero scrolls things into view; jsdom has no IntersectionObserver.
beforeAll(() => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(() => applyLanguage('uz'))

describe('landing header', () => {
  it('uses the shared language switcher and follows the visitor’s pick, <html lang> included', () => {
    render(<MemoryRouter><Nav /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Kirish' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Русский' }))
    expect(document.documentElement.lang).toBe('ru')
    expect(screen.getByRole('link', { name: ru.landing.nav.login })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(document.documentElement.lang).toBe('en')
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('leaves <html lang> to applyLanguage: unmounting does not touch it', () => {
    const view = render(<MemoryRouter><Nav /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Русский' }))
    view.unmount()
    expect(document.documentElement.lang).toBe('ru')
  })
})

describe('landing hero', () => {
  it('shows the main heading from ru.json when the language is Russian', () => {
    applyLanguage('ru')
    render(<MemoryRouter><Hero /></MemoryRouter>)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent(ru.landing.hero.title1)
    expect(h1).toHaveTextContent(ru.landing.hero.title2)
  })
})
