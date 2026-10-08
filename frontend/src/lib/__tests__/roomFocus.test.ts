/**
 * Focusing one room of the flat.
 *
 * The rule is small, and these pin the two ends of it: nothing focused shows
 * everything (the normal state, which an inverted check would turn into an
 * empty scene), and the focused room's own button is the way back out.
 */
import { describe, it, expect } from 'vitest'
import { isRoomVisible, toggleRoomFocus } from '../roomFocus'

describe('isRoomVisible', () => {
  it('shows every room when nothing is focused', () => {
    for (const id of ['a', 'b', 'c']) expect(isRoomVisible(null, id)).toBe(true)
  })

  it('shows only the focused room', () => {
    expect(isRoomVisible('b', 'b')).toBe(true)
    expect(isRoomVisible('b', 'a')).toBe(false)
  })

  it('hides every room when the focus names one that is not in the flat', () => {
    // Why ThreeDCanvasScene now drops its focus on every room change:
    // `/studio/:roomId` carries no key on its route element, so the canvas —
    // and the focusedRoomId useState inside it — survives a room switch. Land
    // in a room list that no longer contains the focused id and this rule
    // correctly hides everything, leaving a blank scene that reads as "my
    // rooms are gone". The rule is right; a stale input is the bug, so it is
    // the state's owner that has to clear it.
    const rooms = ['a', 'b', 'c']
    expect(rooms.some((id) => isRoomVisible('gone', id))).toBe(false)
  })

  it('never hides everything — something is always on screen', () => {
    // An inverted check would leave an empty scene with no way to tell why.
    const rooms = ['a', 'b', 'c']
    for (const focused of [null, 'a', 'b', 'c']) {
      expect(rooms.some((id) => isRoomVisible(focused, id))).toBe(true)
    }
  })
})

describe('toggleRoomFocus', () => {
  it('focuses a room that was not focused', () => {
    expect(toggleRoomFocus(null, 'a')).toBe('a')
    expect(toggleRoomFocus('b', 'a')).toBe('a')
  })

  it('is the way back out, not a dead end', () => {
    // Pressing the focused room's own button clears the focus; without this
    // the only exit would be a control the user has to go and find.
    expect(toggleRoomFocus('a', 'a')).toBeNull()
  })

  it('round-trips', () => {
    expect(toggleRoomFocus(toggleRoomFocus(null, 'a'), 'a')).toBeNull()
  })
})
