import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModerationQueue } from './ModerationQueue'

const api = vi.hoisted(() => ({
  getPendingQueue: vi.fn(),
  approvePending: vi.fn(),
  rejectPending: vi.fn(),
}))
vi.mock('@/lib/api', () => ({
  getPendingQueue: (...a: unknown[]) => api.getPendingQueue(...a),
  approvePending: (...a: unknown[]) => api.approvePending(...a),
  rejectPending: (...a: unknown[]) => api.rejectPending(...a),
}))

const usta = {
  id: 'u1', name: 'Aziz usta', category: 'elektrik', district: 'Chilonzor', phone: '+998901234567',
  telegram: null, price_min: 100000, price_max: 300000, status: 'pending', moderation_note: null,
  owner_user_id: 'o1', created_at: '2026-10-05T10:00:00Z',
}

function renderQueue() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <ModerationQueue onError={() => {}} />
    </QueryClientProvider>,
  )
}

beforeEach(() => Object.values(api).forEach((f) => f.mockReset()))

describe('admin moderation queue — craftsman applications', () => {
  it('lists a pending usta with their trade and contact, and approves them', async () => {
    api.getPendingQueue.mockResolvedValue({ stores: [], furniture: [], ustalar: [usta] })
    api.approvePending.mockResolvedValue(undefined)
    renderQueue()

    expect(await screen.findByText('Aziz usta')).toBeInTheDocument()
    expect(screen.getByText(/Usta arizasi · Elektrik · Chilonzor · \+998901234567/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Tasdiqlash' }))
    await waitFor(() => expect(api.approvePending).toHaveBeenCalledWith('ustalar', 'u1'))
  })

  it('rejects a usta only with a reason', async () => {
    api.getPendingQueue.mockResolvedValue({ stores: [], furniture: [], ustalar: [usta] })
    api.rejectPending.mockResolvedValue(undefined)
    renderQueue()

    fireEvent.click(await screen.findByRole('button', { name: 'Rad etish' }))
    fireEvent.change(screen.getByPlaceholderText(/Model sifati past/), { target: { value: 'Telefon noto\'g\'ri' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Rad etish' }).at(-1)!)

    await waitFor(() => expect(api.rejectPending).toHaveBeenCalledWith('ustalar', 'u1', "Telefon noto'g'ri"))
  })

  it('still works against a server that does not send ustalar', async () => {
    api.getPendingQueue.mockResolvedValue({ stores: [], furniture: [] })
    renderQueue()
    await waitFor(() => expect(api.getPendingQueue).toHaveBeenCalled())
    expect(screen.queryByText(/Ko'rib chiqishni kutmoqda/)).toBeNull()
  })
})
