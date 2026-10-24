/**
 * The studio saves on its own ("make autosave option and remove save
 * button"): once the user has stopped changing things for a moment, once per
 * pause rather than per change, again for anything changed while a save was
 * in flight, and again later by itself after a save that failed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAutosave, roomContentChanged, AUTOSAVE_DELAY_MS, AUTOSAVE_RETRY_MS } from '@/lib/autosave'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const settle = async () => { await vi.advanceTimersByTimeAsync(0) }

describe('autosave', () => {
  it('saves once, after the changes have paused', async () => {
    const save = vi.fn(async () => true)
    const a = createAutosave(save)
    a.changed(); a.changed()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1)
    a.changed() // still going: the clock starts again
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1)
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(1)
    a.dispose()
  })

  it('saves again for a change made while a save was in flight', async () => {
    let finish: (ok: boolean) => void = () => {}
    const save = vi.fn(() => new Promise<boolean>((r) => { finish = r }))
    const a = createAutosave(save)
    a.changed()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    expect(save).toHaveBeenCalledTimes(1)
    a.changed() // during the save
    finish(true); await settle()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    expect(save).toHaveBeenCalledTimes(2)
    a.dispose()
  })

  it('tries again by itself after a failure, and stops once it succeeds', async () => {
    const save = vi.fn(async () => false)
    const a = createAutosave(save)
    a.changed()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    expect(save).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(AUTOSAVE_RETRY_MS - 1)
    expect(save).toHaveBeenCalledTimes(1)
    save.mockResolvedValue(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(AUTOSAVE_RETRY_MS * 2)
    expect(save).toHaveBeenCalledTimes(2)
    a.dispose()
  })

  it('flushes a pending save at once when asked, and never after dispose', async () => {
    const save = vi.fn(async () => true)
    const a = createAutosave(save)
    a.changed()
    a.flush()
    await settle()
    expect(save).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2)
    expect(save).toHaveBeenCalledTimes(1)
    a.changed()
    a.dispose()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2)
    expect(save).toHaveBeenCalledTimes(1)
  })
})

describe('roomContentChanged', () => {
  // Only an edit to what is saved counts — not a view setting, not the
  // store's own bookkeeping (which is what made the room save as soon as it
  // opened, and once more after every save).
  const base = { geometry: {}, designState: {}, furniture: [], lights: [], electricals: [], surfaces: {}, name: 'a', ceilingHeight: 2700, layoutPos: null, highQuality3d: false, isDirty: false }
  it('is true for an edit', () => {
    expect(roomContentChanged(base, { ...base, designState: {} })).toBe(true)
    expect(roomContentChanged(base, { ...base, furniture: [] })).toBe(true)
    expect(roomContentChanged(base, { ...base, name: 'b' })).toBe(true)
  })
  it('is false for a view setting or a flag', () => {
    expect(roomContentChanged(base, { ...base, highQuality3d: true })).toBe(false)
    expect(roomContentChanged(base, { ...base, isDirty: true })).toBe(false)
    expect(roomContentChanged(base, base)).toBe(false)
  })
})
