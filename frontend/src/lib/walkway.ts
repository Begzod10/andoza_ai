/**
 * Can a person walk from the door to every part of the room?
 *
 * The room is cut into 10 cm cells. A cell is blocked when a path-wide square round it does not
 * fit in the room, or it lies closer than half the path width to a piece of furniture; a breadth-first walk from the door shows what
 * can be reached. Used to decide whether a furniture group may stand where it was put.
 */
import { rectCorners, type Rect, type RoomModel } from './aiDesignLayout'

/** A point in world metres. */
export type Pt = [number, number]

const CELL = 0.1
/** How far inside the room, from the door's centre, a person is taken to step in, metres. */
const ENTRY_DEPTH = 0.4
/** How far a target standing on blocked floor may be moved to the nearest free cell, metres. */
const SNAP = 0.4
export const PATH_WIDTH = 0.7

/** Where a person stands just inside each door. */
export function doorEntries(model: RoomModel): Pt[] {
  const out: Pt[] = []
  for (const o of model.openings) {
    if (o.kind !== 'door') continue
    const w = model.walls.find((x) => x.id === o.wallId)
    if (!w) continue
    const c = (o.from + o.to) / 2
    out.push([w.midX + w.dirX * c + w.nx * ENTRY_DEPTH, w.midZ + w.dirZ * c + w.nz * ENTRY_DEPTH])
  }
  return out
}

/** Distance from a point to a (rotated) rectangle; 0 inside it. */
function distanceTo(r: Rect, px: number, pz: number): number {
  const dx = px - r.x, dz = pz - r.z
  const lx = Math.abs(dx * Math.cos(r.rotation) - dz * Math.sin(r.rotation)) - r.w / 2
  const lz = Math.abs(dx * Math.sin(r.rotation) + dz * Math.cos(r.rotation)) - r.d / 2
  return Math.hypot(Math.max(lx, 0), Math.max(lz, 0))
}

/** The cells a path `width` wide cannot use because it would not fit inside the room, per room and width. */
const wallMasks = new WeakMap<RoomModel, Map<number, Uint8Array>>()
function wallMask(model: RoomModel, width: number, nx: number, nz: number): Uint8Array {
  let byWidth = wallMasks.get(model)
  if (!byWidth) { byWidth = new Map(); wallMasks.set(model, byWidth) }
  let mask = byWidth.get(width)
  if (!mask) {
    const { minX, minZ } = model.box
    mask = new Uint8Array(nx * nz)
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        // The strip next to a wall is no path: the whole width must fit inside the room.
        const cx = minX + (i + 0.5) * CELL, cz = minZ + (j + 0.5) * CELL
        mask[i * nz + j] = model.inside({ x: cx, z: cz, w: width, d: width, rotation: 0 }) ? 0 : 1
      }
    }
    byWidth.set(width, mask)
  }
  return mask
}

/**
 * True when every `to` point can be reached from some `from` point along a path `width` wide
 * that keeps off the `taken` footprints. A room with no door (`from` empty) always passes.
 */
export function walkable(model: RoomModel, taken: Rect[], from: Pt[], to: Pt[], width = PATH_WIDTH): boolean {
  if (from.length === 0) return true
  const { minX, maxX, minZ, maxZ } = model.box
  const nx = Math.max(1, Math.ceil((maxX - minX) / CELL)), nz = Math.max(1, Math.ceil((maxZ - minZ) / CELL))
  const reach = width / 2
  const near = taken.map((r) => {
    const c = rectCorners(r), pad = reach + 1e-9
    return { r, minX: Math.min(...c.map((p) => p[0])) - pad, maxX: Math.max(...c.map((p) => p[0])) + pad, minZ: Math.min(...c.map((p) => p[1])) - pad, maxZ: Math.max(...c.map((p) => p[1])) + pad }
  })

  const blocked = wallMask(model, width, nx, nz).slice()
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const cx = minX + (i + 0.5) * CELL, cz = minZ + (j + 0.5) * CELL
      let b = blocked[i * nz + j] === 1
      for (let k = 0; !b && k < near.length; k++) {
        const n = near[k]
        if (cx < n.minX || cx > n.maxX || cz < n.minZ || cz > n.maxZ) continue
        b = distanceTo(n.r, cx, cz) < reach - 1e-9
      }
      blocked[i * nz + j] = b ? 1 : 0
    }
  }

  const cellOf = (p: Pt): [number, number] => [Math.floor((p[0] - minX) / CELL), Math.floor((p[1] - minZ) / CELL)]
  const inGrid = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < nz
  /** The cell for a point, moved to the nearest free cell within SNAP when it is blocked. */
  const snap = (p: Pt): number | null => {
    const [ci, cj] = cellOf(p)
    const r = Math.ceil(SNAP / CELL)
    let best: number | null = null, bestD = Infinity
    for (let i = ci - r; i <= ci + r; i++) {
      for (let j = cj - r; j <= cj + r; j++) {
        if (!inGrid(i, j) || blocked[i * nz + j]) continue
        const d = Math.hypot((i - ci) * CELL, (j - cj) * CELL)
        if (d <= SNAP + 1e-9 && d < bestD) { best = i * nz + j; bestD = d }
      }
    }
    return best
  }

  const seen = new Uint8Array(nx * nz)
  const queue: number[] = []
  for (const p of from) {
    const s = snap(p)
    if (s !== null && !seen[s]) { seen[s] = 1; queue.push(s) }
  }
  for (let h = 0; h < queue.length; h++) {
    const i = Math.floor(queue[h] / nz), j = queue[h] % nz
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const a = i + di, b = j + dj
      if (!inGrid(a, b)) continue
      const id = a * nz + b
      if (blocked[id] || seen[id]) continue
      seen[id] = 1
      queue.push(id)
    }
  }

  return to.every((p) => {
    const s = snap(p)
    return s !== null && seen[s] === 1
  })
}
