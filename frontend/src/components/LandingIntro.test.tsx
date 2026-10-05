import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { LandingIntro } from './LandingIntro'

describe('LandingIntro', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('plays the brand loader first, then fades it away and remembers it for the session', () => {
    render(<LandingIntro />)
    expect(screen.getByTestId('landing-intro')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'andoza.ai' })).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(2400) }) // past the hold, mid-fade
    expect(screen.getByTestId('landing-intro')).toHaveStyle({ opacity: '0' })

    act(() => { vi.advanceTimersByTime(600) })
    expect(screen.queryByTestId('landing-intro')).toBeNull()
    expect(sessionStorage.getItem('andoza:landing-intro-seen')).toBe('1')
  })

  it('does not replay within the same session', () => {
    sessionStorage.setItem('andoza:landing-intro-seen', '1')
    render(<LandingIntro />)
    expect(screen.queryByTestId('landing-intro')).toBeNull()
  })
})
