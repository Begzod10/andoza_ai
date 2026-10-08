/**
 * The ring has to open on the user's last choice.
 *
 * "a tap on wall, ceiling, floor last chosen option (color, wallpaper, tile,
 * furniture ...) should be saved as main option in order user did not waste
 * extra time scrolling to find last choice" — so these tests check the two
 * halves of that: that a pick is remembered per category, and that the ring's
 * opening turn puts it in the centre slot where a thumb already is.
 */
import { describe, it, expect } from 'vitest'
import { arcSlots } from '../arcMenu'
import {
  centreSlot,
  choiceCategory,
  lastChoiceAt,
  rememberChoicePath,
  ringOpeningOffset,
  type LastChoices,
} from '../lastChoice'

/** What `SurfaceRadialMenu` uses: three buttons square on, one faded each side. */
const SLOTS = 5

function items(...keys: string[]) {
  return keys.map((key) => ({ key }))
}

/** Twelve swatches, the shape of a real palette — far more than the arc shows. */
const PALETTE = items(...Array.from({ length: 12 }, (_, i) => `color:c${i}`))

/**
 * Which item the ring actually shows in its centre slot at a given turn.
 *
 * Asserted through `arcSlots` — the same function that draws the ring —
 * rather than by re-deriving the arithmetic here, so the test would catch an
 * offset that is off by one in the ring's own frame of reference.
 */
function centredKey(list: readonly { key: string }[], offset: number): string | null {
  const placed = arcSlots(list.length, SLOTS, offset, 82, -170, 160)
  const middle = placed.find((s) => Math.abs(s.slot - centreSlot(SLOTS)) < 1e-9)
  return middle ? list[middle.index].key : null
}

describe('where the ring opens', () => {
  it('opens exactly as it does today when nothing has been picked yet', () => {
    // The first-ever opening must be unchanged: no memory, no turn.
    expect(ringOpeningOffset(PALETTE, null, SLOTS)).toBe(0)
    expect(ringOpeningOffset(PALETTE, undefined, SLOTS)).toBe(0)
    expect(ringOpeningOffset(PALETTE, '', SLOTS)).toBe(0)
  })

  it('lands the remembered swatch in the centre slot', () => {
    for (const it_ of PALETTE) {
      const offset = ringOpeningOffset(PALETTE, it_.key, SLOTS)
      expect(centredKey(PALETTE, offset)).toBe(it_.key)
    }
  })

  it('turns backwards for an early swatch rather than running off the end', () => {
    // The ring has no ends, so reaching the first item is a short turn the
    // other way — and the offset stays inside one lap so a long session of
    // openings cannot grow it without bound.
    const offset = ringOpeningOffset(PALETTE, 'color:c0', SLOTS)
    expect(offset).toBeGreaterThanOrEqual(0)
    expect(offset).toBeLessThan(PALETTE.length)
    expect(centredKey(PALETTE, offset)).toBe('color:c0')
  })

  it('falls back to the opening position when the remembered item is gone', () => {
    // A deleted wallpaper, or a catalogue that changed under the memory. The
    // ring must not be left turned to a gap, nor silently centred on whatever
    // item inherited that position.
    expect(ringOpeningOffset(PALETTE, 'wp:deleted', SLOTS)).toBe(0)
    expect(ringOpeningOffset([], 'color:c3', SLOTS)).toBe(0)
  })

  it('does not turn a ring that already shows everything', () => {
    // Nothing to save: five or fewer items are all on the arc, and turning
    // would only move them about for no reason.
    const short = items('parket', 'kafel')
    expect(ringOpeningOffset(short, 'kafel', SLOTS)).toBe(0)
    expect(ringOpeningOffset(items('a', 'b', 'c', 'd', 'e'), 'e', SLOTS)).toBe(0)
  })
})

describe('what counts as one category', () => {
  it('keeps the last colour, the last paper and the last tile apart', () => {
    // The user named them as separate things, so picking a colour must not
    // lose which paper they had been using.
    let choices: LastChoices = {}
    choices = rememberChoicePath(choices, 'wall', ['paint'], 'color:#6D6A41')
    choices = rememberChoicePath(choices, 'wall', ['oboy'], 'wp:7')
    choices = rememberChoicePath(choices, 'wall', ['wall-kafel', 'wall-kafel:600×600'], 'wall-kafel:600×600:matt')

    expect(lastChoiceAt(choices, 'wall', ['paint'])).toBe('color:#6D6A41')
    expect(lastChoiceAt(choices, 'wall', ['oboy'])).toBe('wp:7')
    expect(lastChoiceAt(choices, 'wall', ['wall-kafel', 'wall-kafel:600×600']))
      .toBe('wall-kafel:600×600:matt')
  })

  it('keeps the surfaces apart too', () => {
    // Floor "Kafel" and wall "Kafel" are different rings with the same name.
    let choices: LastChoices = {}
    choices = rememberChoicePath(choices, 'floor', ['kafel'], 'kafel:400×400')
    choices = rememberChoicePath(choices, 'wall', ['wall-kafel'], 'wall-kafel:600×600')
    expect(lastChoiceAt(choices, 'floor', ['kafel'])).toBe('kafel:400×400')
    expect(lastChoiceAt(choices, 'wall', ['wall-kafel'])).toBe('wall-kafel:600×600')
    expect(choiceCategory('floor', ['kafel'])).not.toBe(choiceCategory('wall', ['kafel']))
  })

  it('remembers every level of the branch a pick was made through', () => {
    // So the next opening lands in one gesture: the wall ring on Kafel, its
    // ring on that size, and that one on the face.
    const choices = rememberChoicePath(
      {}, 'wall', ['wall-kafel', 'wall-kafel:300×600'], 'wall-kafel:300×600:gloss',
    )
    expect(choices).toEqual({
      'wall': 'wall-kafel',
      'wall/wall-kafel': 'wall-kafel:300×600',
      'wall/wall-kafel/wall-kafel:300×600': 'wall-kafel:300×600:gloss',
    })
  })

  it('remembers a flat ring under the surface itself', () => {
    // Skirting, cornice, door and window rings have no submenu at all.
    const choices = rememberChoicePath({}, 'cornice', [], 'cornice:LX-120')
    expect(lastChoiceAt(choices, 'cornice', [])).toBe('cornice:LX-120')
  })

  it('replaces a category rather than piling choices up', () => {
    let choices = rememberChoicePath({}, 'wall', ['paint'], 'color:#1A4228')
    choices = rememberChoicePath(choices, 'wall', ['paint'], 'color:#A85F32')
    expect(lastChoiceAt(choices, 'wall', ['paint'])).toBe('color:#A85F32')
    expect(Object.keys(choices)).toHaveLength(2) // 'wall' and 'wall/paint'
  })

  it('never mutates the map it was handed', () => {
    // It is zustand state: a store that mutated in place would not re-render.
    const before: LastChoices = { wall: 'paint' }
    rememberChoicePath(before, 'wall', ['oboy'], 'wp:3')
    expect(before).toEqual({ wall: 'paint' })
  })

  it('answers null for a ring nothing has ever been picked in', () => {
    expect(lastChoiceAt({}, 'wall', ['paint'])).toBeNull()
  })
})
