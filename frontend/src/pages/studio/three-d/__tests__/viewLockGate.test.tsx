/**
 * The lock's whole mechanism: while locked, react-three-fiber's
 * `events.enabled` is false, which makes it skip raycasting entirely — so no
 * mesh in the 3D view can take a tap or a hold and no menu can open.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'

const three = vi.hoisted(() => ({
  state: { events: { enabled: true, priority: 1 } } as { events: { enabled: boolean; priority: number } },
}))
vi.mock('@react-three/fiber', () => ({
  useThree: (sel: (s: unknown) => unknown) => sel({
    set: (fn: (st: typeof three.state) => Partial<typeof three.state>) => {
      three.state = { ...three.state, ...fn(three.state) }
    },
  }),
}))

import { ViewLockGate } from '../ViewLockGate'
import { useViewLockStore } from '@/store/viewLockStore'

beforeEach(() => {
  localStorage.clear()
  three.state = { events: { enabled: true, priority: 1 } }
  useViewLockStore.setState({ locked: false })
})

describe('ViewLockGate', () => {
  it('leaves scene taps on while unlocked', () => {
    render(<ViewLockGate />)
    expect(three.state.events.enabled).toBe(true)
  })

  it('turns every scene tap off when locked, and back on when unlocked', () => {
    render(<ViewLockGate />)
    act(() => useViewLockStore.getState().toggle())
    expect(three.state.events.enabled).toBe(false)
    // The rest of the events config is kept, not replaced.
    expect(three.state.events.priority).toBe(1)
    act(() => useViewLockStore.getState().toggle())
    expect(three.state.events.enabled).toBe(true)
  })
})
