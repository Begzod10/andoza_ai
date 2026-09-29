/**
 * Where a wall-mounted thing (socket, switch, panel) sits in the world.
 *
 * A device is stored as a wall id plus millimetres along that wall, which says
 * nothing about where the wall is. Turning that into a world position was done
 * with a four-case switch on 'A' | 'B' | 'C' | 'D' whose `default` returned the
 * origin — so in a drawn or scanned room, whose walls are W1..Wn, every socket
 * rendered in the middle of the floor instead of on the wall it belongs to.
 *
 * One frame covers both: the wall's midpoint, the direction along it, and the
 * normal pointing into the room. The legacy rectangle is just the case where
 * those happen to be axis-aligned.
 */
import type { PolyWallDef } from '@/lib/wallDefsFromVertices'

export interface WallMountFrame {
  /** True midpoint of the wall, metres, in the room-centred frame. */
  midX: number
  midZ: number
  /** Unit vector along the wall, pointing the way `positionMm` grows. */
  dirX: number
  dirZ: number
  /** Unit normal pointing INTO the room — which way a faceplate faces. */
  nx: number
  nz: number
  /** Wall length, metres. */
  length: number
  /** Y rotation that turns a faceplate to face into the room. */
  ry: number
}

/**
 * The legacy rectangle's four walls, written out in the same terms, so the
 * caller needs no special case. These reproduce exactly what the old switch
 * did — A and C both measure from −W/2, B and D from −D/2.
 */
function abcdFrame(wallId: string, W: number, D: number): WallMountFrame | null {
  switch (wallId) {
    case 'A': return { midX: 0, midZ: -D / 2, dirX: 1, dirZ: 0, nx: 0, nz: 1, length: W, ry: 0 }
    case 'C': return { midX: 0, midZ: D / 2, dirX: 1, dirZ: 0, nx: 0, nz: -1, length: W, ry: Math.PI }
    case 'D': return { midX: -W / 2, midZ: 0, dirX: 0, dirZ: 1, nx: 1, nz: 0, length: D, ry: Math.PI / 2 }
    case 'B': return { midX: W / 2, midZ: 0, dirX: 0, dirZ: 1, nx: -1, nz: 0, length: D, ry: -Math.PI / 2 }
    default: return null
  }
}

export function wallMountFrame(
  wallId: string,
  W: number,
  D: number,
  polyDefs?: Record<string, PolyWallDef>,
): WallMountFrame | null {
  const abcd = abcdFrame(wallId, W, D)
  if (abcd) return abcd
  const d = polyDefs?.[wallId]
  if (!d) return null
  return {
    midX: d.midX, midZ: d.midZ,
    dirX: d.dirX, dirZ: d.dirZ,
    nx: d.normal.x, nz: d.normal.z,
    length: d.length,
    ry: d.ry,
  }
}

/**
 * World position of a device `alongM` metres along the wall, standing `offset`
 * metres proud of the wall face (half its own depth, so it sits on the wall
 * rather than in it).
 */
export function wallMountPoint(f: WallMountFrame, alongM: number, offset: number) {
  const t = alongM - f.length / 2
  return {
    x: f.midX + f.dirX * t + f.nx * offset,
    z: f.midZ + f.dirZ * t + f.nz * offset,
  }
}

/**
 * The inverse: how far along the wall a world point falls, in metres from the
 * position-0 end. Used while dragging, where the pointer gives a point on the
 * wall plane and the device has to follow it.
 */
export function alongWallM(f: WallMountFrame, p: { x: number; z: number }): number {
  return (p.x - f.midX) * f.dirX + (p.z - f.midZ) * f.dirZ + f.length / 2
}
