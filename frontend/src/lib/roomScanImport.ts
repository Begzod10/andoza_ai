/**
 * Types emitted by the native RoomPlan scanner and helpers to convert a scan
 * into the payload `roomStore.loadRoom` accepts.
 *
 * All distances in ScannedRoom are in **metres** (as RoomPlan produces them),
 * and `snapToFourWalls` works in millimetres because the rounding is easier to
 * reason about there. `loadRoom` speaks the API's units — metres, with opening
 * positions as 0..1 centre fractions — so `scanToApiGeometry` converts back
 * out at the boundary rather than handing the store raw millimetres.
 */

import type { RoomPayloadGeometry } from '@/store/roomStore'
import { storeElementToApiPosition } from './wallPositions'

// ─── Native scanner output types ─────────────────────────────────────────────

export interface ScannedOpening {
  type: 'eshik' | 'deraza' | 'balkon'
  /** Distance from the START vertex of this wall to the left edge of the opening, metres. */
  offsetM: number
  widthM: number
  heightM: number
  /** Floor-to-sill distance, metres. 0 for doors. */
  sillM: number
}

export interface ScannedWall {
  /** World-space floor-plane coordinates of the wall's two endpoints, metres. */
  startX: number
  startZ: number
  endX: number
  endZ: number
  heightM: number
  openings: ScannedOpening[]
}

export interface ScannedRoom {
  /** Ceiling height in metres. */
  ceilingHeight: number
  walls: ScannedWall[]
}

// ─── snapToFourWalls ─────────────────────────────────────────────────────────
/**
 * Snaps an arbitrary polygon of wall segments to an axis-aligned bounding rectangle
 * (walls A/B/C/D).  RoomPlan often returns 5-8 segments for a rectangular room because
 * it finds each stud-bay span separately; this collapses them to the 4 canonical sides.
 *
 * The function:
 *   1. Builds the bounding box of all wall endpoints.
 *   2. Classifies each raw wall segment to the nearest bounding edge (A/B/C/D).
 *   3. Re-projects every opening's world position onto its edge, measuring from the
 *      interior-left corner (the direction you see when standing inside facing the wall).
 *
 * Wall conventions (standing inside, looking at the wall):
 *   A – back  (z ≈ minZ) – runs left→right (increasing X)
 *   B – right (x ≈ maxX) – runs left→right (increasing Z)
 *   C – front (z ≈ maxZ) – runs left→right (decreasing X, i.e. rightmost X first)
 *   D – left  (x ≈ minX) – runs left→right (decreasing Z)
 */

const M_TO_MM = 1000

interface RectWall {
  id: 'A' | 'B' | 'C' | 'D'
  lengthMm: number
  openings: ScannedOpening[]   // offsetM measured from interior-left edge
}

export interface SnappedRect {
  widthMm: number   // length of walls A & C
  depthMm: number   // length of walls B & D
  ceilingMm: number
  rectWalls: RectWall[]
}

export function snapToFourWalls(room: ScannedRoom): SnappedRect {
  const xs = room.walls.flatMap(w => [w.startX, w.endX])
  const zs = room.walls.flatMap(w => [w.startZ, w.endZ])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)
  const widthM = maxX - minX
  const depthM = maxZ - minZ

  const classify = (mx: number, mz: number): 'A' | 'B' | 'C' | 'D' => {
    const dA = Math.abs(mz - minZ)
    const dC = Math.abs(mz - maxZ)
    const dB = Math.abs(mx - maxX)
    const dD = Math.abs(mx - minX)
    const m = Math.min(dA, dB, dC, dD)
    if (m === dA) return 'A'
    if (m === dC) return 'C'
    if (m === dB) return 'B'
    return 'D'
  }

  const grouped: Record<'A' | 'B' | 'C' | 'D', ScannedOpening[]> = { A: [], B: [], C: [], D: [] }

  for (const wall of room.walls) {
    const mx = (wall.startX + wall.endX) / 2
    const mz = (wall.startZ + wall.endZ) / 2
    const side = classify(mx, mz)

    const wallDirX = wall.endX - wall.startX
    const wallDirZ = wall.endZ - wall.startZ
    const wallLen = Math.sqrt(wallDirX ** 2 + wallDirZ ** 2)
    if (wallLen < 0.01) continue
    const unitX = wallDirX / wallLen
    const unitZ = wallDirZ / wallLen

    for (const op of wall.openings) {
      // World position of opening centre along the raw wall
      const centerAlong = op.offsetM + op.widthM / 2
      const ocX = wall.startX + unitX * centerAlong
      const ocZ = wall.startZ + unitZ * centerAlong

      // Convert to position from interior-left corner on the snapped rectangle
      let posM: number
      if (side === 'A') posM = ocX - minX - op.widthM / 2        // left = minX
      else if (side === 'B') posM = ocZ - minZ - op.widthM / 2   // left = minZ
      else if (side === 'C') posM = maxX - ocX - op.widthM / 2   // left = maxX
      else posM = maxZ - ocZ - op.widthM / 2                       // left = maxZ (D)

      grouped[side].push({ ...op, offsetM: Math.max(0, posM) })
    }
  }

  const rectWalls: RectWall[] = (
    [
      { id: 'A' as const, lengthM: widthM },
      { id: 'B' as const, lengthM: depthM },
      { id: 'C' as const, lengthM: widthM },
      { id: 'D' as const, lengthM: depthM },
    ]
  ).map(({ id, lengthM }) => ({
    id,
    lengthMm: Math.round(lengthM * M_TO_MM),
    openings: grouped[id],
  }))

  return {
    widthMm: Math.round(widthM * M_TO_MM),
    depthMm: Math.round(depthM * M_TO_MM),
    ceilingMm: Math.round(room.ceilingHeight * M_TO_MM),
    rectWalls,
  }
}

// ─── scanToApiGeometry ───────────────────────────────────────────────────────
/**
 * Full pipeline: ScannedRoom (metres) → the geometry `loadRoom` expects.
 *
 * The output is in the API's units, not the store's: metres, with each
 * opening's CENTRE as a 0..1 fraction of its wall (see `RoomPayloadGeometry`).
 * `loadRoom` converts those to the store's millimetre left edges itself, so
 * handing it millimetres produced a room 1000× too large — every wall past the
 * 3D camera's far plane, and past the backend's 25 m limit.
 *
 * Returns the ceiling height separately, in metres, for the payload's
 * `ceiling_h`.
 */
export function scanToApiGeometry(
  room: ScannedRoom,
): { geometry: RoomPayloadGeometry; ceilingM: number } {
  const { rectWalls, ceilingMm } = snapToFourWalls(room)

  const walls: RoomPayloadGeometry['walls'] = rectWalls.map((rw) => ({
    id: rw.id,
    length: rw.lengthMm / M_TO_MM,
    elements: rw.openings.map((op) => {
      // Round in millimetres — the unit the rest of this file and the studio
      // work in — then divide back out, so the metres handed over are whole
      // millimetres rather than the scanner's raw floats.
      const widthMm = Math.round(op.widthM * M_TO_MM)
      const positionMm = Math.round(op.offsetM * M_TO_MM)
      return {
        type: op.type,
        width: widthMm / M_TO_MM,
        height: Math.round(op.heightM * M_TO_MM) / M_TO_MM,
        sill_height: Math.round(op.sillM * M_TO_MM) / M_TO_MM,
        // Left edge → centre fraction via wallPositions.ts, the one place
        // that conversion is allowed to live.
        position: storeElementToApiPosition(
          { position: positionMm, width: widthMm },
          rw.lengthMm,
        ),
      }
    }),
  }))

  return { geometry: { walls }, ceilingM: ceilingMm / M_TO_MM }
}
