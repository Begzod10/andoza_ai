/**
 * On a phone, the tap that dismisses a ring's backdrop is followed by a
 * `click` that the browser aims at whatever is under the finger NOW — the
 * backdrop is gone by then, so it lands on the wall and opens the ring
 * again ("one tap open, one tap close the same wall" did not close). A
 * mouse never does this: its click goes to the element pressed, which is
 * detached. The one click that trails a dismissal is swallowed.
 */
import { describe, expect, it } from 'vitest'
import { createTrailingClickGuard } from '@/lib/trailingClick'

describe('the click that trails a dismissal', () => {
  it('is swallowed once, within the window, and no more', () => {
    const g = createTrailingClickGuard()
    expect(g.shouldSwallow(1000)).toBe(false)
    g.arm(1000)
    expect(g.shouldSwallow(1200)).toBe(true)
    // Only the one.
    expect(g.shouldSwallow(1250)).toBe(false)
  })

  it('lets a later, deliberate tap through', () => {
    const g = createTrailingClickGuard()
    g.arm(1000)
    expect(g.shouldSwallow(1000 + 500)).toBe(false)
  })
})
