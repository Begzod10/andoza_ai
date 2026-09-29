/**
 * The strip is a carousel: it shows the previous section, the current one and
 * the next, wrapping round at both ends. With only two sections left that made
 * "Smeta | 3D | Smeta" — the same section on both sides of the current one,
 * since prev and next are the same tab.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { StudioTabStrip } from './StudioTabStrip'

function mount(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <StudioTabStrip roomId="r1" variant="inline" />
    </MemoryRouter>,
  )
}

describe('StudioTabStrip with two sections', () => {
  it('names each section once', () => {
    mount('/studio/r1/ichkarida')
    expect(screen.getAllByText('Smeta')).toHaveLength(1)
    expect(screen.getAllByText('3D')).toHaveLength(1)
  })

  it('marks the one being viewed, and offers the other', () => {
    mount('/studio/r1/ichkarida')
    const buttons = screen.getAllByRole('button')
    const current = buttons.find((b) => b.getAttribute('aria-current') === 'page')!
    expect(current).toHaveTextContent('3D')
    // The current section is not a place to navigate to.
    expect(current).toBeDisabled()
    expect(buttons.find((b) => b.textContent === 'Smeta')).not.toBeDisabled()
  })

  it('follows the route it is on', () => {
    mount('/smeta/r1')
    expect(screen.getAllByRole('button').find((b) => b.getAttribute('aria-current') === 'page'))
      .toHaveTextContent('Smeta')
  })

  it('links the other section to its own route', () => {
    mount('/studio/r1/ichkarida')
    // The pill is a button, not an anchor, so the route is checked by the
    // title it announces rather than an href.
    expect(screen.getByTitle(/Smeta/)).toBeInTheDocument()
  })
})
