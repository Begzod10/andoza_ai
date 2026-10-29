import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NestingPanel } from './NestingPanel'
import { computeProject, EMPTY_PRICE_BOOK, newProject } from '@/features/mebel/engine'
import i18n from '@/i18n'

const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, o)
const sample = () => computeProject(newProject('x'), EMPTY_PRICE_BOOK, {}).nesting

describe('NestingPanel', () => {
  it('summarises each board: sheets and use', () => {
    const nesting = sample()
    render(<NestingPanel nesting={nesting} trim={10} selectedPartId={null} onSelect={() => {}} materialName={() => null} />)
    const board = nesting.find(n => n.material === 'board')!
    expect(screen.getByText(t('mebel.nest.summary', {
      name: t('mebel.material.board'), t: 18, n: board.sheets.length, p: Math.round(board.utilization * 100),
    }))).toBeInTheDocument()
  })

  it('draws one sheet per sheet used', () => {
    const nesting = sample()
    render(<NestingPanel nesting={nesting} trim={10} selectedPartId={null} onSelect={() => {}} materialName={() => null} />)
    expect(screen.getAllByRole('img')).toHaveLength(nesting.reduce((n, x) => n + x.sheets.length, 0))
  })

  it('clicking a part on a drawing selects it', () => {
    const onSelect = vi.fn()
    const { container } = render(<NestingPanel nesting={sample()} trim={10} selectedPartId={null} onSelect={onSelect} materialName={() => null} />)
    fireEvent.click(container.querySelector('g[data-part-id="M1-03"]')!)
    expect(onSelect).toHaveBeenCalledWith('M1-03')
  })

  it('lists the parts that fit no sheet', () => {
    const p = newProject('x')
    p.defaults.sheet = { length: 500, width: 400 }
    const nesting = computeProject(p, EMPTY_PRICE_BOOK, {}).nesting
    render(<NestingPanel nesting={nesting} trim={10} selectedPartId={null} onSelect={() => {}} materialName={() => null} />)
    expect(screen.getByText(new RegExp(`M1-01.*${t('mebel.nest.unplaced_reason')}`))).toBeInTheDocument()
    expect(screen.queryAllByRole('img')).toHaveLength(0)
  })

  it('shows the cut numbers only when asked', () => {
    const { container } = render(<NestingPanel nesting={sample()} trim={10} selectedPartId={null} onSelect={() => {}} materialName={() => null} />)
    expect(container.querySelectorAll('[data-cut]').length).toBe(0)
    fireEvent.click(screen.getByRole('checkbox', { name: t('mebel.nest.show_cuts') }))
    expect(container.querySelectorAll('[data-cut]').length).toBeGreaterThan(0)
  })
})
