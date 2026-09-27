/**
 * One tap, one window: picking a second style from the still-open ring must
 * change the window that tap made, not stack another on top of it.
 */
import { describe, it, expect } from 'vitest'
import { windowSpotKey, restylesExisting, type StyledWindow } from '../windowSpot'

const P = { x: 1.2345678, y: 1.2, z: -1.5 }
const last: StyledWindow = { spot: windowSpotKey('A', P), wallId: 'A', id: 'w1' }
const els = [{ id: 'w1' }]

describe('windowSpotKey', () => {
  it('is the same key for the same tap', () => {
    expect(windowSpotKey('A', P)).toBe(windowSpotKey('A', { ...P }))
  })

  it('ignores float noise below a millimetre', () => {
    expect(windowSpotKey('A', { ...P, x: P.x + 1e-5 })).toBe(windowSpotKey('A', P))
  })

  it('tells a different spot on the same wall apart', () => {
    expect(windowSpotKey('A', { ...P, x: P.x + 0.4 })).not.toBe(windowSpotKey('A', P))
  })

  it('tells the same spot on a different wall apart', () => {
    expect(windowSpotKey('B', P)).not.toBe(windowSpotKey('A', P))
  })
})

describe('restylesExisting', () => {
  it('restyles when the tap has not moved', () => {
    expect(restylesExisting(last, windowSpotKey('A', P), els)).toBe(true)
  })

  it('makes a new window when the user taps somewhere else', () => {
    expect(restylesExisting(last, windowSpotKey('A', { ...P, x: 2.5 }), els)).toBe(false)
  })

  it('makes a new window when there is nothing to restyle yet', () => {
    expect(restylesExisting(null, windowSpotKey('A', P), els)).toBe(false)
  })

  it('makes a new one when the window was deleted in between', () => {
    // Held down and deleted, then another style picked: restyling an id that
    // is gone would quietly do nothing.
    expect(restylesExisting(last, windowSpotKey('A', P), [])).toBe(false)
    expect(restylesExisting(last, windowSpotKey('A', P), undefined)).toBe(false)
  })
})
