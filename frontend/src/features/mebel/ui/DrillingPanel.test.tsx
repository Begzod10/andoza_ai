import { describe, it, expect } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { DrillingPanel } from './DrillingPanel'
import { computeProject, EMPTY_PRICE_BOOK, newProject } from '@/features/mebel/engine'
import i18n from '@/i18n'

const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, o)

describe('DrillingPanel', () => {
  const project = newProject('x')
  const r = computeProject(project, EMPTY_PRICE_BOOK, {})
  const left = r.parts.find(p => p.role === 'side_left')!

  it('lists the drilled parts and draws the chosen one with every hole', () => {
    const { container } = render(<DrillingPanel parts={r.parts} cabinets={project.cabinets} />)
    const item = screen.getByRole('button', { name: new RegExp(`${left.id}.*${left.holes!.length}`) })
    fireEvent.click(item)
    const drawing = screen.getByRole('img', { name: new RegExp(left.id) })
    expect(drawing.querySelectorAll('[data-hole]')).toHaveLength(left.holes!.length)
    const table = screen.getByRole('table', { name: t('mebel.drill.holes') })
    expect(within(table).getAllByRole('row')).toHaveLength(left.holes!.length + 1)
    expect(container.querySelectorAll('[data-testid="assembly"]').length).toBeGreaterThan(0)
  })

  it('says so when nothing is drilled', () => {
    render(<DrillingPanel parts={[]} cabinets={[]} />)
    expect(screen.getByText(t('mebel.drill.empty'))).toBeInTheDocument()
  })
})
