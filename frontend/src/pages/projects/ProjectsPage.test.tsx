/**
 * A list that could not be loaded is not an empty list.
 *
 * With the server unreachable the page used to render "Hali loyiha yo'q" —
 * telling a user whose projects are sitting safely in the database that they
 * have none.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ProjectsPage from './ProjectsPage'
import * as api from '@/lib/api'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof api>('@/lib/api')
  return { ...actual, getApartments: vi.fn(), createApartment: vi.fn() }
})

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><ProjectsPage /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ProjectsPage when the server is unreachable', () => {
  beforeEach(() => vi.clearAllMocks())

  it('says the list failed to load, not that there are no projects', async () => {
    vi.mocked(api.getApartments).mockRejectedValue(new Error('Failed to fetch'))
    mount()
    await waitFor(() => expect(screen.getByText(/yuklanmadi/i)).toBeInTheDocument())
    expect(screen.queryByText(/Hali loyiha yo'q/)).toBeNull()
  })

  it('offers another go', async () => {
    vi.mocked(api.getApartments).mockRejectedValue(new Error('Failed to fetch'))
    mount()
    await waitFor(() => expect(screen.getByText(/Qayta urinish/i)).toBeInTheDocument())
  })

  it('still says "no projects" for an account that genuinely has none', async () => {
    vi.mocked(api.getApartments).mockResolvedValue([])
    mount()
    await waitFor(() => expect(screen.getByText(/Hali loyiha yo'q/)).toBeInTheDocument())
    expect(screen.queryByText(/yuklanmadi/i)).toBeNull()
  })

  it('lists what it did load', async () => {
    vi.mocked(api.getApartments).mockResolvedValue([
      { id: 'a1', name: 'Mening uyim', created_at: new Date().toISOString(), rooms: [] } as never,
    ])
    mount()
    // Twice over: the hero card names the latest project, and the list names
    // every one of them.
    await waitFor(() => expect(screen.getAllByText('Mening uyim').length).toBeGreaterThan(0))
  })
})
