import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PrivacyPage from './PrivacyPage'
import Footer from './landing/Footer'
import { applyLanguage } from '@/i18n'
import uz from '@/i18n/locales/uz.json'
import ru from '@/i18n/locales/ru.json'
import en from '@/i18n/locales/en.json'
import { PRIVACY_CONTACT, PRIVACY_UPDATED } from './landing/privacyContent'

const PRIVACY = { uz: uz.landing.privacy, ru: ru.landing.privacy, en: en.landing.privacy }

afterEach(() => applyLanguage('uz'))

describe('privacy policy page', () => {
  it('shows the policy in Uzbek and switches language', () => {
    render(<MemoryRouter><PrivacyPage /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: 'Maxfiylik siyosati' })).toBeInTheDocument()
    // the sections plus the contact block once a contact is set
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(PRIVACY.uz.sections.length + (PRIVACY_CONTACT ? 1 : 0))
    if (PRIVACY_CONTACT) expect(screen.getByText(PRIVACY_CONTACT)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument()
    expect(screen.getByText(/We do not ask for or collect your location/)).toBeInTheDocument()
  })

  it('shows the Firebase crash and usage note in every language', () => {
    render(<MemoryRouter><PrivacyPage /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 2, name: '10. Ilova statistikasi va xatolar' })).toBeInTheDocument()
    expect(screen.getByText(/Mobil ilova Google Firebase/)).toBeInTheDocument()
    expect(screen.getByText(/ichki hisob raqami \(ID\) va qurilma identifikatori/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Русский' }))
    expect(screen.getByRole('heading', { level: 2, name: '10. Статистика приложения и ошибки' })).toBeInTheDocument()
    expect(screen.getByText(/Мобильное приложение собирает через Google Firebase/)).toBeInTheDocument()
    expect(screen.getByText(/внутренним идентификатором аккаунта \(ID\) и идентификатором устройства/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(screen.getByRole('heading', { level: 2, name: '10. App statistics and errors' })).toBeInTheDocument()
    expect(screen.getByText(/The mobile app collects crash reports/)).toBeInTheDocument()
    expect(screen.getByText(/linked to an internal account ID and a device identifier/)).toBeInTheDocument()
  })

  it('never calls the Firebase data anonymous, and is dated for this change', () => {
    const firebase = (['uz', 'ru', 'en'] as const).map((l) => PRIVACY[l].sections.at(-1)!.body.join(' '))
    for (const text of firebase) expect(text).not.toMatch(/anonim|аноним|anonymous/i)
    expect(PRIVACY_UPDATED).toBe('2026-10-12')
  })

  it('has the same sections in every language', () => {
    const n = PRIVACY.uz.sections.length
    expect(PRIVACY.ru.sections).toHaveLength(n)
    expect(PRIVACY.en.sections).toHaveLength(n)
  })
})

describe('landing footer', () => {
  it('links to the privacy policy', () => {
    render(<MemoryRouter><Footer /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Maxfiylik siyosati' })).toHaveAttribute('href', '/privacy')
  })
})
