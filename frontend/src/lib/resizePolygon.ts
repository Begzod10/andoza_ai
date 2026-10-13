/**
 * Resizing a right-angled polygon room — an L, a notched room — by moving
 * one of its walls straight in or out ("make L shaped room resize like
 * others").
 *
 * Wall i runs from vertices[i] to vertices[i + 1], and an opening's position
 * on it is measured from vertices[i] (lib/wallDefsFromVertices). Moving wall
 * i moves both its corners along its outward normal, so:
 *  - wall i keeps its length and its openings;
 *  - wall i − 1 ends at the moved corner: it stretches or shrinks at its far
 *    end, its openings stay — but must still fit, trim included;
 *  - wall i + 1 starts at the moved corner: its openings keep their place in
 *    the room by shifting the other way along it.
 * Refused (null): a neighbouring wall turned inside out or under 200 mm, an
 * opening no longer fitting, an outline crossing itself, or any part of the
 * room left under 0.6 m across.
 *
 * Positions in millimetres in the room's own frame; the result says how far
 * the room's origin — its vertex mean, which the renderer centres on — moved
 * in the flat, so the caller can keep everything else where it is.
 */
import { resolveElementPositions } from '@/lib/wallPositions'
import type { RoomGeometry } from '@/store/types'

const TRIM_MM = 70
const MIN_WALL_MM = 200
const MIN_ACROSS_MM = 600

export function isRectilinear(g: RoomGeometry): boolean {
  const v = g.vertices
  if (!v || v.length < 4 || v.length !== g.walls.length) return false
  return v.every(([x1, z1], i) => {
    const [x2, z2] = v[(i + 1) % v.length]
    return x1 === x2 || z1 === z2
  })
}

/** The room's origin in its own frame: the vertex mean, mm. */
export function polygonCentre(g: RoomGeometry): { x: number; z: number } {
  const v = g.vertices ?? []
  return { x: v.reduce((s, p) => s + p[0], 0) / v.length, z: v.reduce((s, p) => s + p[1], 0) / v.length }
}

/** Wall i's outward unit normal (±1 on one axis). */
export function outwardNormal(g: RoomGeometry, i: number): { x: number; z: number } {
  const v = g.vertices!
  let area = 0
  for (let k = 0; k < v.length; k++) {
    const [x1, z1] = v[k], [x2, z2] = v[(k + 1) % v.length]
    area += x1 * z2 - x2 * z1
  }
  const w = area >= 0 ? 1 : -1
  const [x1, z1] = v[i], [x2, z2] = v[(i + 1) % v.length]
  const len = Math.hypot(x2 - x1, z2 - z1) || 1
  // Inward is (−dz, dx)·w (lib/wallDefsFromVertices); outward the opposite.
  return { x: Math.round(((z2 - z1) / len) * w), z: Math.round((-(x2 - x1) / len) * w) }
}

export interface EdgeMove {
  geometry: RoomGeometry
  /** How far the room's origin moved in the flat, metres. */
  shiftM: { dx: number; dz: number }
  /** What was subtracted to keep the outline's corner at 0, 0, mm. */
  rebaseMm: { x: number; z: number }
  /** Per wall id, how far positions along it moved (mm) — for sockets. */
  positionShiftMm: Record<string, number>
}

export function moveEdge(g: RoomGeometry, i: number, deltaMm: number): EdgeMove | null {
  if (!isRectilinear(g)) return null
  const v = g.vertices!
  const n = v.length
  const prev = (i - 1 + n) % n, next = (i + 1) % n
  const nrm = outwardNormal(g, i)
  const raw = v.map(([x, z], k) => (k === i || k === next ? [x + nrm.x * deltaMm, z + nrm.z * deltaMm] : [x, z]) as [number, number])

  const dir = (pts: [number, number][], k: number) => {
    const [x1, z1] = pts[k], [x2, z2] = pts[(k + 1) % n]
    return { x: Math.sign(x2 - x1), z: Math.sign(z2 - z1), len: Math.hypot(x2 - x1, z2 - z1) }
  }
  // The walls either side keep their direction and some length.
  for (const k of [prev, next]) {
    const a = dir(v, k), b = dir(raw, k)
    if (b.len < MIN_WALL_MM || a.x !== b.x || a.z !== b.z) return null
  }
  if (crosses(raw)) return null
  if (narrowest(raw) < MIN_ACROSS_MM) return null

  // Wall i + 1's start moved along it: its openings shift back to stay put.
  const d1 = dir(v, next)
  const nextShift = -(nrm.x * d1.x + nrm.z * d1.z) * deltaMm
  const walls = g.walls.map((w, k) => {
    const len = Math.round(dir(raw, k).len)
    if (k !== prev && k !== next) return { ...w, length: len }
    const els = resolveElementPositions(w.elements, w.length).map((el) => ({
      ...el, positionAuto: false, position: k === next ? el.position + nextShift : el.position,
    }))
    for (const el of els) if (el.position < TRIM_MM || el.position + el.width + TRIM_MM > len) return null
    return { ...w, length: len, elements: els }
  })
  if (walls.some((w) => w === null)) return null

  const before = polygonCentre(g)
  const rawMean = { x: raw.reduce((s, p) => s + p[0], 0) / n, z: raw.reduce((s, p) => s + p[1], 0) / n }
  const rebase = { x: Math.min(...raw.map((p) => p[0])), z: Math.min(...raw.map((p) => p[1])) }
  return {
    geometry: {
      ...g,
      walls: walls as RoomGeometry['walls'],
      vertices: raw.map(([x, z]) => [x - rebase.x, z - rebase.z] as [number, number]),
    },
    shiftM: { dx: (rawMean.x - before.x) / 1000, dz: (rawMean.z - before.z) / 1000 },
    rebaseMm: rebase,
    positionShiftMm: { [g.walls[next].id]: nextShift },
  }
}

/** Whether any two non-adjacent walls of the outline cross or touch. */
function crosses(p: [number, number][]): boolean {
  const n = p.length
  for (let a = 0; a < n; a++) for (let b = a + 2; b < n; b++) {
    if (a === 0 && b === n - 1) continue
    const [ax1, az1] = p[a], [ax2, az2] = p[(a + 1) % n], [bx1, bz1] = p[b], [bx2, bz2] = p[(b + 1) % n]
    const ix = Math.min(Math.max(ax1, ax2), Math.max(bx1, bx2)) - Math.max(Math.min(ax1, ax2), Math.min(bx1, bx2))
    const iz = Math.min(Math.max(az1, az2), Math.max(bz1, bz2)) - Math.max(Math.min(az1, az2), Math.min(bz1, bz2))
    if (ix >= 0 && iz >= 0) return true
  }
  return false
}

/** The narrowest the room is anywhere, mm: over the outline's own grid,
 *  each inside cell's run of inside cells across and along. */
function narrowest(p: [number, number][]): number {
  const xs = [...new Set(p.map((q) => q[0]))].sort((a, b) => a - b)
  const zs = [...new Set(p.map((q) => q[1]))].sort((a, b) => a - b)
  const inside = (x: number, z: number) => {
    let hit = false
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [xi, zi] = p[i], [xj, zj] = p[j]
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit
    }
    return hit
  }
  const cell = xs.slice(0, -1).map((x, i) => zs.slice(0, -1).map((z, j) => inside((x + xs[i + 1]) / 2, (z + zs[j + 1]) / 2)))
  let min = Infinity
  for (let i = 0; i < cell.length; i++) for (let j = 0; j < cell[i].length; j++) {
    if (!cell[i][j]) continue
    let a = i, b = i, c = j, e = j
    while (a > 0 && cell[a - 1][j]) a--
    while (b < cell.length - 1 && cell[b + 1][j]) b++
    while (c > 0 && cell[i][c - 1]) c--
    while (e < cell[i].length - 1 && cell[i][e + 1]) e++
    min = Math.min(min, xs[b + 1] - xs[a], zs[e + 1] - zs[c])
  }
  return min
}
