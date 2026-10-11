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
 * it (lib/flatOpenings) — so when the NEIGHBOUR is the room being edited, the
 * leaf in its doorway is the owner's scenery leaf. The approved design: editing
 * stays with the owner, and tapping the door from the other side opens the
 * owner, as tapping any neighbouring room already does. Only when the leaf is
 * the NEAREST thing hit, the rule `SiblingPickBox` uses, so it never takes a
 * tap meant for something of the active room's standing in front of it.
 */
describe('openingTapHandler on a neighbour\'s leaf that opens its room', () => {
  const at = (nearest: boolean) => {
    const leaf = {}
    return {
      stopPropagation: vi.fn(),
      eventObject: leaf,
      intersections: [{ eventObject: nearest ? leaf : {} }],
    } as never as Parameters<ReturnType<typeof openingTapHandler>>[0]
  }

  it('opens the owner room when the leaf is the nearest hit, and keeps the tap', () => {
    const openOwner = vi.fn()
    const e = at(true)
    openingTapHandler(false, 'B', 'd1', undefined, openOwner)(e)
    expect(openOwner).toHaveBeenCalledTimes(1)
    expect((e as unknown as { stopPropagation: ReturnType<typeof vi.fn> }).stopPropagation).toHaveBeenCalled()
  })

  it('does nothing when something nearer was tapped', () => {
    const openOwner = vi.fn()
    const e = at(false)
    openingTapHandler(false, 'B', 'd1', undefined, openOwner)(e)
    expect(openOwner).not.toHaveBeenCalled()
    expect((e as unknown as { stopPropagation: ReturnType<typeof vi.fn> }).stopPropagation).not.toHaveBeenCalled()
  })

  it('never opens anything from an editable leaf', () => {
    const openOwner = vi.fn()
    openingTapHandler(true, 'B', 'd1', vi.fn(), openOwner)(at(true))
    expect(openOwner).not.toHaveBeenCalled()
  })
})
