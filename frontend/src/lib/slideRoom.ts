/**
 * Sliding a room along the wall of the room next to it.
 *
 * The user: "make room move along the wall of the neighbourhood room because
 * we know that not always room is located on the same line". A room added
 * through a wall lands centred behind it; real flats are rarely that tidy.
 * This is the approved first step (option 1): the room slides along the
 * neighbour wall it stands against and nothing else — the gap between the two
 * walls is kept, it stays touching the neighbour, it cannot be pushed into a
 * third room, and it snaps flush with either end of the neighbour or centred
 * on it. Turning rooms is a later, separate step.
 *
 * Pure geometry on axis-aligned footprints, all in one frame (the studio uses
 * the open room's), metres.
 */
export interface RoomBox {
  id: string
  /** Centre. */
  cx: number
  cz: number
  /** Footprint along x and z. */
  w: number
  d: number
}

export interface Slide {
  neighbour: RoomBox
  /** The axis the room moves along — the direction the shared wall runs. */
  axis: 'x' | 'z'
}

/** How far apart two walls can stand and still be one partition — the same
 *  bound lib/borrowedOpenings uses for a shared doorway. */
const MAX_GAP_M = 0.5
/** How much of the neighbour's wall the room must keep touching. */
export const MIN_SHARED_M = 0.3
/** How close to flush or centred counts as meaning it. */
const SNAP_M = 0.12

const span = (b: RoomBox, axis: 'x' | 'z') =>
  axis === 'x' ? [b.cx - b.w / 2, b.cx + b.w / 2] : [b.cz - b.d / 2, b.cz + b.d / 2]
const overlap = (a: number[], b: number[]) => Math.min(a[1], b[1]) - Math.max(a[0], b[0])
const gapBetween = (a: number[], b: number[]) => Math.max(b[0] - a[1], a[0] - b[1])

/**
 * The neighbour `room` stands against and the axis it can slide along, or
 * null for a room touching nothing. With more than one, the one it shares the
 * most wall with.
 */
export function slideAxisAgainst(room: RoomBox, others: readonly RoomBox[]): Slide | null {
  let best: (Slide & { shared: number }) | null = null
  for (const o of others) {
    if (o.id === room.id) continue
    for (const axis of ['x', 'z'] as const) {
      // Sliding along z means standing side by side in x.
      const across = axis === 'z' ? 'x' : 'z'
      const g = gapBetween(span(room, across), span(o, across))
      const shared = overlap(span(room, axis), span(o, axis))
      if (g < -0.05 || g > MAX_GAP_M || shared <= 0) continue
      if (!best || shared > best.shared) best = { neighbour: o, axis, shared }
    }
  }
  return best && { neighbour: best.neighbour, axis: best.axis }
}

/**
 * Where the room's centre ends up when asked to go to `wanted` along the
 * slide axis: kept touching the neighbour, snapped flush or centred when
 * close, and null if that would put it into another room.
 */
export function slideTo(
  room: RoomBox,
  { neighbour, axis }: Slide,
  wanted: number,
  others: readonly RoomBox[],
  /** Off for a typed figure, which means exactly that; on for a drag. */
  { snap = true }: { snap?: boolean } = {},
): { cx: number; cz: number } | null {
  const len = axis === 'x' ? room.w : room.d
  const [n0, n1] = span(neighbour, axis)
  const lo = n0 - len / 2 + MIN_SHARED_M
  const hi = n1 + len / 2 - MIN_SHARED_M
  let c = Math.min(hi, Math.max(lo, wanted))
  if (snap) {
    for (const at of [n0 + len / 2, (n0 + n1) / 2, n1 - len / 2]) {
      if (Math.abs(c - at) < SNAP_M) { c = at; break }
    }
  }
  const moved: RoomBox = axis === 'x' ? { ...room, cx: c } : { ...room, cz: c }
  for (const o of others) {
    if (o.id === room.id) continue
    if (overlap(span(moved, 'x'), span(o, 'x')) > 0.01 && overlap(span(moved, 'z'), span(o, 'z')) > 0.01) return null
  }
  return { cx: moved.cx, cz: moved.cz }
}

/** How far each end of the room stands in from the neighbour's ends, mm —
 *  0 is flush; negative is past it. */
export function slideEdges(room: RoomBox, { neighbour, axis }: Slide): { startMm: number; endMm: number } {
  const [r0, r1] = span(room, axis)
  const [n0, n1] = span(neighbour, axis)
  return { startMm: Math.round((r0 - n0) * 1000), endMm: Math.round((n1 - r1) * 1000) }
}
