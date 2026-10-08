/**
 * One door, two rooms.
 *
 * Adding a room through a wall (see newRoomFromWall.ts) used to create it as a
 * blank four-walled box. That is wrong whenever the tapped wall already has a
 * door in it: the door is then opening onto the new room's solid partition, and
 * the new room is a sealed box you can see but never walk into. The user put it
 * plainly — "if there is a door on the wall in front of new room, that door
 * should work for both rooms".
 *
 * Two rooms cannot literally share one opening in this data model: each room
 * owns its own walls and its own `elements`, and the renderer cuts a hole per
 * room. So "shared" means the SAME hole in the SAME place in both walls, which
 * is what a real doorway through a partition is — a hole in one wall, seen from
 * both sides. This module works out where that is.
 *
 * Units are the project's usual trap, twice over. The STORE is millimetres with
 * `position` measured to the opening's LEFT EDGE; the API is metres with
 * `position` the opening's CENTRE as a 0..1 fraction of the wall. This module
 * takes the former and returns the latter, which is why everything is named
 * `…Mm` or `…M` and why the fraction is produced by `storeElementToApiPosition`
 * rather than by hand.
 */
import { planPolygon } from '@/lib/planPolygon'
import { resolveElementPositions, storeElementToApiPosition } from '@/lib/wallPositions'
import { LEGACY_WALL_SIDE, wallSideOf, type RoomSide } from '@/lib/newRoomFromWall'
import type { WallElement as ApiWallElement } from '@/lib/api/rooms'
import type { RoomGeometry, WallElement } from '@/store/roomStore'

/**
 * Which kinds of opening are reproduced in the new room.
 *
 * Doors only, deliberately.
 *
 * `eshik` is the whole point: a door is what makes two rooms one circulation
 * space instead of two sealed boxes, and it is what the user asked for.
 *
 * `deraza` (window) is NOT copied. A window in that wall was looking OUTSIDE;
 * building a room against it does not turn it into a window between two rooms,
 * it means the user has built over their own window. Neither answer is
 * architecturally right — the honest fix is for the user to move the window —
 * but of the two wrong answers, inventing an interior window between a bedroom
 * and a lounge is the surprising one, and nobody asked for it. Leaving it out
 * also leaves the old room's wall exactly as it was, so nothing the user drew
 * is altered behind their back.
 *
 * `balkon` is NOT copied for the same reason and more strongly: a balcony
 * opening leads to a balcony, which is outdoors and is not the new room. A
 * balcony door duplicated into an interior partition would read as a doorway
 * to a balcony that is not there.
 */
export const SHARED_OPENING_TYPES: ReadonlyArray<WallElement['type']> = ['eshik']

/** Rounding slack, millimetres. The store rounds positions to the millimetre
 *  and the API round-trips through a 0..1 fraction, so an opening that fits the
 *  facing wall exactly can come back a fraction of a millimetre over. That is
 *  not a door hanging off a corner, so it is not worth dropping one for. */
const FIT_TOLERANCE_MM = 1

export interface SharedOpenings {
  /** Which wall of the new A-B-C-D room these belong in. */
  wallId: string
  /** The openings, in API units: widths/heights/sills in METRES, `position` the
   *  opening's CENTRE as a 0..1 fraction of the facing wall. Ready to hand to
   *  `newRoomGeometry`. */
  elements: ApiWallElement[]
  /** Doors that belong on the facing wall but could not be put there, because
   *  the facing wall is shorter than the tapped one and the door falls past its
   *  end. Reported rather than swallowed so a caller can tell the user; see the
   *  fit rule below for why they are dropped rather than moved. */
  dropped: number
}

const OPPOSITE_SIDE: Record<RoomSide, RoomSide> = {
  north: 'south', south: 'north', east: 'west', west: 'east',
}

/**
 * Which wall of the newly created room faces back towards the room it was
 * created from.
 *
 * The new room is always a plain A-B-C-D rectangle, so this is a lookup, not
 * geometry. The step that is easy to get backwards is the one in the middle: a
 * room placed to the EAST meets the old room with its WEST wall. The side the
 * room went to and the wall that faces back are opposites, and writing the four
 * answers out directly is how you end up with a door in the far wall of the new
 * room — a door to nowhere, in a room still sealed off from the one it was
 * added to. So the side is flipped first, and then resolved through the very
 * same `LEGACY_WALL_SIDE` map that `wallSideOf` reads, which cannot disagree
 * with itself.
 */
export function facingWallIdFor(side: RoomSide): string | null {
  const facing = OPPOSITE_SIDE[side]
  if (!facing) return null
  return Object.keys(LEGACY_WALL_SIDE).find((id) => LEGACY_WALL_SIDE[id] === facing) ?? null
}

/**
 * The unit direction, in the plan frame (+x east, +z south), that the tapped
 * wall's `position` grows along.
 *
 * This is the difference between a door 1.5 m north of centre and one 1.5 m
 * south of it, and it is not a constant: a polygon edge measures from its own
 * start vertex and so runs whichever way the outline was wound (see the comment
 * in planPolygon.ts about edges that run "the decreasing way"). The legacy
 * rectangle is the simple case — A and C both measure from the minimum x, B and
 * D both from the minimum z, exactly as `abcdFrame` in wallMountFrame.ts
 * states — so opposite walls there are NOT mirrored.
 */
function positionDirectionOf(
  geometry: RoomGeometry,
  wallId: string,
): { dx: number; dz: number } | null {
  const poly = planPolygon(geometry)
  if (poly) {
    const edge = poly.edges.find((e) => e.id === wallId)
    return edge ? { dx: edge.dx, dz: edge.dz } : null
  }
  if (wallId === 'A' || wallId === 'C') return { dx: 1, dz: 0 }
  if (wallId === 'B' || wallId === 'D') return { dx: 0, dz: 1 }
  return null
}

/**
 * The doors the new room inherits from the wall it is created through, and the
 * wall of the new room they go in. Null when the tapped wall cannot be read at
 * all, which is the same condition that already stops the room being placed.
 *
 * `geometry` is the CURRENT room in store units (millimetres, left-edge
 * positions); `newRoomMm` is the new room's own width and depth in millimetres,
 * already clamped by the caller to the same values `newRoomGeometry` will use —
 * otherwise the door would be fitted to a wall length the room does not end up
 * having.
 *
 * ## Where the door goes
 *
 * `newRoomCentreFromWall` centres the new room on the tapped wall's MIDPOINT,
 * so the two walls share a midpoint — but not a length. A door in the middle of
 * a 5 m wall is at fraction 0.5; the same physical door in the facing 3 m wall
 * is also at 0.5, but a door 1.8 m off-centre is at fraction 0.86 of the 5 m
 * wall and 1.1 of the 3 m one. Fractions do not carry across walls of different
 * lengths, so everything here is done in real millimetres measured from the
 * shared midpoint, and the fraction is computed once at the very end against
 * the facing wall's own length.
 *
 * The offset is measured along the axis the two walls SHARE: z for a room going
 * east or west, x for one going north or south. For a slanted wall in a drawn
 * room the wall itself does not lie on that axis, so the offset is its
 * projection onto it — the new room is axis-aligned and sits at a fixed plan
 * coordinate, so the projected offset is where the door physically is relative
 * to it. The projection shortens as the wall leans, which is the honest answer
 * for a case the four-sided layout model can only approximate anyway.
 *
 * ## When it does not fit
 *
 * A door whose span would run past either end of the facing wall is DROPPED,
 * and counted in `dropped`. The alternative — sliding it back onto the wall —
 * would put the two halves of one doorway in different places, so you would
 * walk at a door in one room and arrive at blank wall in the other, and a
 * doorway cut across a corner is not something that can be built at all. A
 * missing door in a too-small room is visibly a missing door and the user can
 * make the room wider; a silently displaced one looks like a working door and
 * is not.
 */
export function sharedOpeningsFor(
  geometry: RoomGeometry,
  tappedWallId: string,
  newRoomMm: { widthMm: number; depthMm: number },
): SharedOpenings | null {
  const side = wallSideOf(geometry, tappedWallId)
  if (!side) return null
  const wallId = facingWallIdFor(side)
  if (!wallId) return null

  const tapped = geometry.walls.find((w) => w.id === tappedWallId)
  const dir = positionDirectionOf(geometry, tappedWallId)
  if (!tapped || !dir) return null

  // East/west rooms meet along z (the depth); north/south ones along x (the
  // width). That one choice fixes both the axis the offset is measured on and
  // which of the new room's dimensions the facing wall is as long as.
  const alongZ = side === 'east' || side === 'west'
  const facingLenMm = alongZ ? newRoomMm.depthMm : newRoomMm.widthMm
  // `tapped.length` rather than the polygon edge's measured length: every
  // stored `position` on this wall was measured against this number, so using
  // anything else would shift the doors by however far the two have drifted.
  const tappedLenMm = tapped.length
  if (!(tappedLenMm > 0) || !(facingLenMm > 0)) return null

  const dirAlongMm = alongZ ? dir.dz : dir.dx

  // Auto-placed openings still read `position: 0` until they are resolved —
  // the trap `wallElementsToApiPositions` exists for. A centred door read raw
  // would be mapped as if it sat against the start corner.
  const resolved = resolveElementPositions(tapped.elements, tappedLenMm)

  const elements: ApiWallElement[] = []
  let dropped = 0
  for (const el of resolved) {
    if (!SHARED_OPENING_TYPES.includes(el.type)) continue

    const centreOnTappedMm = el.position + el.width / 2
    const offsetFromSharedCentreMm = (centreOnTappedMm - tappedLenMm / 2) * dirAlongMm
    const centreOnFacingMm = facingLenMm / 2 + offsetFromSharedCentreMm
    const leftOnFacingMm = centreOnFacingMm - el.width / 2

    if (
      leftOnFacingMm < -FIT_TOLERANCE_MM ||
      leftOnFacingMm + el.width > facingLenMm + FIT_TOLERANCE_MM
    ) {
      dropped += 1
      continue
    }

    // Everything that makes the two sides the same doorway rather than two
    // doorways of similar size: the leaf's width and height, how high off the
    // floor it starts, and the catalogue style it was drawn from.
    elements.push({
      type: el.type,
      width: el.width / 1000,
      height: el.height / 1000,
      sill_height: (el.sill_height ?? 0) / 1000,
      position: storeElementToApiPosition({ position: leftOnFacingMm, width: el.width }, facingLenMm),
      style_id: el.styleId ?? null,
      sashes: el.sashes ?? null,
    })
  }

  return { wallId, elements, dropped }
}
