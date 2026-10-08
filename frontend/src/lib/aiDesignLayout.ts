import type { RoomGeometry } from '@/store/roomStore'
import { roomExtents } from '@/lib/roomDims'
import { pointInPolygon, planPolygon, offsetPolygon } from '@/lib/planPolygon'
import { wallDefsFromVertices } from '@/lib/wallDefsFromVertices'
import { wallMountFrame } from '@/lib/wallMountFrame'
import { resolveElementPositions } from '@/lib/wallPositions'

/**
 * Where an AI design's pieces go.
 *
 * The model says WHAT and roughly WHERE: "the sofa against wall W2", "a floor lamp in the W2-W3
 * corner". This turns that zone into a position, knowing the room's walls and each piece's
 * footprint, and keeps the pieces off one another.
 *
 * Works for any room: the plain four-wall room (walls A-D) and a drawn or scanned one (walls of
 * any number, any angle, an L-shape). Both are described the same way, as a list of walls (each
 * with its midpoint, direction along it, the normal pointing into the room and its length) plus a
 * test for "does this rectangle lie inside the room".
 *
 * Zones, written with the room's own wall ids: `center`, `wall_<id>` (the piece stands with its
 * back on that wall, front toward the room) and `corner_<a>_<b>` (at the end of wall a that meets
 * wall b). The old four-wall spelling `corner_AB` is read too.
 *
 * Doors and windows are respected. A door (and a balcony door) keeps the floor in front of it clear
 * for its swing; a window keeps the floor in front of it clear of tall pieces and of anything
 * hung on the wall, which would stand in the light. A low piece (a sofa, a bed) may still stand
 * under a window, as people do. When a piece cannot be placed without breaking one of these, the
 * window rule is dropped first, the door rule last, and only then does it go where it can.
 *
 * World frame: metres, origin at the room's centre, as the studio's furniture uses it.
 */

/**
 * A piece's footprint on the floor: its centre, its width and depth, and the turn it stands at
 * (the studio's Y rotation: its front faces (sin, cos) of it). Metres and radians. Kept as it
 * really stands rather than boxed to the axes: against a wall that is not square to the axes
 * (a scanned room is rarely square) a box is far bigger than the piece and never seems to fit.
 */
export interface Rect { x: number; z: number; w: number; d: number; rotation: number }

type Pt = [number, number]

export function rectCorners(r: Rect): Pt[] {
  const fx = Math.sin(r.rotation), fz = Math.cos(r.rotation) // front
  const rx = Math.cos(r.rotation), rz = -Math.sin(r.rotation) // along the width
  return ([[1, 1], [1, -1], [-1, -1], [-1, 1]] as const).map(
    ([a, b]) => [r.x + rx * (r.w / 2) * a + fx * (r.d / 2) * b, r.z + rz * (r.w / 2) * a + fz * (r.d / 2) * b] as Pt,
  )
}

/** The axis-aligned box round a footprint. */
export function rectBounds(r: Rect): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const c = rectCorners(r)
  const xs = c.map((p) => p[0]), zs = c.map((p) => p[1])
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }
}
export interface Spot { x: number; z: number; rotation: number }

export interface WallInfo {
  id: string
  midX: number; midZ: number
  /** Unit vector along the wall. */
  dirX: number; dirZ: number
  /** Unit normal pointing into the room. */
  nx: number; nz: number
  length: number
}

/** A door or window on one of the room's walls, as a span along the wall. */
export interface Opening {
  wallId: string
  kind: 'door' | 'window'
  /** Metres along the wall from its midpoint: where the opening starts and ends. */
  from: number
  to: number
}

/** The floor in front of an opening that must stay clear. */
export interface ClearZone { kind: 'door' | 'window'; wallId: string; rect: Rect }

export interface RoomModel {
  walls: WallInfo[]
  openings: Opening[]
  clear: ClearZone[]
  /** Bounding box of the room, world metres: where to look for free floor. */
  box: { minX: number; maxX: number; minZ: number; maxZ: number }
  /** Whether a footprint lies wholly inside the room. */
  inside(r: Rect): boolean
  /** Plan millimetres (from the room's corner) are world metres * 1000 + these. */
  offsetMm: { x: number; z: number }
}

/** How far a door's swing reaches into the room, and the space kept beside its frame, metres. */
const DOOR_SWING = 0.95
const DOOR_SIDE = 0.1
/** How far in front of a window a tall piece must not stand, and the space beside its frame, metres. */
const WINDOW_REACH = 0.6
const WINDOW_SIDE = 0.05
/** Space a wall light keeps from the edge of a door or window, metres. */
const LIGHT_CLEARANCE = 0.25

/** Gap between a piece and the wall, and between neighbours, metres. */
const WALL_GAP = 0.04
const MARGIN = 0.08
/** How far in from the wall the room's own outline is taken to start, for a polygon room, metres. */
const OUTLINE_INSET = 0.02

/**
 * The room's doors and windows as spans along their walls, and the floor each must keep clear.
 * A balcony door is a door. Positions are resolved the way the studio draws them (a lone opening
 * that was never placed sits in the middle of its wall).
 */
function openingsOf(geometry: RoomGeometry, walls: WallInfo[]): { openings: Opening[]; clear: ClearZone[] } {
  const openings: Opening[] = []
  const clear: ClearZone[] = []
  for (const w of geometry.walls) {
    const info = walls.find((x) => x.id === w.id)
    if (!info || !w.elements?.length) continue
    for (const el of resolveElementPositions(w.elements, w.length)) {
      const kind = el.type === 'deraza' ? 'window' : 'door'
      const width = el.width / 1000
      const t = (el.position + el.width / 2) / 1000 - info.length / 2 // centre, from the wall's midpoint
      openings.push({ wallId: info.id, kind, from: t - width / 2, to: t + width / 2 })
      const reach = kind === 'door' ? DOOR_SWING : WINDOW_REACH
      const side = kind === 'door' ? DOOR_SIDE : WINDOW_SIDE
      clear.push({
        kind, wallId: info.id,
        rect: {
          x: info.midX + info.dirX * t + info.nx * (reach / 2),
          z: info.midZ + info.dirZ * t + info.nz * (reach / 2),
          w: width + 2 * side, d: reach, rotation: Math.atan2(info.nx, info.nz),
        },
      })
    }
  }
  return { openings, clear }
}

export function roomModel(geometry: RoomGeometry): RoomModel {
  const { W, D } = roomExtents(geometry)
  const ids = geometry.walls.map((w) => w.id)
  const abcd = geometry.walls.length === 4 && ['A', 'B', 'C', 'D'].every((id) => ids.includes(id))

  if (!abcd) {
    const poly = planPolygon(geometry)
    if (poly && geometry.vertices) {
      const defs = wallDefsFromVertices(geometry.vertices, ids)
      const walls: WallInfo[] = ids.flatMap((id) => {
        const d = defs[id]
        return d ? [{ id, midX: d.midX, midZ: d.midZ, dirX: d.dirX, dirZ: d.dirZ, nx: d.normal.x, nz: d.normal.z, length: d.length }] : []
      })
      const inner = offsetPolygon(poly, -OUTLINE_INSET * 1000)
      const offX = poly.W / 2, offZ = poly.D / 2
      const inPlan = (x: number, z: number) => pointInPolygon(x * 1000 + offX, z * 1000 + offZ, inner)
      return {
        walls,
        ...openingsOf(geometry, walls),
        box: { minX: poly.minX / 1000 - poly.W / 2000, maxX: poly.maxX / 1000 - poly.W / 2000, minZ: poly.minZ / 1000 - poly.D / 2000, maxZ: poly.maxZ / 1000 - poly.D / 2000 },
        inside: (r) => rectCorners(r).every(([x, z]) => inPlan(x, z)),
        offsetMm: { x: offX, z: offZ },
      }
    }
  }

  const walls = ids.flatMap((id) => {
    const f = wallMountFrame(id, W, D)
    return f ? [{ id, midX: f.midX, midZ: f.midZ, dirX: f.dirX, dirZ: f.dirZ, nx: f.nx, nz: f.nz, length: f.length }] : []
  })
  return {
    walls,
    ...openingsOf(geometry, walls),
    box: { minX: -W / 2, maxX: W / 2, minZ: -D / 2, maxZ: D / 2 },
    inside: (r) => rectCorners(r).every(([x, z]) => Math.abs(x) <= W / 2 + 1e-6 && Math.abs(z) <= D / 2 + 1e-6),
    offsetMm: { x: (W * 1000) / 2, z: (D * 1000) / 2 },
  }
}

export type ParsedZone =
  | { kind: 'center' }
  | { kind: 'wall'; wall: WallInfo }
  | { kind: 'corner'; wall: WallInfo; toward: WallInfo }

/** The zone as walls of this room; null when it names a wall the room does not have. */
export function parseZone(zone: string, model: RoomModel): ParsedZone | null {
  if (zone === 'center') return { kind: 'center' }
  const find = (id: string) => model.walls.find((w) => w.id === id)
  if (zone.startsWith('wall_')) {
    const wall = find(zone.slice(5))
    return wall ? { kind: 'wall', wall } : null
  }
  if (zone.startsWith('corner_')) {
    const rest = zone.slice(7)
    // corner_<a>_<b>; the old four-wall spelling is corner_AB.
    const parts = rest.includes('_') ? rest.split('_') : rest.length === 2 ? [rest[0], rest[1]] : []
    const [a, b] = parts.length === 2 ? [find(parts[0]), find(parts[1])] : [undefined, undefined]
    return a && b ? { kind: 'corner', wall: a, toward: b } : null
  }
  return null
}

/** Do two footprints, each grown by the margin, overlap? (Separating axes: exact for turned rectangles.) */
function overlaps(a: Rect, b: Rect, margin = MARGIN): boolean {
  const ca = rectCorners({ ...a, w: a.w + margin, d: a.d + margin })
  const cb = rectCorners({ ...b, w: b.w + margin, d: b.d + margin })
  for (const poly of [ca, cb]) {
    for (let i = 0; i < 4; i++) {
      const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % 4]
      const ax = -(z2 - z1), az = x2 - x1
      const pa = ca.map(([x, z]) => x * ax + z * az), pb = cb.map(([x, z]) => x * ax + z * az)
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false
    }
  }
  return true
}

/** 0, +s, -s, +2s, -2s ... : the slide offsets tried along a wall. */
function slideOffsets(limit: number, step: number): number[] {
  const out = [0]
  for (let k = 1; k * step <= limit + 1e-9; k++) out.push(k * step, -k * step)
  return out
}

/** The free floor nearest the middle of the room that a footprint fits on, or null. */
function nearestFree(
  model: RoomModel, size: { w: number; d: number }, taken: Rect[], ok: (r: Rect) => boolean = () => true,
): { x: number; z: number } | null {
  const step = 0.25
  const spots: [number, number][] = []
  for (let x = model.box.minX; x <= model.box.maxX; x += step) {
    for (let z = model.box.minZ; z <= model.box.maxZ; z += step) spots.push([x, z])
  }
  spots.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]))
  for (const [x, z] of spots) {
    const rect = { x, z, ...size, rotation: 0 }
    if (model.inside(rect) && !taken.some((t) => overlaps(rect, t)) && ok(rect)) return { x, z }
  }
  return null
}

/** What a piece needs to be placed: its footprint and whether it would shut out a window. */
export interface PieceSize { w: number; d: number; /** Tall or wall-hung: must not stand in front of a window. */ tall?: boolean }

/** Does the footprint stand where an opening must stay clear? Windows only matter to tall pieces. */
function blocksOpening(r: Rect, tall: boolean, model: RoomModel, rules: { doors: boolean; windows: boolean }): boolean {
  return model.clear.some((z) => (z.kind === 'door' ? rules.doors : rules.windows && tall) && overlaps(r, z.rect, 0))
}

/** The rules tried in turn: everything, then without the window rule, then without any. */
const RULES = [{ doors: true, windows: true }, { doors: true, windows: false }, { doors: false, windows: false }]

/**
 * Where the piece goes for `zone`, avoiding `taken`, the doors' swing and (for tall pieces) the
 * windows. Falls back to the nearest free place to the middle.
 */
export function furnitureSpot(
  zone: string, size: PieceSize, model: RoomModel, taken: Rect[],
): Spot & { rect: Rect } {
  const parsed = parseZone(zone, model)
  const tall = size.tall === true
  const footprint = { w: size.w, d: size.d }

  for (const rules of RULES) {
    const free = (r: Rect) => model.inside(r) && !taken.some((t) => overlaps(r, t)) && !blocksOpening(r, tall, model, rules)

    if (parsed && parsed.kind !== 'center') {
      const { wall } = parsed
      // Standing with its back on the wall: half its depth out from the wall's midpoint.
      const out = size.d / 2 + WALL_GAP
      const reach = Math.max(0, wall.length / 2 - size.w / 2 - WALL_GAP)
      const step = 0.25
      let alongs: number[]
      if (parsed.kind === 'corner') {
        // A corner piece starts at the end of this wall that meets the other, then works back toward the middle.
        const sign = Math.sign((parsed.toward.midX - wall.midX) * wall.dirX + (parsed.toward.midZ - wall.midZ) * wall.dirZ) || 1
        alongs = Array.from({ length: Math.floor((reach * 2) / step) + 1 }, (_, k) => sign * (reach - k * step))
      } else {
        // Also the very ends of the wall: a second piece fits there when the steps would skip over the gap.
        alongs = [...slideOffsets(reach, step), reach, -reach]
      }
      const rotation = Math.atan2(wall.nx, wall.nz) // front toward the room
      for (const along of alongs) {
        const x = wall.midX + wall.nx * out + wall.dirX * along
        const z = wall.midZ + wall.nz * out + wall.dirZ * along
        const rect = { x, z, w: size.w, d: size.d, rotation }
        if (free(rect)) return { x, z, rotation, rect }
      }
    }

    // The middle, or anywhere free nearest it (the wall was full, the zone was the middle, or it named no wall here).
    const spot = nearestFree(model, footprint, taken, (r) => !blocksOpening(r, tall, model, rules))
    if (spot) return { ...spot, rotation: 0, rect: { ...spot, ...footprint, rotation: 0 } }
  }
  return { x: 0, z: 0, rotation: 0, rect: { x: 0, z: 0, ...footprint, rotation: 0 } } // no room left: overlap rather than lose the piece
}

/** Is a point on `wall`, `along` metres from its midpoint, inside a door or window (plus clearance)? */
function onOpening(model: RoomModel, wallId: string, along: number): boolean {
  return model.openings.some((o) => o.wallId === wallId && along > o.from - LIGHT_CLEARANCE && along < o.to + LIGHT_CLEARANCE)
}

/** The spot for a light fixture, in the store's millimetres from the room's corner. */
export function lightSpot(
  zone: string, mount: 'ceiling' | 'recessed' | 'wall' | 'floor' | 'track', model: RoomModel, nth: number,
): { xMm: number; zMm: number; wallId?: string } {
  const spread = [[0, 0], [0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7]][nth % 5]
  const parsed = parseZone(zone, model)
  let x = spread[0], z = spread[1]
  let wallId: string | undefined

  if (parsed?.kind === 'wall') {
    const w = parsed.wall
    // A wall fixture sits on the wall, the others a little way in from it, each further along the wall.
    const proud = mount === 'wall' ? 0.12 : 0.9
    let along = (nth % 5) * 0.8 - (nth % 5 ? 0.4 : 0)
    if (mount === 'wall') {
      // A sconce does not hang over a door or a window: slide it along to the nearest bare wall.
      const limit = Math.max(0, w.length / 2 - LIGHT_CLEARANCE)
      const shifts = slideOffsets(limit * 2, 0.2).map((s) => along + s).filter((a) => Math.abs(a) <= limit)
      along = shifts.find((a) => !onOpening(model, w.id, a)) ?? along
    }
    x = w.midX + w.nx * proud + w.dirX * along
    z = w.midZ + w.nz * proud + w.dirZ * along
    if (mount === 'wall') wallId = w.id
  } else if (parsed?.kind === 'corner') {
    const w = parsed.wall
    const sign = Math.sign((parsed.toward.midX - w.midX) * w.dirX + (parsed.toward.midZ - w.midZ) * w.dirZ) || 1
    // The end of this wall that meets the other, brought in from both walls.
    const cx = w.midX + w.dirX * sign * w.length / 2
    const cz = w.midZ + w.dirZ * sign * w.length / 2
    // A floor lamp in the corner must not stand where a door swings: step it along the wall, away from the corner.
    const inDoorSwing = (px: number, pz: number) =>
      mount === 'floor' && model.clear.some((c) => c.kind === 'door' && overlaps({ x: px, z: pz, w: 0.3, d: 0.3, rotation: 0 }, c.rect, 0))
    x = cx + w.nx * 0.5 - w.dirX * sign * 0.5
    z = cz + w.nz * 0.5 - w.dirZ * sign * 0.5
    for (let k = 1; k <= 6 && inDoorSwing(x, z); k++) {
      x = cx + w.nx * 0.5 - w.dirX * sign * (0.5 + k * 0.4)
      z = cz + w.nz * 0.5 - w.dirZ * sign * (0.5 + k * 0.4)
    }
  }

  // A light must hang over the room: if the point is outside it (the middle of an L-shape, say), use the
  // nearest floor to it instead.
  const probe = { x, z, w: 0.2, d: 0.2, rotation: 0 }
  if (!model.inside(probe)) {
    const spot = nearestFree(model, { w: 0.2, d: 0.2 }, [])
    if (spot) { x = spot.x; z = spot.z }
  }
  return {
    xMm: Math.round(x * 1000 + model.offsetMm.x),
    zMm: Math.round(z * 1000 + model.offsetMm.z),
    ...(wallId ? { wallId } : {}),
  }
}
