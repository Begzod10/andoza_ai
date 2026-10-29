import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import MebelProjectPage from './MebelProjectPage'
import * as api from '@/lib/api'
import i18n from '@/i18n'
import { formatMm } from '@/features/mebel/ui/format'
import { EMPTY_PRICE_BOOK, newProject } from '@/features/mebel/engine'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof api>('@/lib/api')
  return {
    ...actual,
    getMebelProject: vi.fn(),
    saveMebelProject: vi.fn(),
    getPriceBook: vi.fn(),
    savePriceBook: vi.fn(),
    getMaterials: vi.fn(),
  }
})
vi.mock('@/features/mebel/export/csv', async () => {
  const actual = await vi.importActual<typeof import('@/features/mebel/export/csv')>('@/features/mebel/export/csv')
  return { ...actual, downloadCsv: vi.fn() }
})
// The 3D view needs WebGL; the page only has to hand it the parts.
vi.mock('@/features/mebel/three/CabinetView', () => ({
  CabinetView: ({ parts }: { parts: unknown[] }) => <div data-testid="cabinet-view" data-parts={parts.length} />,
}))

const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, o)

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/mebel/p1']}>
        <Routes>
          <Route path="/mebel/:id" element={<MebelProjectPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const partsTable = () => screen.getByRole('table', { name: t('mebel.tab.parts') })
const rowOf = (name: string) => within(partsTable()).getAllByRole('row').find(r => within(r).queryByText(name))!

beforeEach(() => {
  vi.clearAllMocks()
  const project = newProject('Oshxona')
  project.cabinets[0].id = 'c1'
  vi.mocked(api.getMebelProject).mockResolvedValue({ id: 'p1', name: 'Oshxona', data: project })
  vi.mocked(api.saveMebelProject).mockResolvedValue({ id: 'p1', name: 'Oshxona', data: project })
  vi.mocked(api.getPriceBook).mockResolvedValue(EMPTY_PRICE_BOOK)
  vi.mocked(api.getMaterials).mockResolvedValue([])
})
afterEach(() => vi.useRealTimers())

describe('MebelProjectPage', () => {
  it('shows the cut list of the saved project', async () => {
    mount()
    await screen.findByRole('table', { name: t('mebel.tab.parts') })
    const side = rowOf(t('mebel.part.side_left'))
    expect(side).toHaveTextContent(formatMm(719.6))
    expect(side).toHaveTextContent('554')
    expect(screen.getByTestId('cabinet-view')).toHaveAttribute('data-parts', '7')
  })

  it('recomputes the parts when a size changes', async () => {
    mount()
    const width = await screen.findByLabelText(t('mebel.width'))
    fireEvent.change(width, { target: { value: '800' } })
    const bottom = rowOf(t('mebel.part.bottom'))
    expect(bottom).toHaveTextContent('764')
    expect(bottom).toHaveTextContent('554')
  })

  it('switches between cut and finished sizes', async () => {
    mount()
    await screen.findByRole('table', { name: t('mebel.tab.parts') })
    fireEvent.click(screen.getByRole('button', { name: t('mebel.show_finished') }))
    const side = rowOf(t('mebel.part.side_left'))
    expect(side).toHaveTextContent('720')
    expect(side).toHaveTextContent('556')
  })

  it('an out-of-range size shows the error and no parts', async () => {
    mount()
    const width = await screen.findByLabelText(t('mebel.width'))
    fireEvent.change(width, { target: { value: '100' } })
    expect(screen.getByText(t('mebel.error.width_range', { min: 150, max: 1200 }))).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: t('mebel.tab.parts') })).not.toBeInTheDocument()
    expect(width).toHaveAttribute('aria-invalid', 'true')
  })

  it('saves once, a second after the last change', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mount()
    const width = await screen.findByLabelText(t('mebel.width'))
    fireEvent.change(width, { target: { value: '700' } })
    fireEvent.change(width, { target: { value: '800' } })
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(api.saveMebelProject).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(1100) })
    expect(api.saveMebelProject).toHaveBeenCalledTimes(1)
    const [, , data] = vi.mocked(api.saveMebelProject).mock.calls[0]
    expect(data.cabinets[0].width).toBe(800)
  })

  it('marks lines without a price as unpriced', async () => {
    mount()
    await screen.findByRole('table', { name: t('mebel.tab.parts') })
    fireEvent.click(screen.getByRole('tab', { name: t('mebel.tab.bom') }))
    expect(screen.getAllByText(t('mebel.unpriced')).length).toBeGreaterThan(0)
  })

  it('adds a cabinet next to the last one', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: t('mebel.add_cabinet') }))
    expect(screen.getByTestId('cabinet-view')).toHaveAttribute('data-parts', '14')
    expect(screen.getByText('M2')).toBeInTheDocument()
  })
})

describe('MebelProjectPage export', () => {
  it('downloads the cut list as CSV named after the project', async () => {
    const csv = await import('@/features/mebel/export/csv')
    const spy = vi.mocked(csv.downloadCsv)
    mount()
    fireEvent.click(await screen.findByRole('button', { name: t('mebel.export_csv') }))
    expect(spy).toHaveBeenCalledTimes(1)
    const [name, body] = spy.mock.calls[0]
    expect(name).toBe('Oshxona')
    expect(body).toContain('ID;Detal;Material')
    expect(body).toContain(t('mebel.part.side_left'))
  })

  it('PDF opens the print dialog with the printable cut list', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    mount()
    fireEvent.click(await screen.findByRole('button', { name: t('mebel.export_pdf') }))
    await act(async () => { await new Promise(r => setTimeout(r, 20)) })
    expect(print).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('mebel-print')).toHaveTextContent(t('mebel.print_title', { name: 'Oshxona' }))
  })
})

describe('MebelProjectPage review fixes', () => {
  it('the price book dialog shows the saved prices even when they arrive after the page', async () => {
    let resolvePb: (pb: typeof EMPTY_PRICE_BOOK) => void = () => {}
    vi.mocked(api.getPriceBook).mockReturnValue(new Promise(r => { resolvePb = r }))
    mount()
    await screen.findByRole('table', { name: t('mebel.tab.parts') })
    await act(async () => { resolvePb({ ...EMPTY_PRICE_BOOK, cutPerSheet: 40000, markupPercent: 30 }) })
    fireEvent.click(screen.getByRole('button', { name: t('mebel.price_book') }))
    expect(await screen.findByDisplayValue('40000')).toBeInTheDocument()
    expect(screen.getByDisplayValue('30')).toBeInTheDocument()
  })

  it('reopening the dialog after Cancel shows the saved prices, not the cancelled edit', async () => {
    vi.mocked(api.getPriceBook).mockResolvedValue({ ...EMPTY_PRICE_BOOK, cutPerSheet: 40000 })
    mount()
    await screen.findByRole('table', { name: t('mebel.tab.parts') })
    fireEvent.click(screen.getByRole('button', { name: t('mebel.price_book') }))
    fireEvent.change(await screen.findByDisplayValue('40000'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: t('mebel.cancel') }))
    fireEvent.click(screen.getByRole('button', { name: t('mebel.price_book') }))
    expect(await screen.findByDisplayValue('40000')).toBeInTheDocument()
  })

  it('leaving the page saves the pending edit at once', async () => {
    const view = mount()
    fireEvent.change(await screen.findByLabelText(t('mebel.width')), { target: { value: '900' } })
    view.unmount()
    expect(api.saveMebelProject).toHaveBeenCalledTimes(1)
    expect(vi.mocked(api.saveMebelProject).mock.calls[0][2].cabinets[0].width).toBe(900)
  })

  it('an edit that does not validate says it is not saved', async () => {
    mount()
    fireEvent.change(await screen.findByLabelText(t('mebel.width')), { target: { value: '100' } })
    expect(screen.getByRole('status')).toHaveTextContent(t('mebel.not_saved_invalid'))
  })
})
