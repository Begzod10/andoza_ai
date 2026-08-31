import * as React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SmetaPage from './SmetaPage'

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
