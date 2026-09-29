/**
 * One tap shows what an opening could be; two say you mean to move it. The
 * second tap lands on the ring's own backdrop, so a quick dismissal is what a
 * double tap looks like from inside the menu.
 */
import { describe, it, expect } from 'vitest'
import { armsForDragging, DOUBLE_TAP_MS } from '../doubleTapArm'

const door = { surface: 'door', elId: 'd1' }
const win = { surface: 'window', elId: 'w1' }

describe('armsForDragging', () => {
  it('arms when the ring is dismissed while the finger is still there', () => {
    expect(armsForDragging(door, 1000, 1000 + 120)).toBe(true)
    expect(armsForDragging(win, 1000, 1000 + 120)).toBe(true)
  })

  it('does not arm on a considered dismissal a moment later', () => {
    // Looking at the designs and then tapping away is not "move this".
    expect(armsForDragging(door, 1000, 1000 + DOUBLE_TAP_MS)).toBe(false)
    expect(armsForDragging(door, 1000, 1000 + 4000)).toBe(false)
  })

  it('arms nothing for a surface that cannot be dragged', () => {
    for (const surface of ['wall', 'ceiling', 'floor', 'skirting', 'cornice']) {
      expect(armsForDragging({ surface, elId: 'x' }, 1000, 1010)).toBe(false)
    }
  })

  it('arms nothing when the ring belongs to no opening', () => {
    expect(armsForDragging({ surface: 'door' }, 1000, 1010)).toBe(false)
    expect(armsForDragging(null, 1000, 1010)).toBe(false)
    expect(armsForDragging(undefined, 1000, 1010)).toBe(false)
  })

  it('ignores a clock that went backwards', () => {
    expect(armsForDragging(door, 1000, 900)).toBe(false)
  })
})
