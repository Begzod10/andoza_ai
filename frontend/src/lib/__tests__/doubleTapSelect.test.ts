/**
 * The second tap that means "and every other wall as well".
 *
 * The properties worth pinning are the ones that would make the gesture feel
 * unreliable rather than merely wrong: a double tap must not be claimable by
 * two different buttons, and a third tap must not fire the escalation twice.
 */
import { describe, it, expect } from 'vitest'
import { isDoubleTap, nextTapRecord, DOUBLE_TAP_MS } from '../doubleTapSelect'

describe('isDoubleTap', () => {
  it('is not a double tap with nothing before it', () => {
    expect(isDoubleTap(null, 'color:#fff', 1000)).toBe(false)
  })

  it('catches a second tap on the same button', () => {
    expect(isDoubleTap({ key: 'color:#fff', at: 1000 }, 'color:#fff', 1200)).toBe(true)
  })

  it('lets a slow second tap be its own single tap', () => {
    // Someone who taps, looks at the wall, then taps again meant that wall
    // twice — not the whole room.
    expect(isDoubleTap({ key: 'color:#fff', at: 1000 }, 'color:#fff', 1000 + DOUBLE_TAP_MS)).toBe(false)
  })

  it('never spans two different buttons, however fast', () => {
    // Picking white and then immediately grey is someone changing their mind,
    // and painting the whole room grey for it would be a disaster.
    expect(isDoubleTap({ key: 'color:#fff', at: 1000 }, 'color:#333', 1010)).toBe(false)
  })

  it('refuses a clock that went backwards', () => {
    expect(isDoubleTap({ key: 'a', at: 1000 }, 'a', 900)).toBe(false)
  })
})

describe('nextTapRecord', () => {
  it('remembers a single tap so the next one can pair with it', () => {
    expect(nextTapRecord(null, 'a', 1000)).toEqual({ key: 'a', at: 1000 })
  })

  it('forgets after a double, so a third tap starts over', () => {
    // Otherwise the third tap pairs with the second and fires "all walls" a
    // second time; a stuttered triple tap would read as two double taps.
    const first = nextTapRecord(null, 'a', 1000)
    expect(isDoubleTap(first, 'a', 1100)).toBe(true)
    const second = nextTapRecord(first, 'a', 1100)
    expect(second).toBeNull()
    expect(isDoubleTap(second, 'a', 1150)).toBe(false)
  })

  it('follows the finger to a different button', () => {
    const first = nextTapRecord(null, 'a', 1000)
    expect(nextTapRecord(first, 'b', 1010)).toEqual({ key: 'b', at: 1010 })
  })

  it('walks a realistic sequence', () => {
    // tap, tap (double), tap, tap (double) — four taps, two escalations.
    let rec = null as ReturnType<typeof nextTapRecord>
    const fired: boolean[] = []
    for (const t of [0, 100, 900, 1000]) {
      fired.push(isDoubleTap(rec, 'wp:7', t))
      rec = nextTapRecord(rec, 'wp:7', t)
    }
    expect(fired).toEqual([false, true, false, true])
  })
})
