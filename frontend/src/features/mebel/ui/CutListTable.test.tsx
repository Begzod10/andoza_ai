import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { CutListTable } from './CutListTable'
import { baseCabinetParts, DEFAULTS, groupParts } from '@/features/mebel/engine'
import i18n from '@/i18n'
import { formatMm } from './format'

const cab = { id: 'c1', type: 'base' as const, label: 'M1', width: 600, height: 720, depth: 560, shelves: 1, position: { x: 0, z: 0 } }
const groups = groupParts(baseCabinetParts(cab, DEFAULTS))

describe('CutListTable', () => {
  it('one row per group, with ids, quantity and banding', () => {
    render(<CutListTable groups={groups} showCut selectedPartId={null} onSelect={() => {}} />)
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(groups.length)
    expect(rows[0]).toHaveTextContent('M1-01, M1-02')
    expect(rows[0]).toHaveTextContent(formatMm(719.6))
    expect(rows[0]).toHaveTextContent('2')
  })

  it('selects a part when its row is clicked and highlights the selected one', () => {
    const onSelect = vi.fn()
    const { rerender } = render(<CutListTable groups={groups} showCut selectedPartId={null} onSelect={onSelect} />)
    const bottomRow = screen.getByText(i18n.t('mebel.part.bottom')).closest('tr')!
    fireEvent.click(bottomRow)
    expect(onSelect).toHaveBeenCalledWith('M1-03')
    rerender(<CutListTable groups={groups} showCut selectedPartId="M1-03" onSelect={onSelect} />)
    expect(screen.getByText(i18n.t('mebel.part.bottom')).closest('tr')).toHaveAttribute('aria-selected', 'true')
  })
})

describe('CutListTable names', () => {
  it('names every role a row holds', () => {
    const d = { ...DEFAULTS, edge: { ...DEFAULTS.edge, visible: { ...DEFAULTS.edge.visible, thickness: 0 as const } } }
    render(<CutListTable groups={groupParts(baseCabinetParts(cab, d))} showCut selectedPartId={null} onSelect={() => {}} />)
    expect(screen.getByText(`${i18n.t('mebel.part.rail_front')}, ${i18n.t('mebel.part.rail_back')}`)).toBeInTheDocument()
  })
})
