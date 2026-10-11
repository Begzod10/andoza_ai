/**
 * The styled stand-in for window.confirm(): `useConfirm()` resolves true only
 * when the user presses the confirm button; cancel, Escape and the X all
 * resolve false.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { ConfirmProvider, useConfirm, type ConfirmOptions } from './ConfirmDialog'
import { FeedbackProvider } from './FeedbackProvider'
import { showToast } from './Toast'

function Asker({ options }: { options: ConfirmOptions }) {
  const confirm = useConfirm()
  const [answer, setAnswer] = useState('none')
  return (
    <>
      <button onClick={async () => setAnswer(String(await confirm(options)))}>ask</button>
      <output>{answer}</output>
    </>
  )
}

function mount(options: ConfirmOptions = { title: "O'chirilsinmi?", description: "Bu amalni qaytarib bo'lmaydi.", destructive: true }) {
  render(<ConfirmProvider><Asker options={options} /></ConfirmProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'ask' }))
}

describe('useConfirm', () => {
  it('resolves true when confirmed', async () => {
    mount()
    const dialog = await screen.findByRole('dialog', { name: "O'chirilsinmi?" })
    expect(dialog).toHaveTextContent("Bu amalni qaytarib bo'lmaydi.")
    fireEvent.click(within(dialog).getByRole('button', { name: "O'chirish" }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('true'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('resolves false when cancelled', async () => {
    mount()
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Bekor qilish' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('false'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('resolves false on Escape', async () => {
    mount()
    fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' })
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('false'))
  })

  it('uses the given labels, and a neutral confirm for non-destructive questions', async () => {
    mount({ title: 'Davom etasizmi?', confirmLabel: 'Ha', cancelLabel: "Yo'q" })
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: "Yo'q" })).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ha' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('true'))
  })
})

describe('showToast', () => {
  it('reaches the mounted provider from outside React', async () => {
    render(<FeedbackProvider><div /></FeedbackProvider>)
    showToast({ variant: 'error', title: "Qismni ajratib bo'lmadi", description: 'xato' })
    expect(await screen.findByText("Qismni ajratib bo'lmadi")).toBeInTheDocument()
  })
})
