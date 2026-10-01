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

  it('is not cancelled by a second finger moving', () => {
    // Moves are watched on the window for every pointer at once. A thumb
    // resting on the screen, a palm, or the other hand starting a pinch all
    // produced pointermoves, and every one of them cancelled a hold the
    // holding finger was making perfectly still — the "sometimes it works,
    // sometimes it doesn't".
    const { onHold, t } = tracker()
    t.down(100, 100, 'x', 1)
    t.move(900, 900, 2)
    vi.advanceTimersByTime(HOLD_DELETE_MS)
    expect(onHold).toHaveBeenCalledTimes(1)
  })

  it('is still cancelled by the holding finger moving', () => {
    const { onHold, t } = tracker()
    t.down(100, 100, 'x', 1)
    t.move(900, 900, 1)
    vi.advanceTimersByTime(HOLD_DELETE_MS)
    expect(onHold).not.toHaveBeenCalled()
  })

  it('still cancels on movement when no pointer id is given', () => {
    // A mouse, or any caller that does not pass one.
    const { onHold, t } = tracker()
    t.down(100, 100, 'x')
    t.move(900, 900)
    vi.advanceTimersByTime(HOLD_DELETE_MS)
    expect(onHold).not.toHaveBeenCalled()
  })

  it('allows the drift of a finger held still for a whole second', () => {
    // The surface ring's hold, which fires reliably, allows 12 px over 460 ms
    // — 26 px per second. This one must not be stricter per unit of time than
    // that, or a press twice as long gets a fifth of the budget.
    expect(HOLD_MOVE_TOL_PX / (HOLD_DELETE_MS / 1000)).toBeGreaterThanOrEqual(12 / 0.46 * 0.7)
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
