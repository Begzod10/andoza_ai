/**
 * The room's extents, in the one orientation every view has to agree on.
 *
 * Walls are named A (back), B (right), C (front), D (left), and every renderer
 * places them that way: `wallFrames` runs A/C along world X and B/D along
 * world Z, the 2D plan draws A across the top and B down the right, the
 * electrical plan calls A horizontal. So the room's X extent is wall A's
 * length and its Z extent is wall B's.
 *
 * The synthetic `room.width` / `room.length` fields are assigned the other way
 * round (`width` = wall B, `length` = wall A), and reading them as X/Z is what
 * used to transpose the 3D room against its own walls — an 8×5 room came out
 * 5×8, so the plan and the 3D viewport disagreed and openings on wall A landed
 * off the wall. Derive extents here, from the walls themselves, and that class
 * of bug has one place left to live.
 */
import type { RoomGeometry } from '@/store/roomStore'

export interface RoomExtents {
  /** Interior width in metres — along world X, the length of walls A and C. */
  W: number
  /** Interior depth in metres — along world Z, the length of walls B and D. */
  D: number
}

const FALLBACK: RoomExtents = { W: 4, D: 3 }

function positive(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && isFinite(value) && value > 0 ? value : fallback
}

/**
 * @param fallback used only when the geometry carries no usable walls — pass
 *        `{ W: room.length, D: room.width }`, matching how those synthetic
 *        fields are derived in StudioPage.
 */
export function roomExtents(
  geometry: RoomGeometry,
  fallback: Partial<RoomExtents> = {},
): RoomExtents {
  const wallA = geometry.walls.find((w) => w.id === 'A')
  const wallB = geometry.walls.find((w) => w.id === 'B')

  const isLegacyAbcd =
    geometry.walls.length === 4 && wallA !== undefined && wallB !== undefined

  if (isLegacyAbcd) {
    return {
      W: positive(wallA.length / 1000, positive(fallback.W, FALLBACK.W)),
      D: positive(wallB.length / 1000, positive(fallback.D, FALLBACK.D)),
    }
  }

  // N-wall rooms (from a RoomPlan scan) have no A/B pair — use the polygon's
  // bounding box, which is already in the same X/Z frame.
  const verts = geometry.vertices
  if (verts && verts.length >= 2) {
    const xs = verts.map(([x]) => x)
    const zs = verts.map(([, z]) => z)
    return {
      W: positive((Math.max(...xs) - Math.min(...xs)) / 1000, positive(fallback.W, FALLBACK.W)),
      D: positive((Math.max(...zs) - Math.min(...zs)) / 1000, positive(fallback.D, FALLBACK.D)),
    }
  }

  return {
    W: positive(fallback.W, FALLBACK.W),
    D: positive(fallback.D, FALLBACK.D),
  }
}
