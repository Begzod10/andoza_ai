import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useRoomStore } from '@/store/roomStore'
import { RoomTypeBadge } from './RoomTypeBadge'

const updateRoom = vi.fn()
vi.mock('@/lib/api', () => ({ updateRoom: (...a: unknown[]) => updateRoom(...a) }))

beforeEach(() => {
  updateRoom.mockReset()
  updateRoom.mockResolvedValue({})
  useRoomStore.getState().resetRoom()
})

describe('RoomTypeBadge', () => {
  it("shows the room's own type", () => {
    useRoomStore.setState({ name: 'Mening xonam', roomType: 'mehmonxona' })
    render(<RoomTypeBadge roomId="room-9" />)
    expect(screen.getByRole('button', { name: /Mehmonxona/ })).toBeInTheDocument()
    expect(screen.queryByText('(taxmin)')).not.toBeInTheDocument()
  })

  it('shows the guess from the name, marked as a guess', () => {
    useRoomStore.setState({ name: 'Oshxona', roomType: null })
    render(<RoomTypeBadge roomId="room-9" />)
    const badge = screen.getByRole('button', { name: /Oshxona/ })
    expect(badge).toHaveTextContent('(taxmin)')
  })

  it('asks to choose a type when there is neither one nor a guess', () => {
    useRoomStore.setState({ name: 'Mening xonam', roomType: null })
    render(<RoomTypeBadge roomId="room-9" />)
    const chip = screen.getByRole('button', { name: 'Xona turini tanlang' })
    expect(chip.className).toContain('text-accent')
  })

  it('opens the picker, PATCHes the choice and shows it', async () => {
    useRoomStore.setState({ name: 'Mening xonam', roomType: null })
    render(<RoomTypeBadge roomId="room-9" />)
    expect(screen.queryByLabelText('Xona turi')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Xona turini tanlang' }))
    fireEvent.change(screen.getByLabelText('Xona turi'), { target: { value: 'yotoqxona' } })
    await waitFor(() => expect(updateRoom).toHaveBeenCalledWith('room-9', { room_type: 'yotoqxona' }))
    expect(screen.getByRole('button', { name: /Yotoqxona/ })).toBeInTheDocument()
    expect(screen.queryByLabelText('Xona turi')).not.toBeInTheDocument()
  })

  it('keeps a draft room local: the choice is stored, nothing is PATCHed', () => {
    useRoomStore.setState({ name: 'Mening xonam', roomType: null })
    render(<RoomTypeBadge roomId={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Xona turini tanlang' }))
    fireEvent.change(screen.getByLabelText('Xona turi'), { target: { value: 'balkon' } })
    expect(useRoomStore.getState().roomType).toBe('balkon')
    expect(updateRoom).not.toHaveBeenCalled()
  })

  it('closes on Escape', () => {
    useRoomStore.setState({ name: 'Mening xonam', roomType: 'kabinet' })
    render(<RoomTypeBadge roomId="room-9" />)
    fireEvent.click(screen.getByRole('button', { name: /Kabinet/ }))
    expect(screen.getByLabelText('Xona turi')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByLabelText('Xona turi')).not.toBeInTheDocument()
  })

  describe('read-only', () => {
    it('shows the type as text, with nothing to click', () => {
      useRoomStore.setState({ name: 'Mening xonam', roomType: 'hammom' })
      render(<RoomTypeBadge readOnly />)
      expect(screen.getByText(/Hammom/)).toBeInTheDocument()
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('shows the guess with its mark', () => {
      useRoomStore.setState({ name: 'Balkon', roomType: null })
      const { container } = render(<RoomTypeBadge readOnly />)
      expect(container).toHaveTextContent(/Balkon\s*\(taxmin\)/)
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('shows nothing, not the choose chip, when the type is unknown', () => {
      useRoomStore.setState({ name: 'Mening xonam', roomType: null })
      const { container } = render(<RoomTypeBadge readOnly />)
      expect(container).toBeEmptyDOMElement()
    })
  })
})
