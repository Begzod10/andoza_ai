/**
 * Undo/redo (zundo `temporal` middleware) integration tests.
 *
 * These exercise the *composition* — partialize + equality + handleSet +
 * the loadRoom/loadDraftState clear() calls — rather than zundo's own
 * undo/redo mechanics (already covered upstream). The two failure modes
 * this guards against are exactly the ones called out in roomStore.ts's
 * comments: (1) a field left out of partializeTemporal silently not
 * reverting on undo, and (2) two set() calls from one user action (paint +
 * applySurface) landing as two separate undo steps instead of one.
 *
 * Fake timers throughout: the coalescing throttle (leadingThrottle) keys
 * off Date.now(), and tests run back-to-back in real time fast enough to
 * all land in the same throttle window otherwise — which would make calls
 * meant to be *separate* steps silently coalesce, and would carry a
 * throttle "lastCall" timestamp across into the next test.
 */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { useRoomStore, UNDO_COALESCE_MS } from '../roomStore'

/** Strictly past the coalescing window, so the next tracked call is always
 *  treated as a new, separate undo step rather than merged into the last. */
function stepPastCoalesceWindow() {
  vi.advanceTimersByTime(UNDO_COALESCE_MS + 50)
}

// leadingThrottle's `lastCall` is a closure variable private to the store
// module — it persists across every test in this file (there's only ever
// one store instance) and holds whatever fake-clock value the *previous*
// test last advanced to. `vi.useFakeTimers()` does not reset the clock to
// continue from there — each fresh call snapshots real wall-clock time,
// which can come out *behind* a previous test's advanced fake time. Giving
// each test its own far-future, strictly-increasing epoch sidesteps that
// entirely: `now` is always guaranteed larger than any `lastCall` a prior
// test could have left behind.
let testEpoch = 0

beforeEach(() => {
  vi.useFakeTimers()
  testEpoch += 10_000_000
  vi.setSystemTime(testEpoch)
  useRoomStore.getState().resetRoom()
  useRoomStore.temporal.getState().clear()
  // Clears resetRoom's own throttle timestamp so the first tracked call in
  // each test always lands in a fresh window, independent of test order.
  stepPastCoalesceWindow()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('undo/redo — tracked fields', () => {
  it('reverts a wall-color change on undo', () => {
    useRoomStore.getState().setWallCovering('A', { kind: 'paint', color: '#FF0000' })
    expect(useRoomStore.getState().designState.wallCoverings.A).toEqual({ kind: 'paint', color: '#FF0000' })

    useRoomStore.temporal.getState().undo()

    expect(useRoomStore.getState().designState.wallCoverings.A).toBeUndefined()
  })

  it('reapplies the change on redo after an undo', () => {
    useRoomStore.getState().setWallCovering('A', { kind: 'paint', color: '#FF0000' })
    useRoomStore.temporal.getState().undo()
    useRoomStore.temporal.getState().redo()

    expect(useRoomStore.getState().designState.wallCoverings.A).toEqual({ kind: 'paint', color: '#FF0000' })
  })

  it('dropping a new change after undo clears the redo stack', () => {
    useRoomStore.getState().setWallCovering('A', { kind: 'paint', color: '#FF0000' })
    useRoomStore.temporal.getState().undo()

    stepPastCoalesceWindow()
    useRoomStore.getState().setWallCovering('A', { kind: 'paint', color: '#00FF00' })

    expect(useRoomStore.temporal.getState().futureStates.length).toBe(0)
    // redo() should now be a no-op — nothing to redo into
    useRoomStore.temporal.getState().redo()
    expect(useRoomStore.getState().designState.wallCoverings.A).toEqual({ kind: 'paint', color: '#00FF00' })
  })
})

describe('undo/redo — untracked fields never enter history', () => {
  it('setSunHour alone pushes no history entry', () => {
    useRoomStore.getState().setSunHour(14)
    expect(useRoomStore.temporal.getState().pastStates.length).toBe(0)
  })

  it('markSaved/isDirty toggling alone pushes no history entry', () => {
    useRoomStore.getState().placeFurniture({ id: 'f1', furniture_id: 'couch_84', x: 0, y: 0, rotation: 0 })
    useRoomStore.temporal.getState().clear() // isolate the next call
    stepPastCoalesceWindow()
    useRoomStore.getState().markSaved()
    expect(useRoomStore.temporal.getState().pastStates.length).toBe(0)
  })
})

describe('undo/redo — one user action, one undo step', () => {
  it('coalesces setWallCovering + applySurface (the paint+link pair) into a single step', () => {
    // Mirrors what AddObjectSheet/DesignPanel actually do when a user picks
    // a real do'kon paint: two back-to-back store calls for one click, well
    // inside the coalescing window (no time advance between them).
    useRoomStore.getState().setWallCovering('A', { kind: 'paint', color: '#0000FF' })
    useRoomStore.getState().applySurface('A', 'material-123')

    expect(useRoomStore.getState().designState.wallCoverings.A).toEqual({ kind: 'paint', color: '#0000FF' })
    expect(useRoomStore.getState().surfaces.A).toBe('material-123')

    useRoomStore.temporal.getState().undo()

    // Both halves of the paired action must revert together — a
    // half-reverted state (new color, stale material link, or vice versa)
    // would mean the smeta engine prices the wrong material for what the
    // wall now visually shows.
    expect(useRoomStore.getState().designState.wallCoverings.A).toBeUndefined()
    expect(useRoomStore.getState().surfaces.A).toBeUndefined()
  })

  it('two edits separated by real think-time still land as two separate undo steps', () => {
    useRoomStore.getState().setWallCovering('A', { kind: 'paint', color: '#0000FF' })
    stepPastCoalesceWindow()
    useRoomStore.getState().setWallCovering('B', { kind: 'paint', color: '#00FF00' })

    useRoomStore.temporal.getState().undo()
    // Only the second edit should have reverted — the first is a separate step
    expect(useRoomStore.getState().designState.wallCoverings.B).toBeUndefined()
    expect(useRoomStore.getState().designState.wallCoverings.A).toEqual({ kind: 'paint', color: '#0000FF' })
  })
})

describe('undo/redo — loadRoom/loadDraftState reset history', () => {
  it('loadDraftState clears any prior history', () => {
    useRoomStore.getState().setWallCovering('A', { kind: 'paint', color: '#FF0000' })
    expect(useRoomStore.temporal.getState().pastStates.length).toBeGreaterThan(0)

    useRoomStore.getState().loadDraftState({})

    expect(useRoomStore.temporal.getState().pastStates.length).toBe(0)
    expect(useRoomStore.temporal.getState().futureStates.length).toBe(0)
  })

  it('loadRoom clears any prior history', () => {
    useRoomStore.getState().setWallCovering('A', { kind: 'paint', color: '#FF0000' })
    expect(useRoomStore.temporal.getState().pastStates.length).toBeGreaterThan(0)

    useRoomStore.getState().loadRoom({ id: 'room-1' } as Parameters<
      ReturnType<typeof useRoomStore.getState>['loadRoom']
    >[0])

    expect(useRoomStore.temporal.getState().pastStates.length).toBe(0)
  })
})

describe('undo/redo — size cap', () => {
  it('caps the history stack at the configured limit', () => {
    for (let i = 0; i < 60; i++) {
      useRoomStore.getState().placeFurniture({
        id: `f${i}`, furniture_id: 'couch_84', x: i, y: 0, rotation: 0,
      })
      stepPastCoalesceWindow() // each placement is its own deliberate step
    }
    expect(useRoomStore.temporal.getState().pastStates.length).toBeLessThanOrEqual(50)
  })
})
