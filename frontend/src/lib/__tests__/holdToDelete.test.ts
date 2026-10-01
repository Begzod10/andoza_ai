/**
 * Hold-to-delete shares the press with a drag, so the two properties that
 * matter are that it waits long enough not to fire mid-gesture, and that any
 * real movement hands the press back to the drag.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHoldTracker, HOLD_DELETE_MS, HOLD_MOVE_TOL_PX } from '../holdToDelete'

describe('createHoldTracker', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function tracker(holdMs = HOLD_DELETE_MS) {
    const onHold = vi.fn()
    return { onHold, t: createHoldTracker<string>({ onHold, holdMs }) }
  }

  it('fires once the finger has stayed put long enough', () => {
    const { onHold, t } = tracker()
    t.down(100, 100, 'door-1')
    vi.advanceTimersByTime(HOLD_DELETE_MS)
    expect(onHold).toHaveBeenCalledWith({ x: 100, y: 100, payload: 'door-1' })
  })

  it('has not fired a moment before', () => {
    const { onHold, t } = tracker()
    t.down(100, 100, 'x')
    vi.advanceTimersByTime(HOLD_DELETE_MS - 1)
    expect(onHold).not.toHaveBeenCalled()
  })

  it('gives the press back to a drag', () => {
    const { onHold, t } = tracker()
    t.down(100, 100, 'x')
    t.move(100 + HOLD_MOVE_TOL_PX + 1, 100)
    vi.advanceTimersByTime(HOLD_DELETE_MS * 2)
    expect(onHold).not.toHaveBeenCalled()
  })

  it('tolerates the wobble of a finger trying to hold still', () => {
    const { onHold, t } = tracker()
    t.down(100, 100, 'x')
    t.move(100 + HOLD_MOVE_TOL_PX - 1, 100)
    t.move(100, 100 + HOLD_MOVE_TOL_PX - 1)
    vi.advanceTimersByTime(HOLD_DELETE_MS)
    expect(onHold).toHaveBeenCalledTimes(1)
  })

  it('does not fire when the finger lifts early', () => {
    const { onHold, t } = tracker()
    t.down(100, 100, 'x')
    vi.advanceTimersByTime(HOLD_DELETE_MS / 2)
    expect(t.up()).toBe(false)
    vi.advanceTimersByTime(HOLD_DELETE_MS)
    expect(onHold).not.toHaveBeenCalled()
  })

  it('reports the hold so the caller can swallow the click after it', () => {
    // Otherwise the release that ends the hold also counts as a tap, and the
    // thing being deleted gets selected or placed at the same moment.
    const { t } = tracker()
    t.down(100, 100, 'x')
    vi.advanceTimersByTime(HOLD_DELETE_MS)
    expect(t.up()).toBe(true)
    // ...and only for that one release.
    t.down(100, 100, 'x')
    expect(t.up()).toBe(false)
  })

  it('carries what was held, so the right thing is deleted', () => {
    const { onHold, t } = tracker()
    t.down(10, 20, 'socket-7')
    vi.advanceTimersByTime(HOLD_DELETE_MS)
    expect(onHold.mock.calls[0][0].payload).toBe('socket-7')
  })

  it('starts over on a second press rather than stacking timers', () => {
    const { onHold, t } = tracker()
    t.down(100, 100, 'a')
    vi.advanceTimersByTime(HOLD_DELETE_MS - 100)
    t.down(200, 200, 'b')
    vi.advanceTimersByTime(HOLD_DELETE_MS - 100)
    // The first press's timer must not still be running.
    expect(onHold).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(onHold).toHaveBeenCalledTimes(1)
    expect(onHold.mock.calls[0][0].payload).toBe('b')
  })

  it('can be called off outright', () => {
    const { onHold, t } = tracker()
    t.down(100, 100, 'x')
    t.cancel()
    vi.advanceTimersByTime(HOLD_DELETE_MS * 2)
    expect(onHold).not.toHaveBeenCalled()
  })

  it('ignores movement when nothing is being held', () => {
    const { onHold, t } = tracker()
    t.move(500, 500)
    vi.advanceTimersByTime(HOLD_DELETE_MS)
    expect(onHold).not.toHaveBeenCalled()
  })

  it('waits the second that was asked for', () => {
    const { onHold, t } = tracker()
    t.down(0, 0, 'x')
    vi.advanceTimersByTime(999)
    expect(onHold).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onHold).toHaveBeenCalled()
  })
})
