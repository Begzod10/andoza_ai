import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DeleteAccountPage from './DeleteAccountPage'
import Footer from './landing/Footer'
import { applyLanguage } from '@/i18n'
import uz from '@/i18n/locales/uz.json'
import ru from '@/i18n/locales/ru.json'
import en from '@/i18n/locales/en.json'

const DELETE_ACCOUNT = { uz: uz.landing.deleteAccount, ru: ru.landing.deleteAccount, en: en.landing.deleteAccount }

afterEach(() => applyLanguage('uz'))

describe('delete account page', () => {
  it('explains the steps in Uzbek, links to login and switches language', () => {
    render(<MemoryRouter><DeleteAccountPage /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: "Hisobni o'chirish" })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(DELETE_ACCOUNT.uz.sections.length)
    expect(screen.getByRole('link', { name: 'Kirish' })).toHaveAttribute('href', '/login')

    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Delete account' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  })

  it('has the same sections in every language', () => {
    const n = DELETE_ACCOUNT.uz.sections.length
    expect(DELETE_ACCOUNT.ru.sections).toHaveLength(n)
    expect(DELETE_ACCOUNT.en.sections).toHaveLength(n)
  })

  it('is linked from the landing footer', () => {
    render(<MemoryRouter><Footer /></MemoryRouter>)
    expect(screen.getByRole('link', { name: "Hisobni o'chirish" })).toHaveAttribute('href', '/delete-account')
  })
})
