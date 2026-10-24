/**
 * Where a group of furniture can stand, as a whole.
 *
 * The AI design names pieces by role; pieces that belong together are placed together: a sofa
 * with its back on a wall, the coffee table in front of it, armchairs at its ends turned in, a TV
 * across the room; a dining table on open floor with chairs round it facing it; a bed with its head
 * on a wall and room to get in on both sides; a desk with its chair; wardrobes whose doors open.
 *
 * `groupCandidates` gives every arrangement of one group that fits the room as it stands (inside
 * the walls, clear of what is already there, of door swings and, for tall pieces, of windows,
 * each piece keeping the floor it needs to be used), best first. It does not check the walkway
 * from the door; the caller does that and takes the first candidate that passes.
 *
 * World frame: metres, origin at the room's centre. A piece's front is (sin, cos) of its rotation.
 */
import { blocksOpening, overlaps, WALL_GAP, type Rect, type RoomModel, type WallInfo } from './aiDesignLayout'
import type { FurnitureRole, GroupId } from './furnitureRole'
import { doorEntries, type Pt } from './walkway'

export interface Piece { id: string; name: string; role: FurnitureRole; w: number; d: number; tall: boolean }
export interface Placed { piece: Piece; rect: Rect }
export interface GroupCandidate {
  placed: Placed[]
  /** Where a person must be able to walk to for the group to be usable. */
  usePoints: Pt[]
  /** Pieces of the group this arrangement leaves out. */
  dropped: Piece[]
  score: number
}

/** Gap kept between a piece and what was there before it (as `furnitureSpot` keeps), metres. */
const MARGIN = 0.08
/** Gap between the back of the coffee table and the front of the sofa: within 0.40-0.45, metres. */
const COFFEE_GAP = 0.42
/** How far ahead of the sofa's front line an armchair's centre stands, and the gap beside the sofa's end, tried in turn. */
const ARMCHAIR_AHEAD = [0.3, 0.2, 0.4]
const ARMCHAIR_SIDE_GAP = [0.1, 0.2, 0.3]
/** How far a chair slides under the table edge, and the floor kept free behind it. */
const CHAIR_TUCK = 0.1
const CHAIR_BACK = 0.6
/** Floor kept free beside and at the foot of a bed, and in front of a wardrobe or shelf. */
const BED_CLEAR = 0.6
const STORAGE_FRONT = 0.7
const NIGHTSTAND_GAP = 0.05
/** Use points: how far out in front of a sofa / wardrobe, behind a chair, beside a bed. */
const FRONT_USE = 0.5
const BACK_USE = 0.4
const SIDE_USE = 0.4
/** The sofa's use point stands beside the coffee table, this far out from its end, metres. */
const COFFEE_SIDE_USE = 0.4
/** Steps: along a wall, and over the free floor for a dining table. */
const SLIDE_STEP = 0.25
const FLOOR_STEP = 0.25
/** A dining table this close to a window gets the window bonus, metres. */
const WINDOW_NEAR = 1.5
/** Score: per optional piece left out; for a sofa or bed on a wall that has a door. */
const DROP_PENALTY = 2
const DOOR_WALL_PENALTY = 2
/** Fewer chairs at the same table spot rank just below more chairs there, but above any other spot. */
const CHAIR_PENALTY = 1e-4
/** At most this many dining candidates per chair count, best first. */
const MAX_DINING = 12

const ALL_RULES = { doors: true, windows: true }
const DOORS_ONLY = { doors: true, windows: false }

/** Chairs a dining table seats, from its long side. */
export function chairCount(tableLongSide: number): 2 | 4 | 6 {
  return tableLongSide >= 1.6 - 1e-9 ? 6 : tableLongSide >= 1.1 - 1e-9 ? 4 : 2
}

// ---- geometry -------------------------------------------------------------------------------

const frontOf = (rotation: number): Pt => [Math.sin(rotation), Math.cos(rotation)]
const rightOf = (rotation: number): Pt => [Math.cos(rotation), -Math.sin(rotation)]

/** The point `fwd` ahead of a rect's centre (negative: behind) and `side` to its right. */
function offset(r: Rect, fwd: number, side = 0): Pt {
  const f = frontOf(r.rotation), s = rightOf(r.rotation)
  return [r.x + f[0] * fwd + s[0] * side, r.z + f[1] * fwd + s[1] * side]
}

/** A footprint standing with its back on `wall`, `along` metres from the wall's midpoint, front into the room. */
function atWall(wall: WallInfo, w: number, d: number, along: number): Rect {
  const out = d / 2 + WALL_GAP
  return {
    x: wall.midX + wall.nx * out + wall.dirX * along,
    z: wall.midZ + wall.nz * out + wall.dirZ * along,
    w, d, rotation: Math.atan2(wall.nx, wall.nz),
  }
}

/** The rotation that turns a piece at `from` to face `to`. */
const facing = (from: Pt, to: Pt) => Math.atan2(to[0] - from[0], to[1] - from[1])

/** Offsets along a wall for a piece `w` wide: the middle first, then out to both ends. */
function alongs(wall: WallInfo, w: number, around = 0): number[] {
  const reach = wall.length / 2 - w / 2 - WALL_GAP
  if (reach < -1e-9) return []
  const out = [around]
  for (let k = 1; k * SLIDE_STEP <= reach * 2 + 1e-9; k++) out.push(around + k * SLIDE_STEP, around - k * SLIDE_STEP)
  out.push(reach, -reach)
  return [...new Set(out.filter((a) => Math.abs(a) <= reach + 1e-9).map((a) => Math.round(a * 1e6) / 1e6))]
}

/** Overlap test with a cheap distance check first: most pairs are far apart. */
function hit(a: Rect, b: Rect, margin: number): boolean {
  const reach = (Math.hypot(a.w, a.d) + Math.hypot(b.w, b.d)) / 2 + 1.5 * margin
  if (Math.abs(a.x - b.x) > reach || Math.abs(a.z - b.z) > reach) return false
  return overlaps(a, b, margin)
}

/** A strip of floor `depth` deep in front of (fwd = 1) or behind (fwd = -1) a footprint, as wide as it. */
const strip = (r: Rect, fwd: 1 | -1, depth: number): Rect => {
  const [x, z] = offset(r, fwd * (r.d / 2 + depth / 2))
  return { x, z, w: r.w, d: depth, rotation: r.rotation }
}
/** A strip of floor `depth` wide beside a footprint (side = 1: its right), as long as it. */
const sideStrip = (r: Rect, side: 1 | -1, depth: number): Rect => {
  const [x, z] = offset(r, 0, side * (r.w / 2 + depth / 2))
  return { x, z, w: depth, d: r.d, rotation: r.rotation }
}

// ---- the rules a whole arrangement keeps ------------------------------------------------------

/** The floor a placed piece needs to be used, and which of its group's pieces may stand on it. */
function clearancesOf(p: Placed): { zones: Rect[]; allows: (other: Placed) => boolean } {
  const r = p.rect
  switch (p.piece.role) {
    case 'dining_chair': case 'desk_chair':
      return { zones: [strip(r, -1, CHAIR_BACK)], allows: () => false }
    case 'bed':
      return { zones: [sideStrip(r, 1, BED_CLEAR), sideStrip(r, -1, BED_CLEAR), strip(r, 1, BED_CLEAR)], allows: (o) => o.piece.role === 'nightstand' }
    case 'wardrobe': case 'shelf':
      return { zones: [strip(r, 1, STORAGE_FRONT)], allows: () => false }
    default:
      return { zones: [], allows: () => false }
  }
}

/** A chair may slide under its table. */
function tucked(a: Placed, b: Placed): boolean {
  const pair = [a.piece.role, b.piece.role].sort().join('+')
  return pair === 'dining_chair+dining_table' || pair === 'desk+desk_chair'
}

interface Ctx { model: RoomModel; taken: Rect[]; doors: Pt[]; windows: Pt[] }

/** Can `next` join `placed`: inside, clear of what is taken, of the openings, of the group, and every piece's floor kept? */
function fits(ctx: Ctx, placed: Placed[], next: Placed): boolean {
  const { model, taken } = ctx
  const r = next.rect
  if (next.piece.role === 'rug') return true
  if (!model.inside(r)) return false
  if (taken.some((t) => hit(r, t, MARGIN))) return false
  if (blocksOpening(r, next.piece.tall, model, ALL_RULES)) return false
  for (const p of placed) {
    if (p.piece.role === 'rug') continue
    if (!tucked(p, next) && hit(r, p.rect, 0)) return false
    // The new piece must not stand on the floor an earlier piece needs...
    const c = clearancesOf(p)
    if (!c.allows(next) && c.zones.some((z) => hit(z, r, 0))) return false
  }
  // ...and its own floor must be in the room and free.
  const own = clearancesOf(next)
  for (const z of own.zones) {
    if (!model.inside(z) || taken.some((t) => hit(z, t, 0))) return false
    if (blocksOpening(z, false, model, DOORS_ONLY)) return false // a door must not swing into it
    if (placed.some((p) => p.piece.role !== 'rug' && !own.allows(p) && hit(z, p.rect, 0))) return false
  }
  return true
}

/** Adds the pieces one after another; null as soon as one does not fit. */
function build(ctx: Ctx, base: Placed[], next: Placed[]): Placed[] | null {
  const out = [...base]
  for (const p of next) {
    if (!fits(ctx, out, p)) return null
    out.push(p)
  }
  return out
}

const nearestDoor = (ctx: Ctx, p: Pt) => (ctx.doors.length ? Math.min(...ctx.doors.map((d) => Math.hypot(d[0] - p[0], d[1] - p[1]))) : 0)
const blocksWindow = (ctx: Ctx, placed: Placed[]) =>
  placed.some((p) => p.piece.role !== 'rug' && ctx.model.clear.some((z) => z.kind === 'window' && hit(p.rect, z.rect, 0)))
const wallHas = (ctx: Ctx, wall: WallInfo, kind: 'door' | 'window') => ctx.model.openings.some((o) => o.wallId === wall.id && o.kind === kind)

/** The usual score of a group against a wall: away from the door, not in front of a window, on a long wall. */
function wallScore(ctx: Ctx, wall: WallInfo, anchor: Rect, placed: Placed[], dropped: number, avoidDoorWall: boolean): number {
  return nearestDoor(ctx, [anchor.x, anchor.z]) + (blocksWindow(ctx, placed) ? 0 : 1) + wall.length / 10
    - (avoidDoorWall && wallHas(ctx, wall, 'door') ? DOOR_WALL_PENALTY : 0) - DROP_PENALTY * dropped
}

/**
 * How many of each kind of optional piece to keep: every combination from all of them down to none,
 * the fullest first. Optional pieces drop one at a time (two armchairs, then one, then none).
 */
function countSets(maxes: number[]): number[][] {
  let sets: number[][] = [[]]
  for (const max of maxes) sets = sets.flatMap((s) => Array.from({ length: max + 1 }, (_, n) => [...s, max - n]))
  const total = (s: number[]) => s.reduce((a, b) => a + b, 0)
  return sets.sort((a, b) => total(b) - total(a))
}

/** A small probe at a point: is it inside the room, and clear of the pieces? */
const probe = (p: Pt): Rect => ({ x: p[0], z: p[1], w: 0.02, d: 0.02, rotation: 0 })
const pointFree = (ctx: Ctx, p: Pt, placed: Placed[]) =>
  ctx.model.inside(probe(p)) && !placed.some((q) => q.piece.role !== 'rug' && hit(probe(p), q.rect, 0))

/** Places each piece against the first wall (longest first) that has room for it; the rest are dropped. */
function alongWalls(ctx: Ctx, base: Placed[], pieces: Piece[]): { placed: Placed[]; dropped: Piece[] } {
  const walls = [...ctx.model.walls].sort((a, b) => b.length - a.length)
  let placed = base
  const dropped: Piece[] = []
  for (const piece of pieces) {
    let done = false
    for (const wall of walls) {
      for (const a of alongs(wall, piece.w)) {
        const next = build(ctx, placed, [{ piece, rect: atWall(wall, piece.w, piece.d, a) }])
        if (next) { placed = next; done = true; break }
      }
      if (done) break
    }
    if (!done) dropped.push(piece)
  }
  return { placed, dropped }
}

/** Use points for storage pieces: 0.5 m out in front of each. */
const storageUse = (placed: Placed[]): Pt[] =>
  placed.filter((p) => p.piece.role === 'wardrobe' || p.piece.role === 'shelf').map((p) => offset(p.rect, p.rect.d / 2 + FRONT_USE))

/** A group whose anchor piece is missing: every piece simply goes against a wall. */
function looseCandidate(ctx: Ctx, pieces: Piece[]): GroupCandidate[] {
  const { placed, dropped } = alongWalls(ctx, [], pieces.filter((p) => p.role !== 'rug'))
  if (placed.length === 0) return []
  return [{ placed, usePoints: storageUse(placed), dropped: [...dropped, ...pieces.filter((p) => p.role === 'rug')], score: -DROP_PENALTY * dropped.length }]
}

/** Splits a group's pieces: the first of `role`, the other pieces of that role, and the rest. */
function take(pieces: Piece[], role: FurnitureRole, max = 1): { got: Piece[]; rest: Piece[] } {
  const got: Piece[] = [], rest: Piece[] = []
  for (const p of pieces) (p.role === role && got.length < max ? got : rest).push(p)
  return { got, rest }
}

// ---- lounge ---------------------------------------------------------------------------------

/** The wall straight ahead of a point looking along `dir`, and how far along it the line meets it. */
function wallAhead(model: RoomModel, from: Pt, dir: Pt): { wall: WallInfo; along: number } | null {
  let best: { wall: WallInfo; along: number; t: number } | null = null
  const cross = (a: Pt, b: Pt) => a[0] * b[1] - a[1] * b[0]
  for (const wall of model.walls) {
    if (wall.nx * dir[0] + wall.nz * dir[1] > -0.5) continue // only a wall that faces back at us
    const wd: Pt = [wall.dirX, wall.dirZ]
    const den = cross(dir, wd)
    if (Math.abs(den) < 1e-9) continue
    const m: Pt = [wall.midX - from[0], wall.midZ - from[1]]
    const t = cross(m, wd) / den, s = cross(m, dir) / den
    if (t > 0 && Math.abs(s) <= wall.length / 2 + 1e-6 && (!best || t < best.t)) best = { wall, along: s, t }
  }
  return best
}

function placeLounge(ctx: Ctx, pieces: Piece[]): GroupCandidate[] {
  const sofaSplit = take(pieces, 'sofa')
  const sofa = sofaSplit.got[0]
  if (!sofa) return looseCandidate(ctx, pieces)
  const coffeeSplit = take(sofaSplit.rest, 'coffee_table')
  const armSplit = take(coffeeSplit.rest, 'armchair', 2)
  const tvSplit = take(armSplit.rest, 'tv_unit')
  const coffee = coffeeSplit.got[0]
  const arms = armSplit.got, tvs = tvSplit.got
  const extra = tvSplit.rest

  const out: GroupCandidate[] = []
  for (const wall of ctx.model.walls) {
    for (const [nArms, nTv] of countSets([arms.length, tvs.length])) {
      for (const a of alongs(wall, sofa.w)) {
        const s: Placed = { piece: sofa, rect: atWall(wall, sofa.w, sofa.d, a) }
        let placed = build(ctx, [], [s])
        if (!placed) continue
        let focus: Pt = offset(s.rect, s.rect.d / 2 + 1)
        if (coffee) {
          const [x, z] = offset(s.rect, sofa.d / 2 + COFFEE_GAP + coffee.d / 2)
          placed = build(ctx, placed, [{ piece: coffee, rect: { x, z, w: coffee.w, d: coffee.d, rotation: s.rect.rotation } }])
          if (!placed) continue
          focus = [x, z]
        }
        if (nArms) {
          placed = placeArmchairs(ctx, placed, s.rect, arms.slice(0, nArms), focus)
          if (!placed) continue
        }
        if (nTv) {
          placed = placeTv(ctx, placed, s.rect, tvs[0])
          if (!placed) continue
        }
        const rest = alongWalls(ctx, placed, extra)
        const dropped = [...arms.slice(nArms), ...tvs.slice(nTv), ...rest.dropped]
        out.push({
          placed: rest.placed,
          usePoints: [sofaUsePoint(ctx, s.rect, coffee, rest.placed), ...storageUse(rest.placed)],
          dropped,
          score: wallScore(ctx, wall, s.rect, rest.placed, dropped.length, true),
        })
        break // one arrangement per wall and set: the first along the wall that fits
      }
    }
  }
  return out
}

/**
 * Where a person stands to use the sofa: 0.5 m out, beside the coffee table (not on it), on the side
 * that is in the room and clear, the one nearer the room's middle when both are. Straight out in
 * front when there is no coffee table.
 */
function sofaUsePoint(ctx: Ctx, sofa: Rect, coffee: Piece | undefined, placed: Placed[]): Pt {
  const fwd = sofa.d / 2 + FRONT_USE
  if (!coffee) return offset(sofa, fwd)
  const { box } = ctx.model
  const mid: Pt = [(box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2]
  const sides = [1, -1].map((s) => offset(sofa, fwd, s * (coffee.w / 2 + COFFEE_SIDE_USE)))
  const near = (p: Pt) => Math.hypot(p[0] - mid[0], p[1] - mid[1])
  const free = sides.filter((p) => pointFree(ctx, p, placed))
  return (free.length ? free : sides).sort((a, b) => near(a) - near(b))[0]
}

/** One armchair at each end of the sofa (or one, at whichever end fits), a little ahead, turned to the focus. */
function placeArmchairs(ctx: Ctx, base: Placed[], sofa: Rect, arms: Piece[], focus: Pt): Placed[] | null {
  const ends: Array<1 | -1> = [1, -1]
  const tryEnd = (placed: Placed[], arm: Piece, side: 1 | -1): Placed[] | null => {
    for (const ahead of ARMCHAIR_AHEAD) {
      for (const gap of ARMCHAIR_SIDE_GAP) {
        const c = offset(sofa, sofa.d / 2 + ahead, side * (sofa.w / 2 + gap + arm.w / 2))
        // Turned straight at the focus, but never more than a quarter turn from the sofa's own facing.
        let turn = facing(c, focus) - sofa.rotation
        turn = Math.atan2(Math.sin(turn), Math.cos(turn))
        turn = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, turn))
        const next = build(ctx, placed, [{ piece: arm, rect: { x: c[0], z: c[1], w: arm.w, d: arm.d, rotation: sofa.rotation + turn } }])
        if (next) return next
      }
    }
    return null
  }
  if (arms.length === 2) {
    const one = tryEnd(base, arms[0], 1)
    return one && tryEnd(one, arms[1], -1)
  }
  for (const side of ends) {
    const next = tryEnd(base, arms[0], side)
    if (next) return next
  }
  return null
}

/** The TV on the wall across from the sofa, as near the sofa's axis as it can be, facing back. */
function placeTv(ctx: Ctx, base: Placed[], sofa: Rect, tv: Piece): Placed[] | null {
  const ahead = wallAhead(ctx.model, [sofa.x, sofa.z], frontOf(sofa.rotation))
  if (!ahead) return null
  for (const a of alongs(ahead.wall, tv.w, ahead.along)) {
    const next = build(ctx, base, [{ piece: tv, rect: atWall(ahead.wall, tv.w, tv.d, a) }])
    if (next) return next
  }
  return null
}

// ---- dining ---------------------------------------------------------------------------------

/**
 * Chairs round a table: pairs along the long sides, square to the edge, then one at each end facing
 * the centre; each tucked in.
 */
function chairsAround(table: Rect, chair: Piece, count: number): Placed[] {
  // Work in the table's frame: `long` along its long side, `cross` across it.
  const longW = table.w >= table.d
  const L = Math.max(table.w, table.d), S = Math.min(table.w, table.d)
  // Each seat in the table's frame, and the point it looks at: straight across for a long side, the centre for an end.
  const out: Array<[Pt, Pt]> = []
  const reach = chair.d / 2 - CHAIR_TUCK
  const sideAt = (along: number, side: 1 | -1): [Pt, Pt] =>
    longW ? [[along, side * (S / 2 + reach)], [along, 0]] : [[side * (S / 2 + reach), along], [0, along]]
  const endAt = (side: 1 | -1): [Pt, Pt] => [longW ? [side * (L / 2 + reach), 0] : [0, side * (L / 2 + reach)], [0, 0]]
  if (count === 2) out.push(sideAt(0, 1), sideAt(0, -1))
  else {
    out.push(sideAt(L / 4, 1), sideAt(-L / 4, 1), sideAt(L / 4, -1), sideAt(-L / 4, -1))
    if (count === 6) out.push(endAt(1), endAt(-1))
  }
  // Local (right, front) of the table to world.
  const r = rightOf(table.rotation), f = frontOf(table.rotation)
  const world = ([u, v]: Pt): Pt => [table.x + r[0] * u + f[0] * v, table.z + r[1] * u + f[1] * v]
  return out.map(([seat, look]) => {
    const c = world(seat)
    return { piece: chair, rect: { x: c[0], z: c[1], w: chair.w, d: chair.d, rotation: facing(c, world(look)) } }
  })
}

/** The middle of the floor that is still free. */
function freeCentre(ctx: Ctx): Pt {
  const { box } = ctx.model
  let sx = 0, sz = 0, n = 0
  for (let x = box.minX + FLOOR_STEP / 2; x < box.maxX; x += FLOOR_STEP) {
    for (let z = box.minZ + FLOOR_STEP / 2; z < box.maxZ; z += FLOOR_STEP) {
      const r = { x, z, w: FLOOR_STEP, d: FLOOR_STEP, rotation: 0 }
      if (ctx.model.inside(r) && !ctx.taken.some((t) => hit(r, t, 0))) { sx += x; sz += z; n++ }
    }
  }
  return n ? [sx / n, sz / n] : [(box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2]
}

/** Grid points over the room's box, every FLOOR_STEP, laid out from its centre so the middle is one of them. */
function floorGrid(model: RoomModel): Pt[] {
  const { minX, maxX, minZ, maxZ } = model.box
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2
  const nx = Math.floor((maxX - minX) / 2 / FLOOR_STEP), nz = Math.floor((maxZ - minZ) / 2 / FLOOR_STEP)
  const out: Pt[] = []
  for (let i = -nx; i <= nx; i++) for (let j = -nz; j <= nz; j++) out.push([cx + i * FLOOR_STEP, cz + j * FLOOR_STEP])
  return out
}

function placeDining(ctx: Ctx, pieces: Piece[]): GroupCandidate[] {
  const tableSplit = take(pieces, 'dining_table')
  const table = tableSplit.got[0]
  if (!table) return looseCandidate(ctx, pieces)
  const chairPieces = tableSplit.rest.filter((p) => p.role === 'dining_chair')
  const extra = tableSplit.rest.filter((p) => p.role !== 'dining_chair')
  const { box } = ctx.model
  // The long side runs along the room's long axis.
  const roomLongX = box.maxX - box.minX >= box.maxZ - box.minZ
  const rotation = roomLongX === table.w >= table.d ? 0 : Math.PI / 2
  const full = chairPieces.length ? chairCount(Math.max(table.w, table.d)) : 0
  const counts = [6, 4, 2].filter((n) => n <= full)
  if (counts.length === 0) counts.push(0)
  const centre = freeCentre(ctx)

  const byCount = new Map<number, GroupCandidate[]>()
  for (const [x, z] of floorGrid(ctx.model)) {
    const t: Placed = { piece: table, rect: { x, z, w: table.w, d: table.d, rotation } }
    const base = build(ctx, [], [t])
    if (!base) continue
    const spot = nearestDoor(ctx, [x, z])
      + (ctx.windows.some((w) => Math.hypot(w[0] - x, w[1] - z) <= WINDOW_NEAR) ? 1 : 0)
      - Math.hypot(x - centre[0], z - centre[1])
    for (const n of counts) {
      const chairs = n ? chairsAround(t.rect, chairPieces[0], n) : []
      const placed = build(ctx, base, chairs)
      if (!placed) continue
      const rest = alongWalls(ctx, placed, extra)
      const dropped = [...(n ? [] : chairPieces), ...rest.dropped]
      const usePoints: Pt[] = n
        ? chairs.map((c) => offset(c.rect, -c.rect.d / 2 - BACK_USE))
        : [offset(t.rect, table.d / 2 + FRONT_USE)]
      const list = byCount.get(n) ?? []
      list.push({
        placed: rest.placed, usePoints: [...usePoints, ...storageUse(rest.placed)], dropped,
        score: spot - CHAIR_PENALTY * (full - n) - DROP_PENALTY * dropped.length,
      })
      byCount.set(n, list)
    }
  }
  return [...byCount.values()].flatMap((l) => l.sort((a, b) => b.score - a.score).slice(0, MAX_DINING))
}

// ---- sleep ----------------------------------------------------------------------------------

function placeSleep(ctx: Ctx, pieces: Piece[]): GroupCandidate[] {
  const bedSplit = take(pieces, 'bed')
  const bed = bedSplit.got[0]
  if (!bed) return looseCandidate(ctx, pieces)
  const nsSplit = take(bedSplit.rest, 'nightstand', 2)
  const stands = nsSplit.got
  const out: GroupCandidate[] = []
  for (const wall of ctx.model.walls) {
    for (const [nStands] of countSets([stands.length])) {
      for (const a of alongs(wall, bed.w)) {
        const b: Placed = { piece: bed, rect: atWall(wall, bed.w, bed.d, a) }
        let placed = build(ctx, [], [b])
        if (!placed) continue
        if (nStands) {
          placed = placeNightstands(ctx, placed, wall, a, bed, stands.slice(0, nStands))
          if (!placed) continue
        }
        const rest = alongWalls(ctx, placed, nsSplit.rest)
        const dropped = [...stands.slice(nStands), ...rest.dropped]
        out.push({
          placed: rest.placed,
          usePoints: [offset(b.rect, 0, b.rect.w / 2 + SIDE_USE), ...storageUse(rest.placed)],
          dropped,
          score: wallScore(ctx, wall, b.rect, rest.placed, dropped.length, true),
        })
        break
      }
    }
  }
  return out
}

/** Nightstands beside the bed's head: two, one each side; one, on whichever side fits. */
function placeNightstands(ctx: Ctx, base: Placed[], wall: WallInfo, along: number, bed: Piece, stands: Piece[]): Placed[] | null {
  const at = (n: Piece, side: number): Placed => ({ piece: n, rect: atWall(wall, n.w, n.d, along + side * (bed.w / 2 + NIGHTSTAND_GAP + n.w / 2)) })
  if (stands.length === 2) return build(ctx, base, [at(stands[0], 1), at(stands[1], -1)])
  return build(ctx, base, [at(stands[0], 1)]) ?? build(ctx, base, [at(stands[0], -1)])
}

// ---- work -----------------------------------------------------------------------------------

/** Do two walls meet at a corner? */
function adjacent(a: WallInfo, b: WallInfo): boolean {
  const ends = (w: WallInfo): Pt[] => [-1, 1].map((s) => [w.midX + w.dirX * s * w.length / 2, w.midZ + w.dirZ * s * w.length / 2])
  return ends(a).some((p) => ends(b).some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.05))
}

function placeWork(ctx: Ctx, pieces: Piece[]): GroupCandidate[] {
  const deskSplit = take(pieces, 'desk')
  const desk = deskSplit.got[0]
  if (!desk) return looseCandidate(ctx, pieces)
  const chairSplit = take(deskSplit.rest, 'desk_chair')
  const chair = chairSplit.got[0]
  const windowWalls = ctx.model.walls.filter((w) => wallHas(ctx, w, 'window'))
  const out: GroupCandidate[] = []
  for (const wall of ctx.model.walls) {
    for (const a of alongs(wall, desk.w)) {
      const d: Placed = { piece: desk, rect: atWall(wall, desk.w, desk.d, a) }
      const group: Placed[] = [d]
      if (chair) {
        const [x, z] = offset(d.rect, desk.d / 2 + chair.d / 2 - CHAIR_TUCK)
        group.push({ piece: chair, rect: { x, z, w: chair.w, d: chair.d, rotation: d.rect.rotation + Math.PI } })
      }
      const placed = build(ctx, [], group)
      if (!placed) continue
      const rest = alongWalls(ctx, placed, chairSplit.rest)
      const nearLight = windowWalls.some((w) => w === wall || adjacent(w, wall))
      out.push({
        placed: rest.placed,
        usePoints: [chair ? offset(group[1].rect, -chair.d / 2 - BACK_USE) : offset(d.rect, desk.d / 2 + FRONT_USE), ...storageUse(rest.placed)],
        dropped: rest.dropped,
        score: wallScore(ctx, wall, d.rect, rest.placed, rest.dropped.length, false) + (nearLight ? 1 : 0),
      })
      break
    }
  }
  return out
}

// ---- storage --------------------------------------------------------------------------------

function placeStorage(ctx: Ctx, pieces: Piece[]): GroupCandidate[] {
  const solid = pieces.filter((p) => p.role !== 'rug')
  // The biggest piece anchors the group; the rest find their own wall after it.
  const anchor = [...solid].sort((a, b) => b.w * b.d - a.w * a.d)[0]
  if (!anchor) return []
  const others = solid.filter((p) => p !== anchor)
  const out: GroupCandidate[] = []
  for (const wall of ctx.model.walls) {
    for (const a of alongs(wall, anchor.w)) {
      const s: Placed = { piece: anchor, rect: atWall(wall, anchor.w, anchor.d, a) }
      const placed = build(ctx, [], [s])
      if (!placed) continue
      const rest = alongWalls(ctx, placed, others)
      // A rug is never storage; reported back rather than stood against a wall.
      const dropped = [...rest.dropped, ...pieces.filter((p) => p.role === 'rug')]
      out.push({ placed: rest.placed, usePoints: storageUse(rest.placed), dropped, score: wallScore(ctx, wall, s.rect, rest.placed, rest.dropped.length, false) })
      break
    }
  }
  return out
}

// ---- extra ----------------------------------------------------------------------------------

/** Decor into free corners, else along a wall; a rug on the middle of the free floor (it may lie under things). */
function placeExtra(ctx: Ctx, pieces: Piece[]): GroupCandidate[] {
  let placed: Placed[] = []
  const dropped: Piece[] = []
  const centre = freeCentre(ctx)
  for (const piece of pieces) {
    if (piece.role === 'rug') {
      placed.push({ piece, rect: { x: centre[0], z: centre[1], w: piece.w, d: piece.d, rotation: 0 } })
      continue
    }
    let done = false
    // Corners first: each end of each wall.
    for (const wall of ctx.model.walls) {
      const reach = wall.length / 2 - piece.w / 2 - WALL_GAP
      if (reach < 0) continue
      for (const a of [reach, -reach]) {
        const next = build(ctx, placed, [{ piece, rect: atWall(wall, piece.w, piece.d, a) }])
        if (next) { placed = next; done = true; break }
      }
      if (done) break
    }
    if (!done) {
      const r = alongWalls(ctx, placed, [piece])
      placed = r.placed
      dropped.push(...r.dropped)
    }
  }
  if (placed.length === 0) return []
  return [{ placed, usePoints: [], dropped, score: -DROP_PENALTY * dropped.length }]
}

// ---- entry ----------------------------------------------------------------------------------

const PLACERS: Record<GroupId, (ctx: Ctx, pieces: Piece[]) => GroupCandidate[]> = {
  lounge: placeLounge, dining: placeDining, sleep: placeSleep, work: placeWork, storage: placeStorage, extra: placeExtra,
}

/**
 * Every arrangement of `group`'s `pieces` that fits the room around what is `taken`, best first.
 * Empty when not even the group's main piece fits.
 */
export function groupCandidates(group: GroupId, pieces: Piece[], model: RoomModel, taken: Rect[]): GroupCandidate[] {
  if (pieces.length === 0) return []
  const windows: Pt[] = model.openings.flatMap((o) => {
    const w = model.walls.find((x) => x.id === o.wallId)
    if (o.kind !== 'window' || !w) return []
    const t = (o.from + o.to) / 2
    return [[w.midX + w.dirX * t, w.midZ + w.dirZ * t] as Pt]
  })
  const ctx: Ctx = { model, taken, doors: doorEntries(model), windows }
  return PLACERS[group](ctx, pieces).sort((a, b) => b.score - a.score)
}
