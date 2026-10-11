/**
 * On a phone the bottom bar is the only navigation, so every tab has to be in
 * it — Profil especially, which holds logout and account deletion.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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
