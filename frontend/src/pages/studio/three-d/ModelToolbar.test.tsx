/**
 * The column exists to belong to the selected model: it must not be on screen
 * when there is nothing to transform.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ModelToolbar } from './ModelToolbar'

describe('ModelToolbar', () => {
  it('shows nothing while nothing is selected', () => {
    const { container } = render(
      <ModelToolbar selectedId={null} toolMode="select" setToolMode={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('offers the transform tools once a model is picked', () => {
    // Siljitish is not among them: dragging a selected model already moves it.
    render(<ModelToolbar selectedId="fur-1" toolMode="select" setToolMode={vi.fn()} />)
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label')))
      .toEqual(['Tanlash', 'Aylantirish', "O'lcham"])
  })

  it('does not offer a delete — that is the press and hold on the model', () => {
    render(<ModelToolbar selectedId="fur-1" toolMode="select" setToolMode={vi.fn()} />)
    expect(screen.queryByLabelText(/chirish/i)).toBeNull()
  })

  it('switches mode when a tool is tapped', () => {
    const setToolMode = vi.fn()
    render(<ModelToolbar selectedId="fur-1" toolMode="select" setToolMode={setToolMode} />)
    fireEvent.click(screen.getByLabelText('Aylantirish'))
    expect(setToolMode).toHaveBeenCalledWith('rotate')
  })

  it('marks the live tool, so it is clear which one is in hand', () => {
    render(<ModelToolbar selectedId="fur-1" toolMode="rotate" setToolMode={vi.fn()} />)
    expect(screen.getByLabelText('Aylantirish').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByLabelText('Tanlash').getAttribute('aria-pressed')).toBe('false')
  })

  it('goes away again when the model is dropped', () => {
    const { rerender, container } = render(
      <ModelToolbar selectedId="fur-1" toolMode="select" setToolMode={vi.fn()} />,
    )
    expect(screen.getAllByRole('button')).toHaveLength(3)
    rerender(<ModelToolbar selectedId={null} toolMode="select" setToolMode={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
