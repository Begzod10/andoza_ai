import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Dialog } from './Dialog'

describe('Dialog', () => {
  it('follows the day/night theme by default instead of a fixed white sheet', () => {
    render(<Dialog open onOpenChange={() => {}} title="Sarlavha"><p>ichi</p></Dialog>)
    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toContain('bg-card')
    expect(dialog.className).not.toContain('bg-white')
    expect(screen.getByText('Sarlavha').className).toContain('text-ink')
  })

  it('can still opt out into the fixed white sheet', () => {
    render(<Dialog open onOpenChange={() => {}} title="Sarlavha" themed={false}><p>ichi</p></Dialog>)
    expect(screen.getByRole('dialog').className).toContain('bg-white')
  })
})
