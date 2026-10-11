import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Pricing from './Pricing'
import { LanguageProvider, type Lang } from './i18n'

beforeEach(() => window.localStorage.clear())

function renderIn(lang: Lang) {
  window.localStorage.setItem('andoza.landing.lang', lang)
  render(<MemoryRouter><LanguageProvider><Pricing /></LanguageProvider></MemoryRouter>)
}

describe('landing pricing', () => {
  it('lets the free tier start, through login', () => {
    renderIn('uz')
    expect(screen.getByRole('link', { name: 'Boshlash' })).toHaveAttribute('href', '/login')
  })

  it('does not offer to start Pro, which is not out yet: one link only, and a disabled "Tez kunda"', () => {
    renderIn('uz')
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Tez kunda' })).toBeDisabled()
  })

  it.each([['ru', 'Скоро'], ['en', 'Coming soon']] as const)('says so in %s too', (lang, label) => {
    renderIn(lang)
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByRole('button', { name: label })).toBeDisabled()
  })
})
