/**
 * The doors in the partition between a room being slid and its neighbour,
 * as spans along the wall in the flat's frame.
 *
 * Two things need them. The slide must stop where a wall's end reaches a
 * door's trim ("moving should stop when wall reaches the trim of door") — a
 * doorway is only a doorway while both walls run past it. And the dimensions
 * shown either side of a door while the room moves measure from these.
 *
 * A door can be either room's: the moving room's own (it travels with the
 * room, and must stay within the neighbour's wall) or the neighbour's (it
 * stays put, and the moving room's wall must keep covering it).
 */
import { wallLinesOf, type PlacedRoom, type WallLine } from '@/lib/borrowedOpenings'
import type { RoomBox } from '@/lib/slideRoom'

export type Span = [number, number]

/** How far from a room's footprint edge its wall line may sit and still be
 *  that edge's wall. */
const ON_EDGE_M = 0.05

/** The doors of `room`'s wall facing `other`, as spans along `axis`. */
function facingDoors(room: PlacedRoom, box: RoomBox, other: RoomBox, axis: 'x' | 'z'): Span[] {
  // Sliding along z means the two rooms stand side by side in x, so the
  // facing wall is the one at this room's x edge nearest the other.
  const across = axis === 'z' ? 'x' : 'z'
  const mine = across === 'x' ? box.cx : box.cz
  const theirs = across === 'x' ? other.cx : other.cz
  const half = (across === 'x' ? box.w : box.d) / 2
  const edge = theirs > mine ? mine + half : mine - half
  const along = (l: WallLine) => (axis === 'z' ? Math.abs(l.uZ) : Math.abs(l.uX)) > 0.99
  const onEdge = (l: WallLine) => Math.abs((across === 'x' ? l.x0M : l.z0M) - edge) < ON_EDGE_M
  const spans: Span[] = []
  for (const line of wallLinesOf(room)) {
    if (!along(line) || !onEdge(line)) continue
    const u = axis === 'z' ? line.uZ : line.uX
    const o = axis === 'z' ? line.z0M : line.x0M
    for (const el of line.elements) {
      if (el.type !== 'eshik') continue
      const a = o + (u * el.position) / 1000
      const b = a + (u * el.width) / 1000
      spans.push([Math.min(a, b), Math.max(a, b)])
    }
  }
  return spans
}

/**
 * The doors in the partition between `room` and `neighbour`: `own` are the
 * moving room's, `theirs` the neighbour's — both absolute, along `axis`.
 */
export function partitionDoorSpans(
  room: PlacedRoom, roomBox: RoomBox,
  neighbour: PlacedRoom, neighbourBox: RoomBox,
  axis: 'x' | 'z',
): { own: Span[]; theirs: Span[] } {
  return {
    own: facingDoors(room, roomBox, neighbourBox, axis),
    theirs: facingDoors(neighbour, neighbourBox, roomBox, axis),
  }
}
