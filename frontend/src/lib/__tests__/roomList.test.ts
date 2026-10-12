/**
 * The ⋮ menu's room list — the one way into another room of the flat now
 * that tapping a neighbour in the 3D view no longer switches rooms ("no switch
 * needed"; the user picked the menu list over the projects page).
 */
import { describe, expect, it } from 'vitest'
import { roomListEntries } from '@/lib/roomList'

const room = (id: string, name: string) => ({ id, name })

describe('roomListEntries', () => {
  it('lists every room of the flat, marking the one that is open', () => {
    expect(roomListEntries([room('a', 'Oshxona'), room('b', 'Yotoqxona')], 'b')).toEqual([
      { id: 'a', label: 'Oshxona', current: false },
      { id: 'b', label: 'Yotoqxona', current: true },
    ])
  })

  it('numbers rooms that share a name, so each can be told apart', () => {
    // Every room made through a wall is called "Xona".
    expect(roomListEntries([room('a', 'Xona'), room('b', 'Mehmonxona'), room('c', 'Xona')], 'a')
      .map((e) => e.label)).toEqual(['Xona 1', 'Mehmonxona', 'Xona 2'])
  })

  it('names a room with no name', () => {
    expect(roomListEntries([room('a', ''), room('b', 'Oshxona')], 'a')[0].label).toBe('Xona')
  })

  it('offers nothing for a one-room project', () => {
    expect(roomListEntries([room('a', 'Xona')], 'a')).toEqual([])
    expect(roomListEntries(undefined, 'a')).toEqual([])
  })
})
