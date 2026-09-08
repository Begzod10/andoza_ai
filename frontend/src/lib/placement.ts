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
