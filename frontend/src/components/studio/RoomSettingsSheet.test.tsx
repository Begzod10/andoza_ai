import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useRoomStore } from '@/store/roomStore'
import RoomSettingsSheet from './RoomSettingsSheet'

const updateRoom = vi.fn()
vi.mock('@/lib/api', () => ({ updateRoom: (...a: unknown[]) => updateRoom(...a) }))

beforeEach(() => {
  updateRoom.mockReset()
  updateRoom.mockResolvedValue({})
  useRoomStore.getState().resetRoom()
  useRoomStore.setState({ roomId: 'room-9' })
})

describe('RoomSettingsSheet room type', () => {
  it('picker PATCHes room_type', async () => {
    render(<RoomSettingsSheet open onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Xona turi'), { target: { value: 'hammom' } })
    await waitFor(() => expect(updateRoom).toHaveBeenCalledWith('room-9', { room_type: 'hammom' }))
    expect(useRoomStore.getState().roomType).toBe('hammom')
  })

  it('uses the plain (not night-themed) select in the light sheet', () => {
    render(<RoomSettingsSheet open onClose={() => {}} />)
    expect(screen.getByLabelText('Xona turi').className).not.toContain('bg-card-soft')
    expect(screen.getByLabelText('Xona turi').className).toContain('h-10')
  })

  it('does not undo a newer pick when an older PATCH fails', async () => {
    let fail: (e: Error) => void = () => {}
    updateRoom.mockImplementationOnce(() => new Promise((_, rej) => { fail = rej }))
    render(<RoomSettingsSheet open onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Xona turi'), { target: { value: 'hammom' } })
    fireEvent.change(screen.getByLabelText('Xona turi'), { target: { value: 'balkon' } })
    fail(new Error('x'))
    await new Promise((r) => setTimeout(r, 10))
    expect(useRoomStore.getState().roomType).toBe('balkon')
  })

  it('puts the old type back when the PATCH fails', async () => {
    useRoomStore.setState({ roomType: 'balkon' })
    updateRoom.mockRejectedValueOnce(new Error('x'))
    render(<RoomSettingsSheet open onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Xona turi'), { target: { value: 'hammom' } })
    await waitFor(() => expect(useRoomStore.getState().roomType).toBe('balkon'))
  })

  it('"not set" clears the type with null', async () => {
    useRoomStore.setState({ roomType: 'balkon' })
    render(<RoomSettingsSheet open onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Xona turi'), { target: { value: '' } })
    await waitFor(() => expect(updateRoom).toHaveBeenCalledWith('room-9', { room_type: null }))
  })
})

describe('RoomSettingsSheet layout', () => {
  function screenWidth(wide: boolean) {
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query.includes('min-width: 1024px') ? wide : false,
      media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
    return () => { window.matchMedia = original }
  }

  it('on a wide screen it is a side panel beside the room, with nothing dimming it', () => {
    const restore = screenWidth(true)
    try {
      render(<RoomSettingsSheet open onClose={() => {}} />)
      expect(screen.getByRole('dialog')).toHaveAttribute('data-variant', 'side')
      expect(document.querySelector('[style*="rgba(0, 0, 0"]')).toBeNull()
    } finally { restore() }
  })

  it('on a narrow screen it stays the bottom sheet', () => {
    render(<RoomSettingsSheet open onClose={() => {}} />)
    expect(screen.getByRole('dialog')).not.toHaveAttribute('data-variant', 'side')
  })

  it('puts the sizes first, then the doors and windows, and the room type last', () => {
    render(<RoomSettingsSheet open onClose={() => {}} />)
    const sizes = screen.getByText(/^o'lchamlar$/i)
    const openings = screen.getByText(/derazalar va eshiklar/i)
    const type = screen.getByLabelText('Xona turi')
    expect(sizes.compareDocumentPosition(openings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(openings.compareDocumentPosition(type) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('sums the room up in one line under the sizes, not three big tiles', () => {
    render(<RoomSettingsSheet open onClose={() => {}} />)
    const summary = screen.getByRole('group', { name: /xona o'lchovlari/i })
    expect(summary.tagName).toBe('P')
    expect(summary.textContent).toMatch(/m².*·.*m/)
  })

  it('"+ window" and "+ door" are the same kind of button', () => {
    render(<RoomSettingsSheet open onClose={() => {}} />)
    const win = screen.getAllByRole('button', { name: /deraza/i }).find((b) => b.textContent?.includes('+'))!
    const door = screen.getAllByRole('button', { name: /eshik/i }).find((b) => b.textContent?.includes('+'))!
    expect(win.className).toBe(door.className)
  })
})
