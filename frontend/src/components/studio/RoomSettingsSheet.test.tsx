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
