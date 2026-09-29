// ─── Geometry editing & derived metrics ───────────────────────────────────────
//
// Pure functions operating on RoomGeometry — no store state involved. Split
// out of roomStore.ts (and used by geometrySlice) so they can be unit tested
// and reasoned about independently of the Zustand wiring.

import { hasAbcdWalls } from '@/lib/roomDims'
import type { RoomGeometry } from '../types'

export const defaultGeometry = (): RoomGeometry => ({
  walls: [
    { id: 'A', length: 4000, elements: [] },
    { id: 'B', length: 3000, elements: [] },
    { id: 'C', length: 4000, elements: [] },
    { id: 'D', length: 3000, elements: [] },
  ],
})

/**
 * Sets one wall's length, and — for a polygon room — actually MOVES the
 * outline so the 3D view agrees with the number.
 *
 * A legacy ABCD rectangle is rendered from `walls[].length` alone, so writing
 * the length is the whole edit. A LiDAR-scanned or hand-drawn polygon is
 * rendered from `geometry.vertices` instead (RoomShell's NWallRoomShell,
 * wallDefsFromVertices, DoorLeaves, the scan overlay — all of them read the
 * vertices, none of them read `length`), so writing `length` on its own is a
 * number that changes on screen while the room does not. Here the edited edge
 * is stretched along its own direction and the rest of the loop is carried
 * with it:
 *
 *   - vertex `i` (the edge's start) and vertex `i - 1` stay put;
 *   - vertices `i + 1 … i + n - 2` all translate by the same delta, so every
 *     edge between them keeps its exact length AND direction;
 *   - the edge ending at the fixed vertex `i - 1` takes up the slack.
 *
 * On a rectilinear outline this is the behaviour a user expects: on a 4-edge
 * rectangle, lengthening edge 0 lengthens the opposite edge 2 by the same
 * amount and leaves it a rectangle — the polygon equivalent of the A–C / B–D
 * pairing the wizard rectangle has always had.
 *
 * Every wall length is then recomputed from the moved vertices, so the list
 * in the settings sheet, the perimeter and the smeta keep telling the truth
 * about the shape that is actually drawn.
 */
export function resizeWall(
  geometry: RoomGeometry,
  wallId: string,
  length: number,
): RoomGeometry {
  const idx = geometry.walls.findIndex((w) => w.id === wallId)
  if (idx === -1) return geometry

  const verts = geometry.vertices
  const n = geometry.walls.length
  // Only a real polygon is vertex-driven: an ABCD rectangle keeps the legacy
  // length-driven path even though it also carries auto-populated vertices.
  const isVertexDriven =
    !!verts && verts.length === n && n >= 3 && !hasAbcdWalls(geometry)

  // Length-only write, for a legacy rectangle or a polygon with no usable
  // vertex loop. An ABCD rectangle drops its (now stale) auto-populated
  // vertices exactly as this action always has — computeFloorArea and friends
  // prefer `vertices` when present, so leaving them behind would freeze the
  // area at the pre-edit shape. Anything else keeps whatever it carries.
  const lengthOnly = (): RoomGeometry => {
    const walls = geometry.walls.map((w) => (w.id === wallId ? { ...w, length } : w))
    return hasAbcdWalls(geometry) ? { walls } : { ...geometry, walls }
  }

  if (!isVertexDriven) return lengthOnly()

  const [x1, z1] = verts![idx]
  const [x2, z2] = verts![(idx + 1) % n]
  const current = Math.hypot(x2 - x1, z2 - z1)
  // Degenerate edge: no direction to stretch along, so fall back to writing
  // the number rather than producing NaN vertices.
  if (!(current > 1)) return lengthOnly()

  const k = (length - current) / current
  const ox = (x2 - x1) * k
  const oz = (z2 - z1) * k

  const moved = new Set<number>()
  for (let step = 1; step <= n - 2; step++) moved.add((idx + step) % n)

  const vertices = verts!.map(([x, z], i) =>
    moved.has(i) ? ([x + ox, z + oz] as [number, number]) : ([x, z] as [number, number]),
  )

  return {
    vertices,
    walls: geometry.walls.map((w, i) => {
      const [ax, az] = vertices[i]
      const [bx, bz] = vertices[(i + 1) % n]
      return { ...w, length: Math.hypot(bx - ax, bz - az) }
    }),
  }
}

// ─── Pure derived metric functions ───────────────────────────────────────────

/**
 * Floor area in mm² — multiply A×B (opposite wall pair averages).
 * Assumes a rectangular room where A/C are parallel and B/D are parallel.
 */
export function computeFloorArea(geometry: RoomGeometry): number {
  if (geometry.vertices && geometry.vertices.length >= 3) {
    // Shoelace formula — vertices in mm
    const verts = geometry.vertices
    const n = verts.length
    let area = 0
    for (let i = 0; i < n; i++) {
      const [x1, y1] = verts[i]
      const [x2, y2] = verts[(i + 1) % n]
      area += x1 * y2 - x2 * y1
    }
    return Math.abs(area) / 2  // mm²
  }
  // Legacy rectangle fallback
  const wallA = geometry.walls.find((w) => w.id === 'A')
  const wallB = geometry.walls.find((w) => w.id === 'B')
  if (!wallA || !wallB) return 0
  const wallC = geometry.walls.find((w) => w.id === 'C')
  const wallD = geometry.walls.find((w) => w.id === 'D')
  const lenAC = ((wallA.length + (wallC?.length ?? wallA.length)) / 2)
  const lenBD = ((wallB.length + (wallD?.length ?? wallB.length)) / 2)
  return lenAC * lenBD // mm²
}

/** Perimeter in mm. */
export function computePerimeter(geometry: RoomGeometry): number {
  return geometry.walls.reduce((sum, w) => sum + w.length, 0)
}

/**
 * Net wall area in mm² — gross wall area minus opening areas.
 * @param ceilingH ceiling height in mm
 */
export function computeNetWallArea(
  geometry: RoomGeometry,
  ceilingH: number,
): number {
  return geometry.walls.reduce((sum, wall) => {
    const gross = wall.length * ceilingH
    const openings = wall.elements.reduce(
      (s, el) => s + el.width * el.height,
      0,
    )
    return sum + Math.max(0, gross - openings)
  }, 0)
}

/** Total count of all wall openings across every wall. */
export function computeOpeningsCount(geometry: RoomGeometry): number {
  return geometry.walls.reduce((sum, w) => sum + w.elements.length, 0)
}
