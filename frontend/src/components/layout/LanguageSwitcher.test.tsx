import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const updateMe = vi.fn()
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/api')
  return { ...actual, updateMe: (...a: unknown[]) => updateMe(...a) }
})

import { LanguageSwitcher } from './LanguageSwitcher'
import { useAuthStore } from '@/store/authStore'
import { applyLanguage, currentLanguage } from '@/i18n'

beforeEach(() => {
  updateMe.mockReset()
  updateMe.mockResolvedValue({})
  useAuthStore.setState({ user: null, isAuthenticated: false })
})
afterEach(() => applyLanguage('uz'))

describe('LanguageSwitcher', () => {
  it('names its group in the interface language', () => {
    const { unmount } = render(<LanguageSwitcher />)
    expect(screen.getByRole('group', { name: 'Til' })).toBeInTheDocument()
    unmount()
    applyLanguage('ru')
    render(<LanguageSwitcher />)
    expect(screen.getByRole('group', { name: 'Язык' })).toBeInTheDocument()
  })

  it('marks the active language with a fixed colour, not the --accent token the landing redefines', () => {
    render(<LanguageSwitcher />)
    const active = screen.getByRole('button', { name: "O'zbekcha" })
    expect(active.className).toContain('bg-brand')
    expect(active.className).not.toMatch(/accent/)
  })

  it('offers the three languages, each named in itself, with the current one marked', () => {
    render(<LanguageSwitcher />)
    expect(screen.getByRole('button', { name: "O'zbekcha" }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Русский' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'English' })).toBeTruthy()
  })

  it('switches the language and the browser memory, and does not call the server when signed out', () => {
    render(<LanguageSwitcher />)
    fireEvent.click(screen.getByRole('button', { name: 'Русский' }))
    expect(currentLanguage()).toBe('ru')
    expect(window.localStorage.getItem('andoza.lang')).toBe('ru')
    expect(updateMe).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Русский' }).getAttribute('aria-pressed')).toBe('true')
  })
})
