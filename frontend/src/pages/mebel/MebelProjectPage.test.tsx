import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, act, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'
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
    getCatalogMaterials: vi.fn(),
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
      <ConfirmProvider>
      <MemoryRouter initialEntries={['/mebel/p1']}>
        <Routes>
          <Route path="/mebel/:id" element={<MebelProjectPage />} />
        </Routes>
      </MemoryRouter>
      </ConfirmProvider>
    </QueryClientProvider>,
  )
}

const partsTable = () => screen.getByRole('table', { name: t('mebel.tab.parts') })
const rowOf = (name: string) => within(partsTable()).getAllByRole('row').find(r => r.textContent?.includes(name))!

beforeEach(() => {
  vi.clearAllMocks()
  const project = newProject('Oshxona')
  project.cabinets[0].id = 'c1'
  vi.mocked(api.getMebelProject).mockResolvedValue({ id: 'p1', name: 'Oshxona', data: project })
  vi.mocked(api.saveMebelProject).mockResolvedValue({ id: 'p1', name: 'Oshxona', data: project })
  vi.mocked(api.getPriceBook).mockResolvedValue(EMPTY_PRICE_BOOK)
  vi.mocked(api.getMaterials).mockResolvedValue([])
  vi.mocked(api.getCatalogMaterials).mockResolvedValue([])
})
afterEach(() => vi.useRealTimers())

describe('MebelProjectPage', () => {
  it('shows the cut list of the saved project', async () => {
    mount()
    await screen.findByRole('table', { name: t('mebel.tab.parts') })
    const side = rowOf(t('mebel.part.side_left'))
    expect(side).toHaveTextContent(formatMm(719.6))
    expect(side).toHaveTextContent('554')
    expect(screen.getByTestId('cabinet-view')).toHaveAttribute('data-parts', '8')
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
    fireEvent.click(await screen.findByRole('button', { name: t('mebel.add.base') }))
    expect(screen.getByTestId('cabinet-view')).toHaveAttribute('data-parts', '16')
    expect(screen.getByText('M2')).toBeInTheDocument()
  })

  it('removing a cabinet asks first; cancel keeps it', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: t('mebel.add.base') }))
    const removeM2 = () => screen.getAllByRole('button', { name: t('mebel.remove') })[1]
    fireEvent.click(removeM2())
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(t('mebel.remove_confirm', { label: 'M2' }))).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: t('common.bekor') }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('M2')).toBeInTheDocument()

    fireEvent.click(removeM2())
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: t('mebel.remove') }))
    await waitFor(() => expect(screen.queryByText('M2')).toBeNull())
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

describe('MebelProjectPage save status', () => {
  it('says saved only when the latest save has landed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const done: Array<() => void> = []
    vi.mocked(api.saveMebelProject).mockImplementation(() => new Promise(r => done.push(() => r({} as never))))
    mount()
    const width = await screen.findByLabelText(t('mebel.width'))
    fireEvent.change(width, { target: { value: '700' } })
    await act(async () => { vi.advanceTimersByTime(1100) })
    fireEvent.change(width, { target: { value: '800' } })
    await act(async () => { vi.advanceTimersByTime(1100) })
    expect(done).toHaveLength(2)
    await act(async () => { done[0]() })
    expect(screen.getByRole('status')).toHaveTextContent(t('mebel.saving'))
    await act(async () => { done[1]() })
    expect(screen.getByRole('status')).toHaveTextContent(t('mebel.saved'))
  })
})

describe('MebelProjectPage nesting', () => {
  it('the cutting layout tab draws the sheets', async () => {
    mount()
    await screen.findByRole('table', { name: t('mebel.tab.parts') })
    fireEvent.click(screen.getByRole('tab', { name: t('mebel.tab.nesting') }))
    expect(screen.getAllByRole('img').length).toBeGreaterThan(0)
  })

  it('kerf and trim are project settings', async () => {
    mount()
    const kerf = await screen.findByLabelText(t('mebel.kerf'))
    expect(kerf).toHaveValue(4)
    expect(screen.getByLabelText(t('mebel.trim'))).toHaveValue(10)
    fireEvent.change(kerf, { target: { value: '6' } })
    expect(screen.getByRole('status')).not.toHaveTextContent(t('mebel.not_saved_invalid'))
  })

  it('the BOM no longer calls the sheet count an estimate', async () => {
    mount()
    await screen.findByRole('table', { name: t('mebel.tab.parts') })
    fireEvent.click(screen.getByRole('tab', { name: t('mebel.tab.bom') }))
    expect(screen.queryByText(/≈/)).not.toBeInTheDocument()
  })
})

describe('MebelProjectPage cabinet types and doors', () => {
  it('adds a wall cabinet with its own size', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: t('mebel.add.wall') }))
    const depths = screen.getAllByLabelText(t('mebel.depth')) as HTMLInputElement[]
    expect(depths.map(d => d.value)).toEqual(['560', '300'])
    expect(screen.getByText('M2')).toBeInTheDocument()
  })

  it('no doors: the cut list has no door', async () => {
    mount()
    await screen.findByRole('table', { name: t('mebel.tab.parts') })
    expect(rowOf(t('mebel.part.door'))).toBeDefined()
    fireEvent.change(screen.getByLabelText(t('mebel.doors')), { target: { value: '0' } })
    expect(rowOf(t('mebel.part.door'))).toBeUndefined()
  })

  it('MDF doors make an order with its own CSV', async () => {
    mount()
    fireEvent.change(await screen.findByLabelText(t('mebel.facade_kind')), { target: { value: 'mdf' } })
    fireEvent.click(screen.getByRole('tab', { name: t('mebel.tab.bom') }))
    expect(screen.getByRole('table', { name: t('mebel.facade_order') })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t('mebel.export_facade_csv') })).toBeInTheDocument()
  })

  it('a tall cabinet 720 high is a height error', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: t('mebel.add.tall') }))
    const heights = screen.getAllByLabelText(t('mebel.height'))
    fireEvent.change(heights[1], { target: { value: '720' } })
    expect(screen.getByText(t('mebel.error.height_range', { min: 1200, max: 2400 }))).toBeInTheDocument()
  })
})

describe('MebelProjectPage old saved project', () => {
  it('a project saved before doors and types opens, with no doors', async () => {
    const old = newProject('Eski')
    old.cabinets[0].id = 'c1'
    delete (old.defaults as Partial<typeof old.defaults>).facade
    delete (old.cabinets[0] as Partial<typeof old.cabinets[0]>).type
    vi.mocked(api.getMebelProject).mockResolvedValue({ id: 'p1', name: 'Eski', data: old })
    mount()
    await screen.findByRole('table', { name: t('mebel.tab.parts') })
    expect(screen.getByLabelText(t('mebel.facade_kind'))).toHaveValue('none')
    expect(rowOf(t('mebel.part.door'))).toBeUndefined()
    fireEvent.change(screen.getByLabelText(t('mebel.facade_kind')), { target: { value: 'ldsp' } })
    expect(rowOf(t('mebel.part.door'))).toBeDefined()
    expect(screen.getByRole('status')).not.toHaveTextContent(t('mebel.not_saved_invalid'))
  })

  it('doors saved as null show as auto', async () => {
    const p = newProject('x')
    p.cabinets[0].id = 'c1'
    ;(p.cabinets[0] as { doors: unknown }).doors = null
    vi.mocked(api.getMebelProject).mockResolvedValue({ id: 'p1', name: 'x', data: p })
    mount()
    expect(await screen.findByLabelText(t('mebel.doors'))).toHaveValue('auto')
  })
})

describe('MebelProjectPage drawers', () => {
  it('three drawers: drawer parts, no door, shelves off', async () => {
    mount()
    fireEvent.change(await screen.findByLabelText(t('mebel.drawers')), { target: { value: '3' } })
    expect(rowOf(t('mebel.part.drawer_side'))).toBeDefined()
    // no row is named "door" (the drawer fronts' material column also says "Fasad")
    expect(within(partsTable()).queryByRole('cell', { name: t('mebel.part.door') })).toBeNull()
    expect(screen.getByLabelText(t('mebel.shelves'))).toBeDisabled()
    expect(screen.getByLabelText(t('mebel.doors'))).toBeDisabled()
  })
})

describe('MebelProjectPage drawer fixes', () => {
  it('a drawer error is shown on the drawers field', async () => {
    mount()
    fireEvent.change(await screen.findByLabelText(t('mebel.height')), { target: { value: '300' } })
    fireEvent.change(screen.getByLabelText(t('mebel.drawers')), { target: { value: '4' } })
    expect(screen.getByText(t('mebel.error.drawer_low', { min: 80 }))).toBeInTheDocument()
    expect(screen.getByLabelText(t('mebel.drawers'))).toHaveAttribute('aria-invalid', 'true')
  })

  it('the price book takes a price for a pair of slides', async () => {
    vi.mocked(api.savePriceBook).mockImplementation(async (pb) => pb)
    mount()
    await screen.findByRole('table', { name: t('mebel.tab.parts') })
    fireEvent.click(screen.getByRole('button', { name: t('mebel.price_book') }))
    fireEvent.change(await screen.findByLabelText(t('mebel.pb.slide')), { target: { value: '45000' } })
    fireEvent.click(screen.getByRole('button', { name: t('mebel.save') }))
    await act(async () => {})
    expect(vi.mocked(api.savePriceBook).mock.calls[0][0].hardware.slide).toBe(45000)
  })

  it('the price book takes LDSP, HDF and MDF prices, and the sheets use them', async () => {
    vi.mocked(api.savePriceBook).mockImplementation(async (pb) => pb)
    mount()
    await screen.findByRole('table', { name: t('mebel.tab.parts') })
    fireEvent.click(screen.getByRole('button', { name: t('mebel.price_book') }))
    fireEvent.change(await screen.findByLabelText(t('mebel.pb.board', { t: 18 })), { target: { value: '556000' } })
    fireEvent.change(screen.getByLabelText(t('mebel.pb.board', { t: 16 })), { target: { value: '480000' } })
    fireEvent.change(screen.getByLabelText(t('mebel.pb.back')), { target: { value: '120000' } })
    fireEvent.change(screen.getByLabelText(t('mebel.pb.mdf_m2')), { target: { value: '350000' } })
    fireEvent.click(screen.getByRole('button', { name: t('mebel.save') }))
    await act(async () => {})
    expect(vi.mocked(api.savePriceBook).mock.calls[0][0].sheets).toEqual({ board16: 480000, board18: 556000, back: 120000, mdfM2: 350000 })
  })

  it('on a phone, one switch shows the settings or the result, not one long page', async () => {
    mount()
    await screen.findByRole('table', { name: t('mebel.tab.parts') })
    const settings = screen.getByRole('button', { name: t('mebel.pane.params') })
    const result = screen.getByRole('button', { name: t('mebel.pane.result') })
    const aside = screen.getByTestId('mebel-params')
    const main = screen.getByTestId('mebel-result')
    // the settings first; on a wide screen both stay (lg:)
    expect(settings).toHaveAttribute('aria-pressed', 'true')
    expect(main.className).toMatch(/(^| )hidden( |$)/)
    expect(main.className).toContain('lg:flex')
    fireEvent.click(result)
    expect(result).toHaveAttribute('aria-pressed', 'true')
    expect(aside.className).toMatch(/(^| )hidden( |$)/)
    expect(aside.className).toContain('lg:block')
    expect(main.className).not.toMatch(/(^| )hidden( |$)/)
  })

  it('a long material name is cut short on screen, whole on hover and in print', async () => {
    mount()
    const cell = within(await screen.findByRole('table', { name: t('mebel.tab.parts') })).getAllByTestId('material-cell')[0]
    expect(cell.className).toContain('truncate')
    expect(cell.className).toContain('print:whitespace-normal')
    expect(cell).toHaveAttribute('title', cell.textContent)
  })

  it('on a phone the cut list keeps the sizes: id, material and grain columns hide below sm', async () => {
    mount()
    const table = await screen.findByRole('table', { name: t('mebel.tab.parts') })
    const header = (name: string) => within(table).getByRole('columnheader', { name })
    for (const name of [t('mebel.col.id'), t('mebel.col.material'), t('mebel.col.grain')]) {
      expect(header(name).className).toContain('hidden sm:table-cell print:table-cell')
    }
    for (const name of [t('mebel.col.part'), t('mebel.col.length'), t('mebel.col.width'), t('mebel.col.qty')]) {
      expect(header(name).className).not.toContain('hidden')
    }
    // and the table itself does not hold a desktop width
    expect(table.className).not.toMatch(/(^| )min-w-/)
  })

  it('each cabinet has its place along the wall, and Re-arrange lays them out again', async () => {
    mount()
    await screen.findByRole('table', { name: t('mebel.tab.parts') })
    fireEvent.click(screen.getByRole('button', { name: t('mebel.add.base') }))
    const x2 = () => screen.getAllByLabelText(t('mebel.position_x'))[1] as HTMLInputElement
    expect(x2().value).toBe('600')
    fireEvent.change(x2(), { target: { value: '900' } })
    expect(x2().value).toBe('900')
    fireEvent.change(x2(), { target: { value: '-5' } })
    expect(screen.getByText(t('mebel.error.position_range'))).toBeInTheDocument()
    fireEvent.change(x2(), { target: { value: '900' } })
    // a gap after M1: re-arranging closes it
    fireEvent.click(screen.getByRole('button', { name: t('mebel.relayout') }))
    expect(x2().value).toBe('600')
  })

  it('on a phone the thickness column gives way too', async () => {
    mount()
    const table = await screen.findByRole('table', { name: t('mebel.tab.parts') })
    expect(within(table).getByRole('columnheader', { name: t('mebel.col.thickness') }).className).toContain('hidden sm:table-cell')
  })

})

describe('MebelProjectPage layout', () => {
  const rowOfCab = (label: string) => screen.getByTestId(`cabinet-${label}`) as HTMLDetailsElement

  it('cabinets are one-line rows; one opens at a time', async () => {
    mount()
    await screen.findByRole('table', { name: t('mebel.tab.parts') })
    fireEvent.click(screen.getByRole('button', { name: t('mebel.add.wall') }))
    // the new cabinet opens, the first one closes
    expect(rowOfCab('M2').open).toBe(true)
    expect(rowOfCab('M1').open).toBe(false)
    expect(within(rowOfCab('M2')).getByText(/600×720×300/)).toBeInTheDocument()
    fireEvent.click(within(rowOfCab('M1')).getByText('M1'))
    expect(rowOfCab('M1').open).toBe(true)
    expect(rowOfCab('M2').open).toBe(false)
  })

  it('a cabinet with an error stays open and is marked', async () => {
    mount()
    await screen.findByRole('table', { name: t('mebel.tab.parts') })
    fireEvent.click(screen.getByRole('button', { name: t('mebel.add.base') }))
    fireEvent.change(screen.getAllByLabelText(t('mebel.width'))[0], { target: { value: '50' } })
    expect(rowOfCab('M1').open).toBe(true)
    expect(within(rowOfCab('M1')).getByTestId('cabinet-error-dot')).toBeInTheDocument()
  })

  it('settings, doors and the AI box start folded', async () => {
    mount()
    await screen.findByRole('table', { name: t('mebel.tab.parts') })
    expect((screen.getByTestId('section-settings') as HTMLDetailsElement).open).toBe(false)
    expect((screen.getByTestId('section-facade') as HTMLDetailsElement).open).toBe(false)
    expect((screen.getByTestId('section-ai') as HTMLDetailsElement).open).toBe(false)
  })

  it('the 3D view can be hidden to give the tables the room', async () => {
    mount()
    await screen.findByRole('table', { name: t('mebel.tab.parts') })
    // the button sits on the view itself, leaving the tabs the whole row
    const hide = screen.getByRole('button', { name: t('mebel.view_hide') })
    expect(hide.closest('[aria-label="' + t('mebel.view3d') + '"]')).not.toBeNull()
    expect(within(screen.getByRole('tablist').parentElement!).queryByRole('button', { name: t('mebel.view_hide') })).toBeNull()
    fireEvent.click(hide)
    expect(screen.queryByTestId('cabinet-view')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: t('mebel.view_show') }))
    expect(screen.getByTestId('cabinet-view')).toBeInTheDocument()
  })

  it('selecting a part opens its cabinet', async () => {
    mount()
    await screen.findByRole('table', { name: t('mebel.tab.parts') })
    fireEvent.click(screen.getByRole('button', { name: t('mebel.add.wall') }))
    expect(rowOfCab('M1').open).toBe(false)
    fireEvent.click(rowOf(i18n.t('mebel.part.bottom')))
    expect(rowOfCab('M1').open).toBe(true)
  })
})
