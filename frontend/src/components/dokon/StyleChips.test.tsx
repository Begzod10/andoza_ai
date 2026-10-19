import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StyleChips } from './StyleChips'

describe('StyleChips', () => {
  it('picks a style', () => {
    const onChange = vi.fn()
    render(<StyleChips value={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Hi-Tech' }))
    expect(onChange).toHaveBeenCalledWith(['hitech'])
  })

  it('un-picks a chosen style', () => {
    const onChange = vi.fn()
    render(<StyleChips value={['hitech']} onChange={onChange} />)
    const chip = screen.getByRole('button', { name: 'Hi-Tech' })
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(chip)
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('adds to the styles already chosen', () => {
    const onChange = vi.fn()
    render(<StyleChips value={['hitech']} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Zamonaviy' }))
    expect(onChange).toHaveBeenCalledWith(['hitech', 'zamonaviy'])
  })

  it('says it suits every style when none is chosen', () => {
    const { rerender } = render(<StyleChips value={[]} onChange={() => {}} />)
    expect(screen.getByText('Hamma uslubga mos')).toBeInTheDocument()
    rerender(<StyleChips value={['loft']} onChange={() => {}} />)
    expect(screen.queryByText('Hamma uslubga mos')).toBeNull()
  })
})
