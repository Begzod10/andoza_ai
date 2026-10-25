import { describe, it, expect, beforeEach } from 'vitest'
import { useRoomStore } from '../roomStore'

beforeEach(() => {
  window.localStorage.clear()
  useRoomStore.getState().resetRoom()
})

describe('roomType in the store', () => {
  it('a draft round-trip keeps it, and an unknown value is dropped', () => {
    useRoomStore.getState().loadDraftState({ roomType: 'bolalar' })
    expect(useRoomStore.getState().roomType).toBe('bolalar')
    useRoomStore.getState().loadDraftState({ roomType: 'nonsense' })
    expect(useRoomStore.getState().roomType).toBeNull()
  })

  it('is persisted so a reload keeps it', () => {
    useRoomStore.getState().setRoomType('kabinet')
    const saved = JSON.parse(window.localStorage.getItem('andoza-ai-room-draft') ?? '{}')
    expect(saved.state.roomType).toBe('kabinet')
  })

  it('loadRoom takes the server type and resetRoom clears it', () => {
    useRoomStore.getState().loadRoom({ id: 'r', room_type: 'oshxona' })
    expect(useRoomStore.getState().roomType).toBe('oshxona')
    useRoomStore.getState().resetRoom()
    expect(useRoomStore.getState().roomType).toBeNull()
  })
})
