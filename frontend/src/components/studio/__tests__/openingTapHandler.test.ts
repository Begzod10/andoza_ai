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
 * owner's scenery leaf. A tap on it opens the owner IN PLACE — the user's
 * "seamless switch" (lib/roomSwitch): the handler hands the event over, so the
 * tap can be replayed at the same point once the owner is open. Only when the
 * leaf is the nearest hit, so it never takes a tap meant for something of the
 * open room standing in front of it.
 */
describe("openingTapHandler on a neighbour's leaf", () => {
  const at = (nearest: boolean) => {
    const leaf = {}
    return {
      stopPropagation: vi.fn(),
      eventObject: leaf,
      intersections: [{ eventObject: nearest ? leaf : {} }],
    } as never as Parameters<ReturnType<typeof openingTapHandler>>[0]
  }
  const stopped = (e: unknown) => (e as { stopPropagation: ReturnType<typeof vi.fn> }).stopPropagation

  it('opens the owner with the tap itself when the leaf is the nearest hit', () => {
    const openOwner = vi.fn()
    const e = at(true)
    openingTapHandler(false, 'B', 'd1', undefined, openOwner)(e)
    expect(openOwner).toHaveBeenCalledWith(e)
    expect(stopped(e)).toHaveBeenCalled()
  })

  it('does nothing when something nearer was tapped', () => {
    const openOwner = vi.fn()
    const e = at(false)
    openingTapHandler(false, 'B', 'd1', undefined, openOwner)(e)
    expect(openOwner).not.toHaveBeenCalled()
    expect(stopped(e)).not.toHaveBeenCalled()
  })

  it('never opens a room from an editable leaf', () => {
    const openOwner = vi.fn()
    openingTapHandler(true, 'B', 'd1', vi.fn(), openOwner)(at(true))
    expect(openOwner).not.toHaveBeenCalled()
  })
})
