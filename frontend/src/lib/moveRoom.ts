/**
 * Moving a room about the flat with X / Z arrows — the user's option A, with
 * "rooms can come away up to 500mm max".
 *
 * A room moves along one axis at a time. It never goes into another room —
 * it stops at contact; it never ends up more than 500 mm from the room
 * nearest to it, so the flat cannot fall apart into separate pieces; and a
 * drag snaps to the positions people mean: touching a neighbour at the
 * room's wall thickness, and flush with either end of a neighbour or centred
 * on it. A typed figure is exact and is not snapped.
 *
 * Pure geometry on axis-aligned footprints, metres, in one frame.
 */
import { partsOf, type RoomBox } from '@/lib/slideRoom'

/** How far a room may come away from its nearest neighbour. */
export const MAX_DETACH_M = 0.5
/** How close to a snap position counts as meaning it. */
const SNAP_M = 0.12

type Axis = 'x' | 'z'
const span = (b: RoomBox, axis: Axis): [number, number] =>
  axis === 'x' ? [b.cx - b.w / 2, b.cx + b.w / 2] : [b.cz - b.d / 2, b.cz + b.d / 2]
const overlap = (a: [number, number], b: [number, number]) => Math.min(a[1], b[1]) - Math.max(a[0], b[0])
const gapBetween = (a: [number, number], b: [number, number]) => Math.max(b[0] - a[1], a[0] - b[1])
const at = (room: RoomBox, axis: Axis, c: number): RoomBox => (axis === 'x' ? { ...room, cx: c } : { ...room, cz: c })

/** Clear distance between two rooms — their nearest parts (0 when touching
 *  or overlapping). */
function distance(a: RoomBox, b: RoomBox): number {
  let best = Infinity
  for (const pa of partsOf(a)) for (const pb of partsOf(b)) best = Math.min(best, rectDistance(pa, pb))
  return best
}
function rectDistance(a: RoomBox, b: RoomBox): number {
  const gx = Math.max(0, gapBetween(span(a, 'x'), span(b, 'x')))
  const gz = Math.max(0, gapBetween(span(a, 'z'), span(b, 'z')))
  return Math.hypot(gx, gz)
}

/** The room nearest to `room`, and the clear gap to it. */
export function nearestNeighbour(room: RoomBox, others: readonly RoomBox[]): { room: RoomBox; gapM: number } | null {
  let best: { room: RoomBox; gapM: number } | null = null
  for (const o of others) {
    if (o.id === room.id) continue
    const g = distance(room, o)
    if (!best || g < best.gapM) best = { room: o, gapM: g }
  }
  return best
}

/**
 * Where the room's centre ends up when asked to go to `wanted` along `axis`,
 * or null when it cannot move at all.
 */
export function moveAlong(
  room: RoomBox,
  axis: Axis,
  wanted: number,
  others: readonly RoomBox[],
  { snap = true, wallThicknessM = 0.2 }: { snap?: boolean; wallThicknessM?: number } = {},
): { cx: number; cz: number } | null {
  const rest = others.filter((o) => o.id !== room.id)
  const restParts = rest.flatMap(partsOf)
  const across: Axis = axis === 'x' ? 'z' : 'x'
  const len = axis === 'x' ? room.w : room.d
  const c0 = axis === 'x' ? room.cx : room.cz
  let c = wanted

  if (snap) {
    const candidates: number[] = []
    for (const o of restParts) {
      const [o0, o1] = span(o, axis)
      // Facing each other along this axis: touching at the wall thickness.
      if (overlap(span(room, across), span(o, across)) > 0) {
        candidates.push(o1 + wallThicknessM + len / 2, o0 - wallThicknessM - len / 2)
      }
      // Side by side across it: flush with either end, or centred.
      const g = gapBetween(span(room, across), span(o, across))
      if (g >= -0.05 && g <= MAX_DETACH_M) candidates.push(o0 + len / 2, (o0 + o1) / 2, o1 - len / 2)
    }
    let bestD = SNAP_M
    for (const k of candidates) {
      const d = Math.abs(k - c)
      if (d < bestD) { bestD = d; c = k }
    }
  }

  // Stop at contact with anything in the way.
  let lo = -Infinity
  let hi = Infinity
  for (const o of restParts) {
    if (overlap(span(room, across), span(o, across)) <= 0.01) continue
    const [o0, o1] = span(o, axis)
    if (o0 >= c0 + len / 2 - 1e-6) hi = Math.min(hi, o0 - len / 2)
    else if (o1 <= c0 - len / 2 + 1e-6) lo = Math.max(lo, o1 + len / 2)
  }
  c = Math.min(hi, Math.max(lo, c))

  // Stay within reach of the flat. Moving back towards where it was is always
  // allowed, so the furthest acceptable point is found between the two.
  const near = (v: number) => rest.length === 0 || (nearestNeighbour(at(room, axis, v), rest)?.gapM ?? 0) <= MAX_DETACH_M + 1e-9
  if (!near(c)) {
    if (!near(c0)) return null
    let good = c0, bad = c
    for (let i = 0; i < 40; i++) {
      const mid = (good + bad) / 2
      if (near(mid)) good = mid; else bad = mid
    }
    c = good
  }
  const moved = at(room, axis, c)
  return { cx: moved.cx, cz: moved.cz }
}
