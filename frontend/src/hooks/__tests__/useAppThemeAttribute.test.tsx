import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAppThemeAttribute } from '../useAppThemeAttribute'
import { useThemeStore } from '@/store/themeStore'

/**
 * Pages outside AppShell (Studio, Smeta, wizard, login, share) must still put
 * the chosen day/night theme on <html>, or a direct link opens them in day mode.
 */
describe('useAppThemeAttribute', () => {
  beforeEach(() => document.documentElement.removeAttribute('data-app-theme'))

  it('puts the current theme on <html>', () => {
    useThemeStore.setState({ theme: 'night' })
    renderHook(() => useAppThemeAttribute())
    expect(document.documentElement.getAttribute('data-app-theme')).toBe('night')
  })

  it('follows theme changes', () => {
    useThemeStore.setState({ theme: 'day' })
    renderHook(() => useAppThemeAttribute())
    act(() => useThemeStore.setState({ theme: 'night' }))
    expect(document.documentElement.getAttribute('data-app-theme')).toBe('night')
  })
})
