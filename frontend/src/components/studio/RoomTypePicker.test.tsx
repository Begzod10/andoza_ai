import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { useRoomStore } from '@/store/roomStore'
import { RoomTypePicker } from './RoomTypePicker'

const updateRoom = vi.fn()
vi.mock('@/lib/api', () => ({ updateRoom: (...a: unknown[]) => updateRoom(...a) }))
vi.mock('@/components/ui/Toast', () => ({ showToast: vi.fn() }))

beforeEach(() => {
  updateRoom.mockReset()
  updateRoom.mockResolvedValue({})
  localStorage.clear()
  useRoomStore.getState().resetRoom()
})

describe('RoomTypePicker and the room it belongs to', () => {
  it("does not PATCH a room the store does not hold (another room's type is on show)", () => {
    // The AI sheet passes the URL's room; the store still holds the room just left.
    useRoomStore.setState({ roomId: 'A', roomType: 'oshxona', name: 'Mening xonam' })
    render(<RoomTypePicker roomId="B" />)
    const select = screen.getByLabelText('Xona turi') as HTMLSelectElement
    expect(select).toBeDisabled()
    fireEvent.change(select, { target: { value: 'hammom' } })
    expect(updateRoom).not.toHaveBeenCalledWith('B', expect.anything())
    expect(useRoomStore.getState().roomType).toBe('oshxona')
  })

  it('a failed PATCH for the room left behind does not put its old type on the room opened since', async () => {
    let fail: (e: Error) => void = () => {}
    updateRoom.mockImplementationOnce(() => new Promise((_res, rej) => { fail = rej }))
    useRoomStore.getState().loadRoom({ id: 'A', name: 'Mening xonam', room_type: 'mehmonxona' })
    render(<RoomTypePicker roomId="A" />)
    fireEvent.change(screen.getByLabelText('Xona turi'), { target: { value: 'oshxona' } })
    expect(updateRoom).toHaveBeenCalledWith('A', { room_type: 'oshxona' })

    // The user switches to room B, whose own type happens to be the one just picked for A.
    act(() => useRoomStore.getState().loadRoom({ id: 'B', name: 'Mening xonam', room_type: 'oshxona' }))
    await act(async () => { fail(new Error('HTTP 500')) })
    await waitFor(() => expect(updateRoom).toHaveBeenCalledTimes(1))
    expect(useRoomStore.getState().roomId).toBe('B')
    expect(useRoomStore.getState().roomType).toBe('oshxona')
  })
})
