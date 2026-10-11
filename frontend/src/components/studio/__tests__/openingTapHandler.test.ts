/**
 * What a tap on a leaf does depends on whose leaf it is.
 *
 * The room being edited stops the click — otherwise it runs on to whatever is
 * behind the opening (how tapping a window once opened the ceiling's menu).
 * A neighbouring room's leaf is scenery standing in front of that room's pick
 * box, and must let the click through, or the one room you could not open by
 * tapping its door would be the one with a door.
 */
import { describe, it, expect, vi } from 'vitest'
import { openingTapHandler } from '../DoorLeaves'

function tap() {
  return { stopPropagation: vi.fn() } as never as Parameters<ReturnType<typeof openingTapHandler>>[0]
}

describe('openingTapHandler', () => {
  it('stops the click and opens the ring on an editable leaf', () => {
    const openMenu = vi.fn()
    const e = tap()
    openingTapHandler(true, 'A', 'd1', openMenu)(e)
    expect((e as unknown as { stopPropagation: ReturnType<typeof vi.fn> }).stopPropagation).toHaveBeenCalled()
    expect(openMenu).toHaveBeenCalledWith('A', 'd1', e)
  })

  it('lets the click through on a scenery leaf, so the room behind it opens', () => {
    const openMenu = vi.fn()
    const e = tap()
    openingTapHandler(false, 'A', 'd1', openMenu)(e)
    expect((e as unknown as { stopPropagation: ReturnType<typeof vi.fn> }).stopPropagation).not.toHaveBeenCalled()
    expect(openMenu).not.toHaveBeenCalled()
  })
})
