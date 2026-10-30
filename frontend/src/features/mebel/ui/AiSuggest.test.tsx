import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AiSuggest, applySuggestion } from './AiSuggest'
import { newProject } from '@/features/mebel/engine'
import type { MebelSuggestion } from '@/lib/api'
import * as api from '@/lib/api'
import i18n from '@/i18n'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof api>('@/lib/api')
  return { ...actual, suggestMebelCabinets: vi.fn() }
})

const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, o)
const SUGGESTION: MebelSuggestion = {
  cabinets: [
    { type: 'base', width: 600, height: 720, depth: 560, shelves: 1, doors: null, drawers: 0 },
    { type: 'base', width: 800, height: 720, depth: 560, shelves: 0, doors: null, drawers: 3 },
    { type: 'tall', width: 600, height: 2100, depth: 560, shelves: 4, doors: null, drawers: 0 },
    { type: 'wall', width: 600, height: 720, depth: 300, shelves: 1, doors: 1, drawers: 0 },
  ],
  facade: 'mdf',
  questions: ['Devor shkaflari balandligi 720 mi?'],
  dropped: ['wall depth 450: 200–400'],
}

describe('applySuggestion', () => {
  it('adds the cabinets after the existing ones, walls in their own row after the tall one', () => {
    const p = newProject('x')
    const next = applySuggestion(p, SUGGESTION, 'add')
    expect(next.cabinets.map(c => [c.label, c.type, c.position.x])).toEqual([
      ['M1', 'base', 0], ['M2', 'base', 600], ['M3', 'base', 1200], ['M4', 'tall', 2000], ['M5', 'wall', 2600],
    ])
    expect(next.cabinets[2]).toMatchObject({ drawers: 3, shelves: 0 })
    expect(next.cabinets[4]).toMatchObject({ doors: 1 })
    expect(next.cabinets[1].doors).toBeUndefined()
  })

  it('a facade from the AI is used only when replacing, and keeps the chosen material if the kind is the same', () => {
    const p = newProject('x')
    p.defaults.facade = { ...p.defaults.facade, kind: 'ldsp', materialId: 'oak' }
    expect(applySuggestion(p, { ...SUGGESTION, facade: 'none' }, 'add').defaults.facade).toEqual(p.defaults.facade)
    expect(applySuggestion(p, { ...SUGGESTION, facade: 'ldsp' }, 'replace').defaults.facade.materialId).toBe('oak')
    expect(applySuggestion(p, { ...SUGGESTION, facade: 'mdf' }, 'replace').defaults.facade).toMatchObject({ kind: 'mdf', materialId: null })
  })

  it('replaces the cabinets', () => {
    const next = applySuggestion(newProject('x'), SUGGESTION, 'replace')
    expect(next.cabinets.map(c => c.label)).toEqual(['M1', 'M2', 'M3', 'M4'])
    expect(next.cabinets[0].position.x).toBe(0)
  })
})

describe('AiSuggest', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the proposal, its questions and what was left out, then adds it', async () => {
    vi.mocked(api.suggestMebelCabinets).mockResolvedValue(SUGGESTION)
    const update = vi.fn()
    render(<AiSuggest update={update} />)
    fireEvent.change(screen.getByLabelText(t('mebel.ai.label')), { target: { value: '2400 oshxona' } })
    fireEvent.click(screen.getByRole('button', { name: t('mebel.ai.ask') }))
    expect(await screen.findByText('Devor shkaflari balandligi 720 mi?')).toBeInTheDocument()
    expect(screen.getByText(/wall depth 450/)).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(4)
    fireEvent.click(screen.getByRole('button', { name: t('mebel.ai.add') }))
    expect(update).toHaveBeenCalledTimes(1)
    const next = update.mock.calls[0][0](newProject('x'))
    expect(next.cabinets).toHaveLength(5)
  })

  it('shows the length warnings from the server', async () => {
    vi.mocked(api.suggestMebelCabinets).mockResolvedValue({ ...SUGGESTION, warnings: ['Pastki qator va penal: 2600 mm, matnda 2400 mm'] })
    render(<AiSuggest update={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(t('mebel.ai.label')), { target: { value: '2400 oshxona' } })
    fireEvent.click(screen.getByRole('button', { name: t('mebel.ai.ask') }))
    expect(await screen.findByText('Pastki qator va penal: 2600 mm, matnda 2400 mm')).toBeInTheDocument()
  })

  it('an empty proposal cannot replace the cabinets', async () => {
    vi.mocked(api.suggestMebelCabinets).mockResolvedValue({ cabinets: [], facade: null, questions: ['Oshxona eni qancha?'], dropped: [] })
    render(<AiSuggest update={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(t('mebel.ai.label')), { target: { value: 'oshxona' } })
    fireEvent.click(screen.getByRole('button', { name: t('mebel.ai.ask') }))
    await screen.findByText('Oshxona eni qancha?')
    expect(screen.getByRole('button', { name: t('mebel.ai.replace') })).toBeDisabled()
    expect(screen.getByRole('button', { name: t('mebel.ai.add') })).toBeDisabled()
  })

  it('says when the AI fails', async () => {
    vi.mocked(api.suggestMebelCabinets).mockRejectedValue(new Error('AI javob bermadi'))
    render(<AiSuggest update={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(t('mebel.ai.label')), { target: { value: 'oshxona' } })
    fireEvent.click(screen.getByRole('button', { name: t('mebel.ai.ask') }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('AI javob bermadi'))
  })
  it('adding cannot take the project past 30 cabinets', async () => {
    const big = newProject('x')
    big.cabinets = Array.from({ length: 28 }, (_, i) => ({ ...big.cabinets[0], id: `c${i}`, label: `M${i + 1}` }))
    vi.mocked(api.suggestMebelCabinets).mockResolvedValue(SUGGESTION)
    render(<AiSuggest update={vi.fn()} cabinetCount={big.cabinets.length} />)
    fireEvent.change(screen.getByLabelText(t('mebel.ai.label')), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: t('mebel.ai.ask') }))
    await screen.findByText('Devor shkaflari balandligi 720 mi?')
    expect(screen.getByRole('button', { name: t('mebel.ai.add') })).toBeDisabled()
    expect(screen.getByText(t('mebel.ai.over_limit', { max: 30 }))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t('mebel.ai.replace') })).not.toBeDisabled()
  })
})
