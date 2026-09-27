/**
 * Shared "where does the next one go" math for furniture and lights.
 *
 * Every placement surface (desktop's furniture catalog in DesignPanel,
 * desktop's LightPanel, the mobile "+ Buyum qo'shish" sheet) needs the same
 * answer — a freshly-added item must not land exactly on top of the last one
 * of its kind, or it's invisible (and effectively lost) until the user
 * notices a second entry in a list somewhere and drags it apart. Kept here
 * once so a future placement surface inherits the fix instead of
 * reimplementing (and forgetting) it.
 */
import type { RoomGeometry } from '@/store/roomStore'
import { roomExtents } from '@/lib/roomDims'
import { halfExtentsToBounds, placementSpot, roomBoundsFromGeometry } from '@/lib/furnitureBounds'

/**
 * Stagger offset (mm) for the *n*th piece of a given furniture item already
 * in the room — cycles through a 1000mm range so a long run of the same
 * item doesn't walk off the visible floor.
 *
 * @param existingCount how many instances of this exact furniture item are
 *        already placed (0 for the first one).
 */
export function nextFurnitureOffsetMm(existingCount: number): { x: number; y: number } {
  const offset = (existingCount * 300) % 1000
  return { x: offset, y: offset }
}

/**
 * Drop point (mm) for the next light fixture — centred in the room (so it
 * starts somewhere sensible regardless of room size, unlike a hardcoded
 * point that can land past a wall in a small room) and nudged off however
 * many lights already exist so a run of them stays individually clickable
 * instead of stacking into one hitbox.
 *
 * @param existingCount how many lights are already placed (0 for the first).
 */
export function nextLightPositionMm(
  geometry: RoomGeometry,
  existingCount: number,
): { xMm: number; zMm: number } {
  const { W, D } = roomExtents(geometry)
  const jitter = (existingCount % 4) * 250
  return {
    xMm: Math.round((W * 1000) / 2 + jitter - 375),
    zMm: Math.round((D * 1000) / 2 + (existingCount % 3) * 250 - 250),
  }
}


/**
 * Drop point (store millimetres) for the next piece of furniture — the
 * stagger above, but kept inside the room's walls.
 *
 * `nextFurnitureOffsetMm` measures from the room's centre and asks nothing
 * about the room, which is fine until the room is small (the stagger walks
 * the model into a wall) or L-shaped (its bounding-box centre can be in the
 * cut-away corner, so the very first model starts life outside the room).
 *
 * @param sizeM the model's footprint in metres, when the catalog knows it. A
 *        conservative box is assumed otherwise — better a slightly cautious
 *        placement than one that clips a wall.
 */
export function furniturePlacementMm(
  geometry: RoomGeometry,
  existingCount: number,
  sizeM?: { w: number; d: number },
): { x: number; y: number } {
  const room = roomBoundsFromGeometry(geometry)
  const bounds = halfExtentsToBounds(((sizeM?.w ?? 0.6) * 1000) / 2, ((sizeM?.d ?? 0.6) * 1000) / 2)
  const spot = placementSpot(room, bounds, existingCount)
  // Plan millimetres (from the room's corner) back to the store's own frame,
  // which measures from the room's centre.
  return { x: spot.x - room.W / 2, y: spot.z - room.D / 2 }
}


/**
 * Where the next wall device (socket, switch, panel) goes along its wall, in
 * millimetres from the wall's position-0 end.
 *
 * The Elektr tab places these by clicking the exact spot on a plan. Added from
 * the corner arc instead there is no click to read, so they land near the
 * middle of the wall and are nudged off each other — the same reasoning as the
 * furniture stagger: a second device exactly on the first is invisible, and
 * effectively lost.
 *
 * @param wallLengthMm the wall's own length
 * @param existingCount how many devices are already on that wall
 * @param deviceWidthMm the faceplate's width, so it can't hang off an end
 */
export function nextElectricalPositionMm(
  wallLengthMm: number,
  existingCount: number,
  deviceWidthMm = 100,
): number {
  const margin = deviceWidthMm / 2 + 50
  const stagger = ((existingCount % 6) - 2.5) * 300
  const wanted = wallLengthMm / 2 + stagger
  // A wall shorter than the device leaves nothing to clamp into; centring it
  // is the least wrong answer and stays on the wall's midpoint.
  if (wallLengthMm <= margin * 2) return wallLengthMm / 2
  return Math.min(Math.max(wanted, margin), wallLengthMm - margin)
}
