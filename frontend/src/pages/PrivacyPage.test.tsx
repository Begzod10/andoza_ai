import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PrivacyPage from './PrivacyPage'
import Footer from './landing/Footer'
import { LanguageProvider } from './landing/i18n'
import { PRIVACY, PRIVACY_CONTACT } from './landing/privacyContent'

beforeEach(() => window.localStorage.clear())

describe('privacy policy page', () => {
  it('shows the policy in Uzbek and switches language', () => {
    render(<MemoryRouter><PrivacyPage /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: 'Maxfiylik siyosati' })).toBeInTheDocument()
    // the sections, plus the contact block once a contact is set
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(PRIVACY.uz.sections.length + (PRIVACY_CONTACT ? 1 : 0))
    if (PRIVACY_CONTACT) expect(screen.getByText(PRIVACY_CONTACT)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument()
    expect(screen.getByText(/We do not ask for or collect your location/)).toBeInTheDocument()
  })

  it('has the same sections in every language', () => {
    const n = PRIVACY.uz.sections.length
    expect(PRIVACY.ru.sections).toHaveLength(n)
    expect(PRIVACY.en.sections).toHaveLength(n)
  })
})

describe('landing footer', () => {
  it('links to the privacy policy', () => {
    render(<MemoryRouter><LanguageProvider><Footer /></LanguageProvider></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Maxfiylik siyosati' })).toHaveAttribute('href', '/privacy')
  })
})
