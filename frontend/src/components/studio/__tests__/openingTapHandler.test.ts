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

/**
 * A doorway through a shared partition is drawn once, by the room that owns
 * it (lib/flatOpenings), so from the neighbour's side the leaf in it is the
 * owner's scenery leaf. Tapping it used to open the owner room — which reads
 * as the page reloading on every tap ("after tapping on door from behind,
 * page is reloading every time"). It now stays in the room being edited.
 */
describe('openingTapHandler on a neighbour\'s leaf', () => {
  it('does not take the user to another room when it is the nearest hit', () => {
    const leaf = {}
    const e = {
      stopPropagation: vi.fn(),
      eventObject: leaf,
      intersections: [{ eventObject: leaf }],
    } as never as Parameters<ReturnType<typeof openingTapHandler>>[0]
    const openMenu = vi.fn()
    const openOwnerRoom = vi.fn()
    // Called the way SiblingRoomScene used to call it, with a way to open the
    // owner room on the end — which must never be used.
    ;(openingTapHandler as (...a: unknown[]) => (ev: typeof e) => void)(false, 'B', 'd1', openMenu, openOwnerRoom)(e)
    expect(openOwnerRoom).not.toHaveBeenCalled()
    expect(openMenu).not.toHaveBeenCalled()
    expect((e as unknown as { stopPropagation: ReturnType<typeof vi.fn> }).stopPropagation).not.toHaveBeenCalled()
  })
})
