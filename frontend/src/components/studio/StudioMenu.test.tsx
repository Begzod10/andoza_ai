import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { StudioMenu } from './StudioMenu'

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <p>outside</p>
      <StudioMenu open={open} onOpenChange={setOpen}>
        <button type="button">Ulashish</button>
      </StudioMenu>
    </div>
  )
}

const kebab = () => screen.getByRole('button', { name: "Ko'proq" })

describe('StudioMenu', () => {
  it('says it opens a menu, and whether it is open', () => {
    render(<Harness />)
    expect(kebab()).toHaveAttribute('aria-haspopup', 'menu')
    expect(kebab()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Ulashish')).toBeNull()
    fireEvent.click(kebab())
    expect(kebab()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Ulashish')).toBeInTheDocument()
  })

  it('closes on Escape and hands focus back to the button', () => {
    render(<Harness />)
    fireEvent.click(kebab())
    screen.getByText('Ulashish').focus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Ulashish')).toBeNull()
    expect(kebab()).toHaveAttribute('aria-expanded', 'false')
    expect(kebab()).toHaveFocus()
  })

  it('closes on a click outside, but not on a click inside', () => {
    render(<Harness />)
    fireEvent.click(kebab())
    fireEvent.mouseDown(screen.getByText('Ulashish'))
    expect(screen.getByText('Ulashish')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByText('outside'))
    expect(screen.queryByText('Ulashish')).toBeNull()
  })

  it('toggles shut from its own button rather than closing and reopening', () => {
    render(<Harness />)
    fireEvent.click(kebab())
    fireEvent.mouseDown(kebab())
    fireEvent.click(kebab())
    expect(screen.queryByText('Ulashish')).toBeNull()
  })

  it('sits on the themed card surface, not a fixed white one', () => {
    render(<Harness />)
    fireEvent.click(kebab())
    const panel = screen.getByText('Ulashish').parentElement!
    expect(panel.className).toContain('bg-card')
    expect(panel.className).not.toContain('bg-white')
  })
})
