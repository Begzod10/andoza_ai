import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PartDrawing } from './PartDrawing'
import { HoleTable } from './HoleTable'
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

describe('PartDrawing dimensions', () => {
  const dims = (c: HTMLElement, axis: 'x' | 'y') =>
    [...c.querySelectorAll(`[data-dim="${axis}"]`)].map(e => ({ value: Number(e.textContent), at: Number(e.getAttribute('data-at')), row: Number(e.getAttribute('data-row')) }))

  it('labels no hole with u/v: positions are dimensions from the left and front edges', () => {
    const left = side('side_left')
    const { container } = render(<PartDrawing part={left} />)
    expect(container.textContent).not.toMatch(/\d+\/\d+/)
    const xs = dims(container, 'x').map(d => d.value)
    // the shelf pin at u = 346 on a mirrored side is 720 − 346 from the drawing's left edge
    expect(xs).toContain(left.finished.length - 346)
    expect(dims(container, 'y').map(d => d.value)).toContain(37)
  })

  it('hinge plate holes 32 mm apart get labels that do not overlap', () => {
    const left = side('side_left')
    const { container } = render(<PartDrawing part={left} />)
    const xs = dims(container, 'x')
    const font = Number(container.querySelector('[data-dim="x"]')!.getAttribute('font-size'))
    for (const a of xs) for (const b of xs) {
      if (a !== b && a.row === b.row) expect(Math.abs(a.at - b.at)).toBeGreaterThanOrEqual(font)
    }
    // 85 and 117 from the bottom end are both there
    expect(xs.map(d => d.value)).toEqual(expect.arrayContaining([left.finished.length - 85, left.finished.length - 117]))
  })
})

describe('HoleTable', () => {
  it('gives each hole as mm from the left and the front edge, as drawn', () => {
    const left = side('side_left')
    render(<HoleTable part={left} />)
    expect(screen.getByRole('columnheader', { name: i18n.t('mebel.drill.from_left') })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: i18n.t('mebel.drill.from_front') })).toBeInTheDocument()
    const pin = screen.getAllByRole('row').find(r => r.textContent?.startsWith(i18n.t('mebel.drill.kinds.shelf_pin')))!
    expect(pin.textContent).toContain(String(left.finished.length - 346))
  })
})

describe('PartDrawing end labels', () => {
  it('sit inside the part, so they never cross the dimensions on the left', () => {
    for (const role of ['side_left', 'side_right'] as const) {
      const { container, unmount } = render(<PartDrawing part={side(role)} />)
      expect(container.querySelectorAll('[data-end]')).toHaveLength(2)
      for (const e of container.querySelectorAll('[data-end]')) {
        const x = Number(e.getAttribute('x')), dy = Number(e.getAttribute('dy'))
        // rotated −90°: dy moves the text along x; at the left edge it must move in (+)
        if (x === 0) expect(dy).toBeGreaterThan(0)
        else expect(dy).toBeLessThan(0)
      }
      unmount()
    }
  })
})
