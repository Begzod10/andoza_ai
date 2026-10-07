import type { RoomGeometry } from '@/store/roomStore'
import { roomExtents } from '@/lib/roomDims'
import { wallMountFrame } from '@/lib/wallMountFrame'

/**
 * Where an AI design's pieces go.
 *
 * The model says WHAT and roughly WHERE: "the sofa against wall B", "a floor lamp in the
 * A-B corner". This turns a zone into a position, knowing the room's walls and each piece's
 * footprint, and keeps the pieces off one another.
 *
 * World frame: metres, origin at the room's centre, x along wall A, z toward wall C. A
 * piece against a wall stands with its back to it and its front toward the room, turned by
 * the wall's own `ry` (the way a faceplate on that wall faces).
 *
 * Only the four-wall room (walls A-D) has these zones. A drawn or scanned room has walls
 * W1..Wn with no agreed names, so there everything goes where the studio's own "add" would
 * put it (callers fall back to furniturePlacementMm / nextLightPositionMm).
 */

export const ZONES = [
  'center', 'wall_A', 'wall_B', 'wall_C', 'wall_D', 'corner_AB', 'corner_BC', 'corner_CD', 'corner_DA',
] as const
export type Zone = (typeof ZONES)[number]

/** An axis-aligned footprint on the floor: centre and half-extents, metres. */
export interface Rect { x: number; z: number; hw: number; hd: number }
export interface Spot { x: number; z: number; rotation: number }

/** Gap between a piece and the wall, and between neighbours, metres. */
const WALL_GAP = 0.04
const MARGIN = 0.08

const CORNER_WALLS: Record<string, [string, string]> = {
  corner_AB: ['A', 'B'], corner_BC: ['B', 'C'], corner_CD: ['C', 'D'], corner_DA: ['D', 'A'],
}

export function isFourWallRoom(geometry: RoomGeometry): boolean {
  const ids = new Set(geometry.walls.map((w) => w.id))
  return geometry.walls.length === 4 && ['A', 'B', 'C', 'D'].every((id) => ids.has(id))
}

export function isZone(value: string): value is Zone {
  return (ZONES as readonly string[]).includes(value)
}

const overlaps = (a: Rect, b: Rect) =>
  Math.abs(a.x - b.x) < a.hw + b.hw + MARGIN && Math.abs(a.z - b.z) < a.hd + b.hd + MARGIN

function inside(r: Rect, W: number, D: number): boolean {
  return Math.abs(r.x) + r.hw <= W / 2 + 1e-6 && Math.abs(r.z) + r.hd <= D / 2 + 1e-6
}

/** A rectangle's half-extents once the piece is turned to `ry` (quarter turns only). */
function extentsAt(size: { w: number; d: number }, ry: number): { hw: number; hd: number } {
  const quarter = Math.abs(Math.round(ry / (Math.PI / 2))) % 2 === 1
  return quarter ? { hw: size.d / 2, hd: size.w / 2 } : { hw: size.w / 2, hd: size.d / 2 }
}

/** 0, +s, -s, +2s, -2s ... : the slide offsets tried along a wall. */
function slideOffsets(limit: number, step = 0.25): number[] {
  const out = [0]
  for (let k = 1; k * step <= limit + 1e-9; k++) out.push(k * step, -k * step)
  return out
}

/** Where the piece goes for `zone`, avoiding `taken`. Falls back to the nearest free place in the middle. */
export function furnitureSpot(
  zone: Zone, size: { w: number; d: number }, geometry: RoomGeometry, taken: Rect[],
): Spot & { rect: Rect } {
  const { W, D } = roomExtents(geometry)
  const free = (r: Rect) => inside(r, W, D) && !taken.some((t) => overlaps(r, t))
  const done = (x: number, z: number, rotation: number, ext: { hw: number; hd: number }) =>
    ({ x, z, rotation, rect: { x, z, ...ext } })

  const wallId = zone.startsWith('wall_') ? zone.slice(5) : zone.startsWith('corner_') ? CORNER_WALLS[zone][0] : null
  const frame = wallId ? wallMountFrame(wallId, W, D) : null
  if (frame && wallId) {
    const ext = extentsAt(size, frame.ry)
    const toward = zone.startsWith('corner_') ? wallMountFrame(CORNER_WALLS[zone][1], W, D) : null
    // Standing with its back on the wall: half its depth out from the wall's midpoint.
    const out = size.d / 2 + WALL_GAP
    const reach = Math.max(0, frame.length / 2 - size.w / 2 - WALL_GAP)
    const step = 0.25
    let alongs: number[]
    if (toward) {
      // A corner piece starts at the end of this wall that meets the other, then works back toward the middle.
      const sign = Math.sign((toward.midX - frame.midX) * frame.dirX + (toward.midZ - frame.midZ) * frame.dirZ) || 1
      alongs = Array.from({ length: Math.floor((reach * 2) / step) + 1 }, (_, k) => sign * (reach - k * step))
    } else {
      // Also the very ends of the wall: a second piece fits there when the steps would skip over the gap.
      alongs = [...slideOffsets(reach, step), reach, -reach]
    }
    for (const along of alongs) {
      const x = frame.midX + frame.nx * out + frame.dirX * along
      const z = frame.midZ + frame.nz * out + frame.dirZ * along
      const rect = { x, z, ...ext }
      if (free(rect)) return done(x, z, frame.ry, ext)
    }
  }

  // The middle, or anywhere free nearest it (the wall was full, or the zone was the middle).
  const ext = extentsAt(size, 0)
  const step = 0.25
  const candidates: [number, number][] = []
  for (let gx = -W / 2; gx <= W / 2; gx += step) for (let gz = -D / 2; gz <= D / 2; gz += step) candidates.push([gx, gz])
  candidates.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]))
  for (const [x, z] of candidates) {
    if (free({ x, z, ...ext })) return done(x, z, 0, ext)
  }
  return done(0, 0, 0, ext) // no room left: the middle, overlapping rather than losing the piece
}

/** The spot for a light fixture, in the store's millimetres from the room's corner. */
export function lightSpot(
  zone: Zone, mount: 'ceiling' | 'recessed' | 'wall' | 'floor' | 'track', geometry: RoomGeometry, nth: number,
): { xMm: number; zMm: number; wallId?: string } {
  const { W, D } = roomExtents(geometry)
  const spread = [[0, 0], [0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7]][nth % 5]
  let x = spread[0], z = spread[1]
  let wallId: string | undefined

  const wall = zone.startsWith('wall_') ? zone.slice(5) : null
  const frame = wall ? wallMountFrame(wall, W, D) : null
  if (frame && wall) {
    // A wall fixture sits on the wall, the others a little way in from it, each further along the wall.
    const proud = mount === 'wall' ? 0.12 : 0.9
    const along = (nth % 5) * 0.8 - (nth % 5 ? 0.4 : 0)
    x = frame.midX + frame.nx * proud + frame.dirX * along
    z = frame.midZ + frame.nz * proud + frame.dirZ * along
    if (mount === 'wall') wallId = wall
  } else if (zone.startsWith('corner_')) {
    const sx = zone === 'corner_AB' || zone === 'corner_BC' ? 1 : -1
    const sz = zone === 'corner_BC' || zone === 'corner_CD' ? 1 : -1
    x = sx * (W / 2 - 0.5)
    z = sz * (D / 2 - 0.5)
  }
  const clamp = (v: number, half: number) => Math.max(-half + 0.15, Math.min(half - 0.15, v))
  return {
    xMm: Math.round((clamp(x, W / 2) + W / 2) * 1000),
    zMm: Math.round((clamp(z, D / 2) + D / 2) * 1000),
    ...(wallId ? { wallId } : {}),
  }
}
