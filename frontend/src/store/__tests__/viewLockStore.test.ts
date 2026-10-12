/**
 * "add a lock button to lock and unlock viewport 3d edit buttons pop up":
 * while locked, taps and holds in the 3D view open nothing; orbiting still
 * works. The state is per device and survives a reload.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readViewLock, useViewLockStore, VIEW_LOCK_KEY } from '@/store/viewLockStore'

beforeEach(() => {
  localStorage.clear()
  useViewLockStore.setState({ locked: false })
})

describe('the 3D view lock', () => {
  it('starts unlocked', () => {
    expect(readViewLock()).toBe(false)
  })

  it('toggles, and remembers it for the next load', () => {
    useViewLockStore.getState().toggle()
    expect(useViewLockStore.getState().locked).toBe(true)
    expect(readViewLock()).toBe(true)
    useViewLockStore.getState().toggle()
    expect(useViewLockStore.getState().locked).toBe(false)
    expect(readViewLock()).toBe(false)
  })

  it('reads back what was stored', () => {
    localStorage.setItem(VIEW_LOCK_KEY, '1')
    expect(readViewLock()).toBe(true)
  })

  it('still works when storage is unavailable', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(readViewLock()).toBe(false)
    expect(() => useViewLockStore.getState().toggle()).not.toThrow()
    expect(useViewLockStore.getState().locked).toBe(true)
    get.mockRestore(); set.mockRestore()
  })
})
