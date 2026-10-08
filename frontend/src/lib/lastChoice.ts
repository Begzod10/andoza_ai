/**
 * Where the surface ring ("aylana") should open, so the user's last choice is
 * already under their thumb.
 *
 * The ring shows three buttons at a time out of a list that can run to dozens
 * — every wall colour, every uploaded paper, every tile face. A user finishing
 * a flat picks the SAME paper for wall after wall and the same tile for a
 * bathroom's four walls, and until now each of those picks started the ring
 * back at the beginning: open the wall, turn past Rang and Oboy to Kafel, drill
 * in, turn past three sizes, drill in, turn past four faces. The choice was
 * already made; the scrolling was pure re-navigation.
 *
 * So the ring remembers what was last picked and OPENS TURNED TO IT, with that
 * item in the centre slot — the one place a tap lands without aiming.
 *
 * It deliberately does NOT reorder the list to put the last choice first. A
 * palette is navigated by position: "the dark green is two past the middle" is
 * something a hand learns after a few openings, and shuffling the set on every
 * pick would destroy that and make the ring feel different every time it
 * opened. Turning the ring costs nothing and leaves the order alone, so the
 * remembered choice is reachable AND its neighbours are still where they were.
 *
 * Nor does it change what a tap does — picking the centred item applies the
 * same finish it always did. The memory moves the ring, not the action.
 */
import { wrapArcOffset } from './arcMenu'

/**
 * The last-picked item key for each category, e.g.
 * `{ 'wall': 'oboy', 'wall/oboy': 'wp:7' }`.
 *
 * Flat rather than nested because the only question ever asked of it is "what
 * was last picked HERE", and a path string answers that in one lookup.
 */
export type LastChoices = Readonly<Record<string, string>>

/**
 * What "a category" is: a surface plus the path of parent items drilled
 * through to reach the ring being shown.
 *
 * The user named colour, wallpaper and tile as separate things, so they get
 * separate memories: the last colour does not displace the last paper, and
 * coming back to Oboy lands on the last paper even if a tile was picked in
 * between. Tile goes one level further still — the last face is remembered per
 * size, because a size and a face are two halves of one tile and neither
 * answers for the other.
 *
 * The path is built from item keys, which are code-defined constants with
 * fixed shapes (`paint`, `oboy`, `wall-kafel:600×600`), so two different paths
 * cannot join to the same string.
 */
export function choiceCategory(surface: string, trailKeys: readonly string[]): string {
  return [surface, ...trailKeys].join('/')
}

/** What was last picked in that ring, or null if nothing ever was. */
export function lastChoiceAt(
  choices: LastChoices,
  surface: string,
  trailKeys: readonly string[],
): string | null {
  return choices[choiceCategory(surface, trailKeys)] ?? null
}

/**
 * Record a pick, for the ring it was made in AND for every ring above it.
 *
 * Only a completed pick writes anything: merely drilling into Kafel to have a
 * look and backing out does not make Kafel the wall's remembered choice,
 * because the user never chose a tile. Walking the whole path on a real pick
 * is what makes the next opening land in one gesture rather than one per
 * level: the wall ring opens on Kafel, its ring on the last size, and that
 * one on the last face.
 */
export function rememberChoicePath(
  choices: LastChoices,
  surface: string,
  trailKeys: readonly string[],
  itemKey: string,
): LastChoices {
  const next = { ...choices }
  for (let i = 0; i <= trailKeys.length; i++) {
    // At each level, the thing chosen is the next step down the path — and at
    // the deepest level, the leaf the user actually tapped.
    next[choiceCategory(surface, trailKeys.slice(0, i))] = trailKeys[i] ?? itemKey
  }
  return next
}

/** The slot a remembered item is turned to: the middle of the visible window,
 *  which is where a thumb already is. */
export function centreSlot(slots: number): number {
  return (slots - 1) / 2
}

/**
 * How far to turn the ring when it opens, in slots, so `rememberedKey` sits in
 * the centre slot.
 *
 * Zero — the position the ring has always opened at — whenever there is
 * nothing to turn to:
 *
 *  - nothing remembered yet, so the ring behaves exactly as it did before;
 *  - the whole list fits on the arc, so there is no scrolling to save and the
 *    remembered item is already in plain sight;
 *  - the remembered item is GONE. A wallpaper gets deleted and a catalogue
 *    gets revised, and a stale key must not leave the ring turned to a gap or
 *    silently centred on whatever item inherited that position. Falling back
 *    to the opening position is the one safe answer, and the stale key can
 *    stay in storage: it costs nothing and the item may well come back.
 */
export function ringOpeningOffset(
  items: readonly { key: string }[],
  rememberedKey: string | null | undefined,
  slots: number,
): number {
  if (!rememberedKey) return 0
  if (items.length <= slots) return 0
  const index = items.findIndex((it) => it.key === rememberedKey)
  if (index < 0) return 0
  // `arcSlots` places the item whose turn-count position is `key` at
  // `key - offset`, and asks the list for `key % count`. Using `key = index`
  // puts that very item at `index - offset`, so this offset lands it dead
  // centre. Wrapped to one lap because the ring has no ends — turning
  // backwards past the first item is as valid as forwards past the last, and
  // this keeps the number small either way.
  return wrapArcOffset(index - centreSlot(slots), items.length)
}
