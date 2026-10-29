import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { PrintView } from '../PrintView'
import { computeProject, EMPTY_PRICE_BOOK, newProject } from '@/features/mebel/engine'
import i18n from '@/i18n'

function fourCabinets() {
  const p = newProject('Oshxona')
  p.cabinets = [0, 1, 2, 3].map(i => ({ ...p.cabinets[0], id: `c${i}`, label: `M${i + 1}`, position: { x: i * 600, z: 0 } }))
  return computeProject(p, EMPTY_PRICE_BOOK, {})
}

describe('PrintView sheets', () => {
  it('prints every sheet on its own page with its drawing, parts and cut order', () => {
    const result = fourCabinets()
    render(<PrintView name="Oshxona" result={result} snapshot={null} trim={10} materialName={() => null} />)
    const pages = screen.getAllByTestId('print-sheet')
    expect(pages).toHaveLength(result.nesting.reduce((n, x) => n + x.sheets.length, 0))
    const first = pages[0]
    expect(first.style.breakBefore).toBe('page')
    expect(first.querySelector('svg')).not.toBeNull()
    expect(first.querySelectorAll('[data-cut]').length).toBeGreaterThan(0)
    const sheet = result.nesting[0].sheets[0]
    const parts = within(first).getByRole('table', { name: i18n.t('mebel.nest.parts_on_sheet'), hidden: true })
    expect(within(parts).getAllByRole('row', { hidden: true })).toHaveLength(sheet.placements.length + 1)
    expect(first).toHaveTextContent(i18n.t('mebel.nest.cut_order'))
    const c = sheet.cuts[0]
    expect(first).toHaveTextContent(i18n.t('mebel.nest.cut_line', {
      n: c.order, dir: i18n.t(`mebel.nest.dir_${c.direction}`), len: Math.round(Math.abs(c.x2 - c.x1) + Math.abs(c.y2 - c.y1)), off: c.offset,
    }))
  })
})

describe('PrintView drilling', () => {
  it('prints a drilling page per drilled part and an assembly drawing per cabinet', () => {
    const result = fourCabinets()
    render(<PrintView name="Oshxona" result={result} snapshot={null} trim={10} materialName={() => null} cabinets={[0, 1, 2, 3].map(i => ({ id: `c${i}`, label: `M${i + 1}` }))} />)
    const drilled = result.parts.filter(p => (p.holes ?? []).length > 0)
    expect(screen.getAllByTestId('print-part')).toHaveLength(drilled.length)
    expect(screen.getAllByTestId('print-assembly')).toHaveLength(4)
  })
})
