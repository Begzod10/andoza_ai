/**
 * Keeping what is in a room where it is when the room is resized.
 *
 * Resizing moves the room's origin — a rectangle's centre, a polygon's
 * vertex mean — and changes its size, and what is inside is stored against
 * those: furniture in mm from the origin, lights from the left / back edge
 * (origin − half the footprint, LightFixtures' `xMm / 1000 - roomW / 2`),
 * sockets along their wall from its start. Each is re-expressed so it stands
 * exactly where it stood in the flat.
 */
import type { PlacedElectrical, PlacedFurniture, PlacedLight } from '@/store/types'

export interface RoomThings {
  furniture?: PlacedFurniture[]
  lights?: PlacedLight[]
  electricals?: PlacedElectrical[]
}

export function keepContentInPlace(
  things: RoomThings,
  originShiftM: { dx: number; dz: number },
  before: { W: number; D: number },
  after: { W: number; D: number },
  /** Per wall id, how far positions along it moved because its start did, mm. */
  wallShiftMm: Record<string, number> = {},
): RoomThings {
  const { dx, dz } = originShiftM
  return {
    ...(things.furniture ? { furniture: things.furniture.map((f) => ({ ...f, x: Math.round(f.x - dx * 1000), y: Math.round(f.y - dz * 1000) })) } : {}),
    ...(things.lights ? {
      lights: things.lights.map((l) => ({
        ...l,
        xMm: Math.round(l.xMm - dx * 1000 + ((after.W - before.W) / 2) * 1000),
        zMm: Math.round(l.zMm - dz * 1000 + ((after.D - before.D) / 2) * 1000),
      })),
    } : {}),
    ...(things.electricals ? {
      electricals: things.electricals.map((e) => (wallShiftMm[e.wallId] ? { ...e, positionMm: Math.round(e.positionMm + wallShiftMm[e.wallId]) } : e)),
    } : {}),
  }
}
