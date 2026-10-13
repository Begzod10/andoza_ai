/**
 * Resizing a rectangular room by moving one of its walls.
 *
 * The user: "add a function to edit room size also like realtime wall moving
 * and showing dimension that are changing". The approved design: drag a wall's
 * handle and that wall moves in or out while the opposite wall stays put.
 *
 *  - Openings on the moved wall go with it; openings on the two side walls
 *    stay exactly where they are in the room. In the legacy A-B-C-D rectangle
 *    every wall is measured from its MINIMUM end (A and C from −x, B and D
 *    from −z), so moving the −x or −z wall changes where the side walls start,
 *    and their openings' positions shift by the same amount to stand still.
 *  - It never shrinks past a side-wall opening, trim included, nor below 1 m.
 *  - In the flat, the moved edge stops at contact with another room and the
 *    room stays within 500 mm of its nearest one (the user's limit), the same
 *    rules as moving a room (lib/moveRoom).
 *
 * Rectangles only for now: a drawn or scanned room of more walls is left as
 * it is.
 */
import { resolveElementPositions } from '@/lib/wallPositions'
import { nearestNeighbour, MAX_DETACH_M } from '@/lib/moveRoom'
import { partsOf, type RoomBox } from '@/lib/slideRoom'
import type { RoomGeometry, WallElement } from '@/store/roomStore'

/** Which wall moves: A at −z, B at +x, C at +z, D at −x. */
export type Side = 'A' | 'B' | 'C' | 'D'

export const MIN_ROOM_MM = 1000
/** A door's or window's trim, which a wall may not be pulled past. */
const TRIM_MM = 70

/** Whether the room is a plain A-B-C-D rectangle this can resize. */
export function isResizable(g: RoomGeometry): boolean {
  const ids = g.walls.map((w) => w.id).sort().join('')
  return ids === 'ABCD'
}

const changes = (side: Side) => (side === 'B' || side === 'D' ? 'W' : 'D') as 'W' | 'D'
/** The walls that run across the change, whose lengths follow it. */
const sideWalls = (side: Side) => (changes(side) === 'W' ? ['A', 'C'] : ['B', 'D'])
/** Whether the moving wall is at the end the side walls are measured from. */
const movesStart = (side: Side) => side === 'D' || side === 'A'

/** The smallest the changing dimension may become, mm. */
export function minSizeMm(g: RoomGeometry, side: Side): number {
  let min = MIN_ROOM_MM
  for (const id of sideWalls(side)) {
    const wall = g.walls.find((w) => w.id === id)
    if (!wall) continue
    for (const el of resolveElementPositions(wall.elements, wall.length)) {
      min = Math.max(min, movesStart(side)
        // Coming in from the start: stop TRIM before the opening's start.
        ? wall.length - (el.position - TRIM_MM)
        // From the end: stop TRIM after the opening's end.
        : el.position + el.width + TRIM_MM)
    }
  }
  return Math.round(min)
}

/**
 * The room with the changing dimension set to `sizeMm` by moving `side`, and
 * how far its centre moved (metres) — the flat places rooms by their centre,
 * so the caller moves the room by this to keep the opposite wall still.
 */
export function resizeGeometry(g: RoomGeometry, side: Side, sizeMm: number): { geometry: RoomGeometry; shiftM: { dx: number; dz: number } } {
  const dim = changes(side)
  const wallW = g.walls.find((w) => w.id === 'A')?.length ?? 0
  const wallD = g.walls.find((w) => w.id === 'B')?.length ?? 0
  const before = dim === 'W' ? wallW : wallD
  const delta = sizeMm - before
  const sides = sideWalls(side)
  const walls = g.walls.map((w) => {
    if (!sides.includes(w.id)) return w
    // Pinned where they are drawn: an auto placeholder would otherwise
    // re-centre itself on the new length and walk off.
    const pinned: WallElement[] = resolveElementPositions(w.elements, w.length)
      .map((el) => ({ ...el, positionAuto: false, position: movesStart(side) ? el.position + delta : el.position }))
    return { ...w, length: sizeMm, elements: pinned }
  })
  const W = dim === 'W' ? sizeMm : wallW
  const D = dim === 'D' ? sizeMm : wallD
  const sign = side === 'B' || side === 'C' ? 1 : -1
  const half = (sign * delta) / 2 / 1000
  return {
    geometry: { ...g, walls, vertices: [[0, 0], [W, 0], [W, D], [0, D]] },
    shiftM: dim === 'W' ? { dx: half, dz: 0 } : { dx: 0, dz: half },
  }
}

type Axis = 'x' | 'z'
const axisOf = (side: Side): Axis => (side === 'B' || side === 'D' ? 'x' : 'z')
const span = (b: RoomBox, axis: Axis): [number, number] =>
  axis === 'x' ? [b.cx - b.w / 2, b.cx + b.w / 2] : [b.cz - b.d / 2, b.cz + b.d / 2]
const overlap = (a: [number, number], b: [number, number]) => Math.min(a[1], b[1]) - Math.max(a[0], b[0])
/** How close to another room's edge counts as meaning to line up with it. */
const FLUSH_SNAP_M = 0.1

/**
 * The room's footprint with the `side` edge asked to go to `wantedEdge`
 * (metres, flat frame): the opposite edge stays; at least `minM` across;
 * stopped at contact; kept within reach of the flat. A drag snaps to whole
 * centimetres and to other rooms' edges; a typed size does not.
 */
export function resizeBox(
  box: RoomBox, side: Side, wantedEdge: number, others: readonly RoomBox[],
  { minM, snap = true, mayCut }: {
    minM: number
    snap?: boolean
    /** Rooms this one may grow into — they are cut to make room
     *  (lib/clipRoom) — rather than stop at. */
    mayCut?: (roomId: string) => boolean
  },
): RoomBox | null {
  const axis = axisOf(side)
  const across: Axis = axis === 'x' ? 'z' : 'x'
  const sign = side === 'B' || side === 'C' ? 1 : -1
  const [b0, b1] = span(box, axis)
  const fixed = sign > 0 ? b0 : b1
  const current = sign > 0 ? b1 : b0
  const rest = others.filter((o) => o.id !== box.id)
  const restParts = rest.flatMap(partsOf)
  let edge = wantedEdge

  if (snap) {
    let best = FLUSH_SNAP_M
    let flush: number | null = null
    for (const o of restParts) for (const e of span(o, axis)) {
      if (Math.abs(e - edge) < best) { best = Math.abs(e - edge); flush = e }
    }
    edge = flush ?? fixed + sign * Math.round((sign * (edge - fixed)) * 100) / 100
  }
  // Not past another room standing in the way.
  for (const o of restParts) {
    if (mayCut?.(o.id)) continue
    if (overlap(span(box, across), span(o, across)) <= 0.01) continue
    const [o0, o1] = span(o, axis)
    if (sign > 0 && o0 >= current - 1e-6) edge = Math.min(edge, o0)
    if (sign < 0 && o1 <= current + 1e-6) edge = Math.max(edge, o1)
  }
  // Not smaller than allowed.
  if (sign * (edge - fixed) < minM) edge = fixed + sign * minM

  const at = (e: number): RoomBox => {
    const lo = Math.min(fixed, e), hi = Math.max(fixed, e)
    return axis === 'x' ? { ...box, cx: (lo + hi) / 2, w: hi - lo } : { ...box, cz: (lo + hi) / 2, d: hi - lo }
  }
  const near = (e: number) => rest.length === 0 || (nearestNeighbour(at(e), rest)?.gapM ?? 0) <= MAX_DETACH_M + 1e-9
  if (!near(edge)) {
    if (!near(current)) return null
    let good = current, bad = edge
    for (let i = 0; i < 40; i++) {
      const mid = (good + bad) / 2
      if (near(mid)) good = mid; else bad = mid
    }
    edge = good
  }
  return at(edge)
}
