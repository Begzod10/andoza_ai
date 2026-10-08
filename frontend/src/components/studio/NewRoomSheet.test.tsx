/**
 * The new-room sheet: does it open, does the drawing follow the numbers, and
 * does it hand back what the user actually typed.
 *
 * The open/closed condition is tested because a sheet that silently fails to
 * appear is indistinguishable, from the user's side, from a button that does
 * nothing — and that is exactly the failure this feature can have.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NewRoomSheet } from './NewRoomSheet'
import { NEW_ROOM_DEFAULT_MM, NEW_ROOM_LIMITS_MM } from '@/lib/newRoomFromWall'

const noop = () => {}

describe('NewRoomSheet', () => {
  it('shows nothing until a wall has asked for it', () => {
    const { container } = render(
      <NewRoomSheet isOpen={false} side="north" onClose={noop} onConfirm={noop} />,
    )
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('shows nothing when the wall had no side to offer', () => {
    // `wallSideOf` returns null for a wall it cannot place; opening a sheet
    // that cannot say where the room goes would be worse than not opening.
    const { container } = render(
      <NewRoomSheet isOpen side={null} onClose={noop} onConfirm={noop} />,
    )
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('opens for a wall that has one, and says which way it faces', () => {
    render(<NewRoomSheet isOpen side="east" onClose={noop} onConfirm={noop} />)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText(/sharq/)).toBeTruthy()
  })

  it('starts at the defaults, and at this room’s own ceiling', () => {
    render(<NewRoomSheet isOpen side="north" defaultHeightMm={3100} onClose={noop} onConfirm={noop} />)
    expect((screen.getByLabelText('Eni, mm') as HTMLInputElement).value)
      .toBe(String(NEW_ROOM_DEFAULT_MM.width))
    expect((screen.getByLabelText('Balandligi, mm') as HTMLInputElement).value).toBe('3100')
  })

  it('draws the room, and redraws it when a number changes', () => {
    const { container } = render(
      <NewRoomSheet isOpen side="north" onClose={noop} onConfirm={noop} />,
    )
    const before = [...container.querySelectorAll('polygon')].map((p) => p.getAttribute('points')).join('|')
    fireEvent.change(screen.getByLabelText('Eni, mm'), { target: { value: '9000' } })
    const after = [...container.querySelectorAll('polygon')].map((p) => p.getAttribute('points')).join('|')
    expect(before).not.toBe(after)
  })

  it('hands back the numbers that are on screen', () => {
    const onConfirm = vi.fn()
    render(<NewRoomSheet isOpen side="south" onClose={noop} onConfirm={onConfirm} />)
    fireEvent.change(screen.getByLabelText('Eni, mm'), { target: { value: '4200' } })
    fireEvent.change(screen.getByLabelText("Bo‘yi, mm"), { target: { value: '2600' } })
    fireEvent.click(screen.getByRole('button', { name: 'Yaratish' }))
    expect(onConfirm).toHaveBeenCalledWith({ widthMm: 4200, depthMm: 2600, heightMm: NEW_ROOM_DEFAULT_MM.height })
  })

  it('will not let a typed number out of range', () => {
    const onConfirm = vi.fn()
    render(<NewRoomSheet isOpen side="south" onClose={noop} onConfirm={onConfirm} />)
    fireEvent.change(screen.getByLabelText('Eni, mm'), { target: { value: '999999' } })
    fireEvent.click(screen.getByRole('button', { name: 'Yaratish' }))
    expect(onConfirm.mock.calls[0][0].widthMm).toBe(NEW_ROOM_LIMITS_MM.width.max)
  })

  it('steps by 10 cm', () => {
    render(<NewRoomSheet isOpen side="north" onClose={noop} onConfirm={noop} />)
    fireEvent.click(screen.getByRole('button', { name: 'Eni oshirish' }))
    expect((screen.getByLabelText('Eni, mm') as HTMLInputElement).value)
      .toBe(String(NEW_ROOM_DEFAULT_MM.width + 100))
  })

  it('backs out without creating anything', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    render(<NewRoomSheet isOpen side="north" onClose={onClose} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: 'Bekor qilish' }))
    expect(onClose).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('cannot be confirmed twice while the room is being made', () => {
    render(<NewRoomSheet isOpen side="north" busy onClose={noop} onConfirm={noop} />)
    expect((screen.getByRole('button', { name: /Yaratilmoqda/ }) as HTMLButtonElement).disabled).toBe(true)
  })
})
