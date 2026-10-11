import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LanguageProvider, useLang } from './i18n'

function Switcher() {
  const { setLang } = useLang()
  return (
    <>
      <button onClick={() => setLang('ru')}>ru</button>
      <button onClick={() => setLang('en')}>en</button>
    </>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.lang = 'uz'
})

describe('<html lang> on the landing', () => {
  it('starts with the stored language', () => {
    window.localStorage.setItem('andoza.landing.lang', 'en')
    render(<LanguageProvider><Switcher /></LanguageProvider>)
    expect(document.documentElement.lang).toBe('en')
  })

  it('follows the language the visitor picks', () => {
    render(<LanguageProvider><Switcher /></LanguageProvider>)
    expect(document.documentElement.lang).toBe('uz')
    fireEvent.click(screen.getByText('ru'))
    expect(document.documentElement.lang).toBe('ru')
    fireEvent.click(screen.getByText('en'))
    expect(document.documentElement.lang).toBe('en')
  })

  it('goes back to what it was when the landing is left (the app itself is Uzbek)', () => {
    const view = render(<LanguageProvider><Switcher /></LanguageProvider>)
    fireEvent.click(screen.getByText('ru'))
    view.unmount()
    expect(document.documentElement.lang).toBe('uz')
  })
})
