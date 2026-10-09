import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DeleteAccountPage from './DeleteAccountPage'
import Footer from './landing/Footer'
import { LanguageProvider } from './landing/i18n'
import { DELETE_ACCOUNT } from './landing/deleteAccountContent'

beforeEach(() => window.localStorage.clear())

describe('delete account page', () => {
  it('explains the steps in Uzbek, links to login and switches language', () => {
    render(<MemoryRouter><DeleteAccountPage /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: "Hisobni o'chirish" })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(DELETE_ACCOUNT.uz.sections.length)
    expect(screen.getByRole('link', { name: 'Kirish' })).toHaveAttribute('href', '/login')

    fireEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Delete account' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  })

  it('has the same sections in every language', () => {
    const n = DELETE_ACCOUNT.uz.sections.length
    expect(DELETE_ACCOUNT.ru.sections).toHaveLength(n)
    expect(DELETE_ACCOUNT.en.sections).toHaveLength(n)
  })

  it('is linked from the landing footer', () => {
    render(<MemoryRouter><LanguageProvider><Footer /></LanguageProvider></MemoryRouter>)
    expect(screen.getByRole('link', { name: "Hisobni o'chirish" })).toHaveAttribute('href', '/delete-account')
  })
})
