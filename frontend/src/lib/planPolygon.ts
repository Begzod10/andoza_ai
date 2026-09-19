/**
 * Plan-space model of a polygon (N-wall) room for the 2D editors.
 *
 * The legacy rectangle plans (Mebelirovka, Chiroqlar, Elektr) draw the room
 * as `[0, W] × [0, D]` millimetres, and everything stored per item is in that
 * frame: furniture `x/y` and light `xMm/zMm` are world millimetres, where the
 * 3D scene puts the room's centre at the origin — so plan = world + (W/2, D/2).
 *
 * A polygon room keeps exactly that relation, so what the 2D plan shows lands
 * where the 3D scene draws it:
 *   - `NWallRoomShell` (pages/studio/three-d/RoomShell.tsx) centres the
 *     polygon on the MEAN of its vertices, so world = vertex − centroid;
 *   - `roomExtents` (lib/roomDims.ts) gives W/D as the polygon's bounding box,
 *     which is what `fixturePose` / furniture use for the (W/2, D/2) shift.
 * Hence plan vertex = vertex − centroid + (W/2, D/2). Note that a polygon's
 * plan bounding box therefore does NOT start at (0, 0) in general (only when
 * the vertex mean is the box centre) — callers use `minX/minZ`, not 0.
 *
 * Wall positions (`WallElement.position`, `PlacedElectrical.positionMm`) are
 * millimetres from the wall's "position 0" end. For a polygon edge that end is
 * the endpoint with the smaller coordinate on the edge's dominant axis — the
 * same `leftAlong` convention `wallDefsFromVertices` gives the 3D opening
 * layer, so a door placed on this plan sits where the 3D wall shows it.
 */
import type { RoomGeometry } from '@/store/roomStore'
import { roomExtents } from '@/lib/roomDims'

export interface PlanEdge {
  id: string
  /** Endpoints in plan mm, in polygon order. */
  x1: number
  z1: number
  x2: number
  z2: number
  /** Edge length, mm. */
  len: number
  /** Unit vector p1 → p2. */
  ux: number
  uz: number
  /** Unit normal pointing INTO the room. */
  nx: number
  nz: number
  /** Position-0 end (see file comment) and the unit direction of increasing position. */
  ox: number
  oz: number
  dx: number
  dz: number
  /** Cumulative perimeter coordinate of p1, mm (for wire routing). */
  start: number
}

export interface PlanPolygon {
  /** Bounding-box extents, mm — the same W/D the 3D views use. */
  W: number
  D: number
  /** Vertices in plan mm, polygon order. */
  vertices: [number, number][]
  edges: PlanEdge[]
  minX: number
  minZ: number
  maxX: number
  maxZ: number
  /** Total perimeter, mm. */
  perimeter: number
}

/** True for the legacy rectangle: exactly the four walls A, B, C, D. */
export function isAbcdRoom(geometry: RoomGeometry): boolean {
  if (geometry.walls.length !== 4) return false
  return ['A', 'B', 'C', 'D'].every((id) => geometry.walls.some((w) => w.id === id))
}

/**
 * Plan model for a polygon room, or null when the geometry carries no usable
 * outline (fewer than 3 vertices). Legacy A-B-C-D rooms are handled by the
 * rectangle code paths and never need this.
 */
export function planPolygon(geometry: RoomGeometry): PlanPolygon | null {
  const raw = geometry.vertices
  if (!raw || raw.length < 3) return null
  const n = raw.length
  const cx = raw.reduce((s, [x]) => s + x, 0) / n
  const cz = raw.reduce((s, [, z]) => s + z, 0) / n
  const ext = roomExtents(geometry)
  const W = ext.W * 1000
  const D = ext.D * 1000
  const vertices = raw.map(([x, z]) => [x - cx + W / 2, z - cz + D / 2] as [number, number])

  // Winding: one global sign from the shoelace area, as wallDefsFromVertices
  // does — a per-edge centroid test misfires on a concave notch.
  let area2 = 0
  for (let i = 0; i < n; i++) {
    const [x1, z1] = vertices[i]
    const [x2, z2] = vertices[(i + 1) % n]
    area2 += x1 * z2 - x2 * z1
  }
  const sign = area2 >= 0 ? 1 : -1

  const edges: PlanEdge[] = []
  let start = 0
  for (let i = 0; i < n; i++) {
    const [x1, z1] = vertices[i]
    const [x2, z2] = vertices[(i + 1) % n]
    const ex = x2 - x1
    const ez = z2 - z1
    const len = Math.hypot(ex, ez)
    if (len < 10) continue // degenerate edge — NWallRoomShell skips it too
    const ux = ex / len
    const uz = ez / len
    const nx = -uz * sign
    const nz = ux * sign
    const axisX = Math.abs(ex) >= Math.abs(ez)
    const originIsP1 = axisX ? x1 <= x2 : z1 <= z2
    const id = geometry.walls[i]?.id ?? String(i)
    edges.push({
      id, x1, z1, x2, z2, len, ux, uz, nx, nz,
      ox: originIsP1 ? x1 : x2,
      oz: originIsP1 ? z1 : z2,
      dx: originIsP1 ? ux : -ux,
      dz: originIsP1 ? uz : -uz,
      start,
    })
    start += len
  }
  if (edges.length < 3) return null

  const xs = vertices.map(([x]) => x)
  const zs = vertices.map(([, z]) => z)
  return {
    W, D, vertices, edges,
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minZ: Math.min(...zs), maxZ: Math.max(...zs),
    perimeter: start,
  }
}

/** Ray-casting point-in-polygon; boundary points count as inside. */
export function pointInPolygon(x: number, z: number, vertices: [number, number][]): boolean {
  let inside = false
  const n = vertices.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, zi] = vertices[i]
    const [xj, zj] = vertices[j]
    // On-segment test first, so a point exactly on a wall is "inside".
    const cross = (x - xi) * (zj - zi) - (z - zi) * (xj - xi)
    if (Math.abs(cross) < 1e-6 &&
        x >= Math.min(xi, xj) - 1e-6 && x <= Math.max(xi, xj) + 1e-6 &&
        z >= Math.min(zi, zj) - 1e-6 && z <= Math.max(zi, zj) + 1e-6) return true
    if ((zi > z) !== (zj > z)) {
      const xAt = xi + ((z - zi) * (xj - xi)) / (zj - zi)
      if (x < xAt) inside = !inside
    }
  }
  return inside
}

export interface EdgeHit {
  edge: PlanEdge
  /** Distance from the point to the edge, mm. */
  dist: number
  /** Wall position of the projection (mm from the position-0 end), clamped to [0, len]. */
  position: number
  /** The projected point on the edge, plan mm. */
  px: number
  pz: number
}

/** Wall position (from the position-0 end) of a plan point's projection, clamped. */
export function wallPositionAt(edge: PlanEdge, x: number, z: number): number {
  const s = (x - edge.ox) * edge.dx + (z - edge.oz) * edge.dz
  return Math.min(edge.len, Math.max(0, s))
}

/** Plan point at wall position `pos`, pushed `inset` mm into the room. */
export function pointAtWallPosition(edge: PlanEdge, pos: number, inset = 0): { x: number; z: number } {
  return {
    x: edge.ox + edge.dx * pos + edge.nx * inset,
    z: edge.oz + edge.dz * pos + edge.nz * inset,
  }
}

/** Closest edge to a plan point (every edge considered; caller applies a band). */
export function nearestEdge(poly: PlanPolygon, x: number, z: number): EdgeHit | null {
  let best: EdgeHit | null = null
  for (const edge of poly.edges) {
    const position = wallPositionAt(edge, x, z)
    const p = pointAtWallPosition(edge, position)
    const dist = Math.hypot(x - p.x, z - p.z)
    if (!best || dist < best.dist) best = { edge, dist, position, px: p.x, pz: p.z }
  }
  return best
}

/** Perimeter coordinate (mm from vertex 0, increasing in polygon order) of a wall position. */
export function perimeterCoord(edge: PlanEdge, pos: number): number {
  // Position runs from the origin end; the perimeter runs p1 → p2.
  const along = edge.ox === edge.x1 && edge.oz === edge.z1 ? pos : edge.len - pos
  return edge.start + along
}

/** Plan point at perimeter coordinate `c`, pushed `inset` mm into the room. */
export function perimeterPoint(poly: PlanPolygon, c: number, inset = 0): { x: number; z: number } {
  const P = poly.perimeter
  c = ((c % P) + P) % P
  let edge = poly.edges[poly.edges.length - 1]
  for (const e of poly.edges) {
    if (c >= e.start && c < e.start + e.len) { edge = e; break }
  }
  const t = c - edge.start
  return {
    x: edge.x1 + edge.ux * t + edge.nx * inset,
    z: edge.z1 + edge.uz * t + edge.nz * inset,
  }
}

/** Perimeter coordinates of the corners passed going from `from` to `to` in the given direction. */
export function perimeterCorners(poly: PlanPolygon, from: number, to: number, forward: boolean): number[] {
  const P = poly.perimeter
  const dist = forward ? (to - from + P) % P : (from - to + P) % P
  return poly.edges
    .map((e) => ({ c: e.start, d: forward ? (e.start - from + P) % P : (from - e.start + P) % P }))
    .filter((x) => x.d > 1e-3 && x.d < dist - 1e-3)
    .sort((a, b) => a.d - b.d)
    .map((x) => x.c)
}

/**
 * The polygon's vertices moved `d` mm along each corner's bisector — outward
 * for d > 0 (the wall band), inward for d < 0 (wire insets). Mitre-joined, with
 * the mitre capped so a very sharp corner cannot shoot off the plan.
 */
export function offsetPolygon(poly: PlanPolygon, d: number): [number, number][] {
  const es = poly.edges
  const n = es.length
  return es.map((e, i) => {
    const prev = es[(i - 1 + n) % n]
    // Corner at e.p1 = prev.p2. Outward normals of the two edges:
    const ax = -prev.nx, az = -prev.nz
    const bx = -e.nx, bz = -e.nz
    let mx = ax + bx, mz = az + bz
    const ml = Math.hypot(mx, mz)
    if (ml < 1e-6) { mx = ax; mz = az } else { mx /= ml; mz /= ml }
    // Mitre length: d / cos(half-angle), capped at 4d.
    const cosHalf = mx * ax + mz * az
    const k = Math.min(4, 1 / Math.max(cosHalf, 0.25))
    return [e.x1 + mx * d * k, e.z1 + mz * d * k] as [number, number]
  })
}

/** SVG `points` attribute for a vertex list. */
export function svgPoints(vertices: [number, number][]): string {
  return vertices.map(([x, z]) => `${x.toFixed(1)},${z.toFixed(1)}`).join(' ')
}
