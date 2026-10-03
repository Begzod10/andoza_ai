import * as React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SmetaPage from './SmetaPage'
import { formatUZS } from '@/lib/utils'

// ─── Mocks ────────────────────────────────────────────────────────────────
//
// Fix 7: opening this page (and "Qayta hisoblash") must hit the transient
// preview route, never the persisting create route — only an explicit
// "Saqlash" click may persist an Estimate row.

const ESTIMATE_RESPONSE = {
  id: 'transient-id',
  room_id: 'room-1',
  lines: [],
  total_uzs: 100_000,
  total_exact_uzs: 100_000,
  total_approx_uzs: 0,
  total_min: 90_000,
  total_max: 110_000,
  currency: 'UZS',
  status: 'draft',
  created_at: new Date().toISOString(),
  has_electrical: true,
  electrical_confirmed: true,
  usd_rate: 12_700,
  total_usd: 8,
}

const previewEstimate = vi.fn().mockResolvedValue(ESTIMATE_RESPONSE)
const createEstimate = vi.fn().mockResolvedValue({ ...ESTIMATE_RESPONSE, id: 'persisted-id', status: 'final' })

vi.mock('@/lib/api', () => ({
  previewEstimate: (...args: unknown[]) => previewEstimate(...args),
  createEstimate: (...args: unknown[]) => createEstimate(...args),
  getEstimatePDF: vi.fn(),
  getRoom: vi.fn().mockResolvedValue({
    id: 'room-1',
    apartment_id: 'apt-1',
    name: 'Mehmonxona',
    room_type: 'mehmonxona',
    area: 12,
    ceiling_height: 2.7,
    width: 3,
    length: 4,
    num_doors: 0,
    num_windows: 0,
    has_balcony: false,
    renovation_level: 'orta',
    design_state: {},
    created_at: '',
  }),
  smetaAsk: vi.fn(),
}))

function renderSmetaPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/smeta/room-1']}>
        <Routes>
          <Route path="/smeta/:roomId" element={<SmetaPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  previewEstimate.mockClear()
  createEstimate.mockClear()
})

describe('SmetaPage (Fix 7 — preview vs. persisted save)', () => {
  it('calls previewEstimate (not createEstimate) on mount', async () => {
    renderSmetaPage()

    await waitFor(() => expect(previewEstimate).toHaveBeenCalledTimes(1))
    expect(previewEstimate).toHaveBeenCalledWith('room-1')
    expect(createEstimate).not.toHaveBeenCalled()
  })

  it('"Qayta hisoblash" calls previewEstimate again, still never createEstimate', async () => {
    renderSmetaPage()
    await waitFor(() => expect(previewEstimate).toHaveBeenCalledTimes(1))

    fireEvent.click(await screen.findByText('Qayta hisoblash'))

    await waitFor(() => expect(previewEstimate).toHaveBeenCalledTimes(2))
    expect(createEstimate).not.toHaveBeenCalled()
  })

  it('"Saqlash" calls createEstimate — the only action that persists a snapshot', async () => {
    renderSmetaPage()
    await waitFor(() => expect(previewEstimate).toHaveBeenCalledTimes(1))

    fireEvent.click(await screen.findByText('Saqlash'))

    await waitFor(() => expect(createEstimate).toHaveBeenCalledTimes(1))
    expect(createEstimate).toHaveBeenCalledWith('room-1')
  })
})


describe('SmetaPage (lines grouped by category)', () => {
  const lines = [
    { label: 'Suvoq (gips) 30 kg qop', formula: '50.2 m² × 8.5 kg/m² = 426.7 kg, qopga 30 kg', quantity: 15, unit: 'qop', unit_price: 65_000, total_uzs: 975_000, is_approximate: true, store_id: null, category: 'suvoq', warning: 'Aniq norma topilmadi' },
    { label: 'Grunt 5 kg qop', formula: '', quantity: 2, unit: 'qop', unit_price: 45_000, total_uzs: 90_000, is_approximate: false, store_id: null, category: 'grunt' },
    { label: "Bo'yoq: oq", formula: '', quantity: 4, unit: 'litr', unit_price: 28_000, total_uzs: 112_000, is_approximate: false, store_id: null, category: 'boyoq' },
    { label: 'Laminat', formula: '', quantity: 12.5, unit: 'm²', unit_price: 100_000, total_uzs: 1_250_000, is_approximate: false, store_id: null, category: 'laminat' },
    { label: 'Elektr kabel', formula: '', quantity: 1, unit: 'to‘plam', unit_price: 300_000, total_uzs: 300_000, is_approximate: false, store_id: null, category: 'elektr' },
    { label: 'Noma\'lum ish', formula: '', quantity: 1, unit: 'dona', unit_price: 50_000, total_uzs: 50_000, is_approximate: false, store_id: null, category: 'mebel' },
  ]

  async function renderWithLines() {
    previewEstimate.mockResolvedValueOnce({ ...ESTIMATE_RESPONSE, lines, total_uzs: 2_777_000 })
    const view = renderSmetaPage()
    await screen.findAllByText('Devorni tayyorlash') // once in the breakdown, once as the section heading
    return view
  }

  it('shows a section per category that has lines, and none for the rest', async () => {
    await renderWithLines()
    for (const heading of ['Devorni tayyorlash', 'Devor pardozi', 'Pol va plintus', 'Elektr va yoritish', 'Boshqa xarajatlar']) {
      expect(screen.getAllByText(heading).length).toBeGreaterThan(0)
    }
    expect(screen.queryByText('Shift')).toBeNull()
    expect(screen.queryByText('Mebel va jihozlar')).toBeNull()
  })

  it("puts each line under its own category and totals it", async () => {
    const { container } = await renderWithLines()
    const prep = container.querySelector('[data-group="tayyorlash"]') as HTMLElement
    expect(prep.textContent).toContain('Suvoq (gips) 30 kg qop')
    expect(prep.textContent).toContain('Grunt 5 kg qop')
    expect(prep.textContent).not.toContain("Bo'yoq")
    expect(prep.textContent).toContain(formatUZS(1_065_000)) // 975 000 + 90 000
    expect(prep.textContent).toContain('2 ta qator')
    const other = container.querySelector('[data-group="boshqa"]') as HTMLElement
    expect(other.textContent).toContain("Noma'lum ish") // an unknown category is not lost
  })

  it('shows the whole formula and the warning, not a cut-off', async () => {
    await renderWithLines()
    expect(screen.getByText('50.2 m² × 8.5 kg/m² = 426.7 kg, qopga 30 kg')).toBeInTheDocument()
    expect(screen.getByText('Aniq norma topilmadi')).toBeInTheDocument()
    expect(screen.getByText('taxminiy')).toBeInTheDocument()
  })

  it('folds a section away and opens it again', async () => {
    const { container } = await renderWithLines()
    const prep = container.querySelector('[data-group="tayyorlash"]') as HTMLElement
    const header = prep.querySelector('button') as HTMLButtonElement
    expect(header).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(prep.textContent).not.toContain('Grunt 5 kg qop')
    expect(prep.textContent).toContain(formatUZS(1_065_000)) // the subtotal stays on the folded header

    fireEvent.click(header)
    expect(prep.textContent).toContain('Grunt 5 kg qop')
  })

  it('"Hammasini yig\'ish" folds every section and then offers to open them all', async () => {
    const { container } = await renderWithLines()
    fireEvent.click(screen.getByText("Hammasini yig'ish"))
    expect(container.querySelectorAll('[data-group] [aria-expanded="true"]').length).toBe(0)
    expect(container.querySelector('[data-line-index]')).toBeNull()

    fireEvent.click(screen.getByText('Hammasini yoyish'))
    expect(container.querySelectorAll('[data-group] [aria-expanded="true"]').length).toBe(5)
  })

  it('has a cost breakdown whose shares add up to the lines', async () => {
    await renderWithLines()
    expect(screen.getByText('Xarajat taqsimoti')).toBeInTheDocument()
    // laminat 1 250 000 of 2 777 000 = 45%
    expect(screen.getAllByText('45%').length).toBeGreaterThan(0)
  })

  it('shows no sections and no breakdown when the estimate has no lines', async () => {
    const { container } = renderSmetaPage()
    await screen.findByText('Jami xarajat')
    expect(container.querySelector('[data-group]')).toBeNull()
    expect(screen.queryByText('Xarajat taqsimoti')).toBeNull()
  })
})
