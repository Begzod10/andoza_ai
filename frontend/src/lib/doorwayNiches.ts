import { wallMountFrame, wallMountPoint, type WallMountFrame } from './wallMountFrame'
import type { PolyWallDef } from './wallDefsFromVertices'

/**
 * The patch of floor inside each doorway.
 *
 * The room's floor stops at the wall line, so the 200 mm niche a door hangs in
 * has no floor of its own — it used to be filled with a dark threshold plate,
 * then with a flat patch of the floor's colour, and neither is what the room
 * is laid with. These rectangles let the real laying pattern be drawn in the
 * niche as well, clipped to it, so the planks or tiles carry straight on under
 * the door with their own joints.
 *
 * Returned in the room's centred XZ frame — the same one the floor pattern is
 * built in, which is what makes the joints line up rather than merely match.
 */
export interface DoorwayNiche {
  wallId: string
  elId: string
  /** Four corners, in order, ready to clip against. */
  polygon: [number, number][]
}

export interface NicheOpening {
  id: string
  type: string
  /** Millimetres from the wall's position-0 end to the opening's left edge. */
  position: number
  width: number
}

export interface NicheWall {
  id: string
  elements?: readonly NicheOpening[]
}

/**
 * How far into the wall the niche runs, and how far past the opening's edges
 * it reaches. The overshoot covers the jamb lining, so no hairline of bare
 * slab shows between the pattern and the reveal.
 */
const OVERSHOOT = 0.01

export function doorwayNiches(
  walls: readonly NicheWall[],
  W: number,
  D: number,
  polyDefs: Record<string, PolyWallDef>,
  revealDepth: number,
): DoorwayNiche[] {
  const out: DoorwayNiche[] = []
  for (const wall of walls) {
    const frame = wallMountFrame(wall.id, W, D, polyDefs)
    if (!frame) continue
    for (const el of wall.elements ?? []) {
      if (el.type !== 'eshik') continue
      out.push({
        wallId: wall.id,
        elId: el.id,
        polygon: nicheRect(frame, el.position / 1000, el.width / 1000, revealDepth),
      })
    }
  }
  return out
}

/** One niche, as a rectangle: across the opening, and from the wall face back
 *  to the reveal's outer edge. */
function nicheRect(
  f: WallMountFrame,
  leftEdgeM: number,
  widthM: number,
  depth: number,
): [number, number][] {
  const a = leftEdgeM - OVERSHOOT
  const b = leftEdgeM + widthM + OVERSHOOT
  // The normal points INTO the room, so the niche is behind the wall face.
  const near = OVERSHOOT
  const far = -(depth + OVERSHOOT)
  const p = (along: number, off: number): [number, number] => {
    const { x, z } = wallMountPoint(f, along, off)
    return [x, z]
  }
  return [p(a, near), p(b, near), p(b, far), p(a, far)]
}
