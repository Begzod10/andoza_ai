/**
 * On a phone the bottom bar is the only navigation, so every tab has to be in
 * it — Profil especially, which holds logout and account deletion.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from './AppShell'

describe('AppShell phone bottom bar', () => {
  it('has Uy, Do\'kon, Ustalar and Profil next to the new-project button', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/projects']}>
          <AppShell />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const bar = screen.getByRole('navigation', { name: 'Asosiy navigatsiya' })
    const links = within(bar).getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(links).toEqual(['/projects', '/dokon', '/ustalar', '/profile'])
    expect(within(bar).getByRole('button', { name: "Yangi loyiha qo'shish" })).toBeTruthy()
  })
})

function mountShell() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/projects']}>
        <AppShell />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: "Yangi loyiha qo'shish" }))
}

describe('AppShell new-project sheet', () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).Capacitor
  })

  it('is drawn in the app theme, not a white sheet over a dark app', () => {
    mountShell()
    const sheet = screen.getByRole('heading', { name: 'Yangi loyiha' }).closest('.fixed') as HTMLElement
    expect(sheet.className).toContain('bg-card')
    expect(sheet.className).not.toContain('bg-white')
  })

  it('offers no 360° scan (that page never used the camera)', () => {
    mountShell()
    expect(screen.getByText('Razmer / Plan yuklash')).toBeTruthy()
    expect(screen.queryByText(/360°/)).toBeNull()
  })

  it('hides LiDAR on the plain web', () => {
    mountShell()
    expect(screen.queryByText('LiDAR skaner')).toBeNull()
  })

  it('offers LiDAR when the native scanner is there', () => {
    ;(window as unknown as Record<string, unknown>).Capacitor = { Plugins: { RoomScanPlugin: {} } }
    mountShell()
    expect(screen.getByText('LiDAR skaner')).toBeTruthy()
  })
})
