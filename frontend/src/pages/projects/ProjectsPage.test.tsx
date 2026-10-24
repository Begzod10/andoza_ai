/**
 * A list that could not be loaded is not an empty list.
 *
 * With the server unreachable the page used to render "Hali loyiha yo'q" —
 * telling a user whose projects are sitting safely in the database that they
 * have none.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ProjectsPage from './ProjectsPage'
import * as api from '@/lib/api'
import { applyLanguage } from '@/i18n'
import ru from '@/i18n/locales/ru.json'

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

describe('ProjectsPage desktop cards', () => {
  beforeEach(() => vi.clearAllMocks())

  it('counts projects and rooms once the list has loaded', async () => {
    vi.mocked(api.getApartments).mockResolvedValue([
      { id: 'a1', name: 'Uy 1', created_at: new Date().toISOString(), rooms: [{ id: 'r1', name: 'Xona' }, { id: 'r2', name: 'Xona 2' }] } as never,
      { id: 'a2', name: 'Uy 2', created_at: new Date().toISOString(), rooms: [] } as never,
    ])
    mount()
    await waitFor(() => expect(screen.getByText("Umumiy ko'rinish")).toBeInTheDocument())
    expect(screen.getByText('loyiha').previousElementSibling).toHaveTextContent('2')
    expect(screen.getByText('xona').previousElementSibling).toHaveTextContent('2')
  })

  it('shows no counts when the list could not be loaded (0 projects would be a lie)', async () => {
    vi.mocked(api.getApartments).mockRejectedValue(new Error('Failed to fetch'))
    mount()
    await waitFor(() => expect(screen.getByText(/yuklanmadi/i)).toBeInTheDocument())
    expect(screen.queryByText("Umumiy ko'rinish")).toBeNull()
  })

  it('links to the shop and the craftsmen', async () => {
    vi.mocked(api.getApartments).mockResolvedValue([])
    mount()
    await waitFor(() => expect(screen.getByText("Do'konni ochish")).toBeInTheDocument())
    expect(screen.getByText('Ustalarni ko\'rish')).toBeInTheDocument()
  })

  it('stepping through the stages on the hero card changes the stage shown', async () => {
    vi.mocked(api.getApartments).mockResolvedValue([
      { id: 'a1', name: 'Uy 1', created_at: new Date().toISOString(), rooms: [{ id: 'r1', name: 'Xona' }] } as never,
    ])
    mount()
    await waitFor(() => expect(screen.getAllByText('1-bosqich: Korobka').length).toBeGreaterThan(0))
    fireEvent.click(screen.getByLabelText('3-bosqich: Shpaklovka'))
    expect(screen.getAllByText('3-bosqich: Shpaklovka').length).toBeGreaterThan(0)
  })
})

function WizardProbe() {
  const loc = useLocation()
  return <p data-testid="wizard-url">{loc.pathname + loc.search}</p>
}

describe('ProjectsPage "Yangi loyiha"', () => {
  beforeEach(() => vi.clearAllMocks())

  it("sends the new project's id to the wizard, so its first room lands in it", async () => {
    vi.mocked(api.getApartments).mockResolvedValue([])
    vi.mocked(api.createApartment).mockResolvedValue({ id: 'apt-new', name: 'Uy' } as never)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/projects']}>
          <Routes>
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/wizard" element={<WizardProbe />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    fireEvent.click(await screen.findByText('+ Yangi loyiha'))
    fireEvent.change(screen.getByPlaceholderText('Masalan: Tashkent, Shayxontohur'), { target: { value: 'Uy' } })
    fireEvent.click(screen.getByText('Yaratish'))
    await waitFor(() =>
      expect(screen.getByTestId('wizard-url').textContent).toBe('/wizard?apartmentId=apt-new'),
    )
  })
})

describe('ProjectsPage "Yangi loyiha" look', () => {
  it('is drawn in the app theme, not a white sheet over a dark app', async () => {
    vi.mocked(api.getApartments).mockResolvedValue([])
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/projects']}>
          <ProjectsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    fireEvent.click(await screen.findByText('+ Yangi loyiha'))
    const sheet = screen.getByRole('heading', { name: 'Yangi loyiha' }).parentElement as HTMLElement
    expect(sheet.className).toContain('bg-card')
    expect(sheet.className).not.toContain('bg-white')
  })
})

describe('ProjectsPage branding', () => {
  beforeEach(() => vi.clearAllMocks())

  it('says andoza.ai, not the old UyRemont name', async () => {
    vi.mocked(api.getApartments).mockResolvedValue([])
    mount()
    await screen.findByText(/Hali loyiha yo'q/)
    expect(screen.getAllByText('andoza.ai').length).toBeGreaterThan(0)
    expect(screen.queryByText('UyRemont')).toBeNull()
  })
})

describe('ProjectsPage in Russian', () => {
  beforeEach(() => { vi.clearAllMocks(); applyLanguage('ru') })
  afterEach(() => applyLanguage('uz'))

  it('takes headings, stages and plural forms from ru.json', async () => {
    vi.mocked(api.getApartments).mockResolvedValue([
      { id: 'a1', name: 'Uy 1', created_at: new Date().toISOString(), rooms: [{ id: 'r1', name: 'A' }, { id: 'r2', name: 'B' }] } as never,
      { id: 'a2', name: 'Uy 2', created_at: new Date().toISOString(), rooms: [{ id: 'r3', name: 'C' }] } as never,
    ])
    mount()
    expect(await screen.findByText(ru.projects.umumiy_korinish)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: ru.projects.mening_loyihalarim })).toBeInTheDocument()
    // 2 projects -> "проекта", 3 rooms -> "комнаты"; the card of a1 says "2 комнаты".
    expect(screen.getByText(ru.projects.loyiha_soni_few)).toBeInTheDocument()
    expect(screen.getByText(ru.projects.xona_soni_few)).toBeInTheDocument()
    expect(screen.getAllByText('Этап 1: Коробка').length).toBeGreaterThan(0)
    expect(screen.queryByText("Umumiy ko'rinish")).toBeNull()
  })

  it('says the empty state in Russian', async () => {
    vi.mocked(api.getApartments).mockResolvedValue([])
    mount()
    expect(await screen.findByText(ru.projects.hali_loyiha_yoq)).toBeInTheDocument()
  })
})
