import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import MebelListPage from './MebelListPage'
import * as api from '@/lib/api'
import i18n from '@/i18n'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof api>('@/lib/api')
  return { ...actual, listMebelProjects: vi.fn(), createMebelProject: vi.fn() }
})

function Opened() {
  return <p>opened {useParams().id}</p>
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ConfirmProvider>
      <MemoryRouter initialEntries={['/mebel']}>
        <Routes>
          <Route path="/mebel" element={<MebelListPage />} />
          <Route path="/mebel/:id" element={<Opened />} />
        </Routes>
      </MemoryRouter>
      </ConfirmProvider>
    </QueryClientProvider>,
  )
}

describe('MebelListPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists the projects', async () => {
    vi.mocked(api.listMebelProjects).mockResolvedValue([
      { id: 'p1', name: 'Oshxona Chilonzor', updated_at: '2026-10-29T10:00:00Z' },
      { id: 'p2', name: 'Oshxona Yunusobod', updated_at: '2026-10-28T10:00:00Z' },
    ])
    mount()
    expect(await screen.findByText('Oshxona Chilonzor')).toBeInTheDocument()
    expect(screen.getByText('Oshxona Yunusobod')).toBeInTheDocument()
  })

  it('draws in the app theme tokens, so the text stays readable at night', async () => {
    vi.mocked(api.listMebelProjects).mockResolvedValue([{ id: 'p1', name: 'Oshxona', updated_at: '2026-10-29T10:00:00Z' }])
    const { container } = mount()
    await screen.findByText('Oshxona')
    expect(screen.getByRole('heading', { name: i18n.t('mebel.title') }).className).toContain('text-ink')
    expect(screen.getByText('Oshxona').closest('li')!.className).toContain('bg-card')
    expect(container.innerHTML).not.toMatch(/text-neutral-|bg-white|bg-neutral-/)
  })

  it('says when there are no projects yet', async () => {
    vi.mocked(api.listMebelProjects).mockResolvedValue([])
    mount()
    expect(await screen.findByText(i18n.t('mebel.empty'))).toBeInTheDocument()
  })

  it('says the list failed to load, not that there are none', async () => {
    vi.mocked(api.listMebelProjects).mockRejectedValue(new Error('Failed to fetch'))
    mount()
    expect(await screen.findByText(i18n.t('mebel.load_failed'))).toBeInTheDocument()
    expect(screen.queryByText(i18n.t('mebel.empty'))).not.toBeInTheDocument()
  })

  it('creates a project with one default cabinet and opens it', async () => {
    vi.mocked(api.listMebelProjects).mockResolvedValue([])
    vi.mocked(api.createMebelProject).mockResolvedValue({ id: 'new1', name: 'x', data: {} as never })
    mount()
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('mebel.new_project') }))
    await waitFor(() => expect(screen.getByText('opened new1')).toBeInTheDocument())
    const [name, data] = vi.mocked(api.createMebelProject).mock.calls[0]
    expect(name).toBe(i18n.t('mebel.default_name'))
    expect(data.cabinets).toHaveLength(1)
    expect(data.cabinets[0]).toMatchObject({ width: 600, height: 720, depth: 560 })
  })
})
