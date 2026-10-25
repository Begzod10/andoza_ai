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
