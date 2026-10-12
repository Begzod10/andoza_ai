/**
 * Switching rooms by tapping one, without the view moving ("seamless switch",
 * the user's option 1): the camera keeps its place in the flat, the usual
 * re-framing on a room change is skipped, and the tap is replayed on the
 * room it landed on once that room is the one open.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  arriveRoomSwitch, beginRoomSwitch, endRoomSwitch, shiftedPose, switchCovers,
} from '@/lib/roomSwitch'

afterEach(() => endRoomSwitch())

const SWITCH = { toId: 'b', offsetXM: 3.85, offsetZM: -1, tap: { x: 120, y: 340 } }

describe('a seamless room switch', () => {
  it('covers the room being switched to from the moment it starts', () => {
    beginRoomSwitch(SWITCH)
    expect(switchCovers('b')).toBe(true)
    expect(switchCovers('a')).toBe(false)
  })

  it('hands itself over once, when that room has loaded, and keeps covering until it ends', () => {
    beginRoomSwitch(SWITCH)
    expect(arriveRoomSwitch('a')).toBeNull()
    expect(arriveRoomSwitch('b')).toEqual(SWITCH)
    expect(arriveRoomSwitch('b')).toBeNull()
    // The re-framing effects run after arrival; they must still stand down.
    expect(switchCovers('b')).toBe(true)
    endRoomSwitch()
    expect(switchCovers('b')).toBe(false)
  })

  it('covers nothing when no switch is under way', () => {
    expect(switchCovers('b')).toBe(false)
    expect(arriveRoomSwitch('b')).toBeNull()
  })

  it('moves the camera by the opposite of the new room\'s offset, so the picture stays put', () => {
    // The flat is drawn around the open room. Opening the room 3.85 m east
    // moves everything 3.85 m west; the camera has to move with it.
    expect(shiftedPose(SWITCH, { x: 5, y: 4, z: 2 })).toEqual({ x: 5 - 3.85, y: 4, z: 3 })
  })
})
