import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PartDrawing } from './PartDrawing'
import { computeProject, EMPTY_PRICE_BOOK, newProject } from '@/features/mebel/engine'
import i18n from '@/i18n'

const r = computeProject(newProject('x'), EMPTY_PRICE_BOOK, {})
const side = (role: 'side_left' | 'side_right') => r.parts.find(p => p.role === role)!

describe('PartDrawing', () => {
  it('draws the left side as seen from inside: its bottom on the right', () => {
    const left = side('side_left')
    const { container } = render(<PartDrawing part={left} />)
    const pin = container.querySelector('[data-hole="shelf_pin"] circle')!
    expect(Number(pin.getAttribute('cx'))).toBe(left.finished.length - 346)
  })

  it('draws the right side unmirrored: its bottom on the left', () => {
    const right = side('side_right')
    const { container } = render(<PartDrawing part={right} />)
    expect(Number(container.querySelector('[data-hole="shelf_pin"] circle')!.getAttribute('cx'))).toBe(346)
  })

  it('names both ends of a side so it is laid the right way round', () => {
    render(<PartDrawing part={side('side_left')} />)
    expect(screen.getByText(i18n.t('mebel.drill.end_bottom'))).toBeInTheDocument()
    expect(screen.getByText(i18n.t('mebel.drill.end_top'))).toBeInTheDocument()
  })
})
