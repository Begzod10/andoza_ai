import type { Room } from '@/lib/api'
import type { RoomGeometry } from '@/store/roomStore'
import { neighbourOpenings, withNeighbourOpenings } from '@/lib/borrowedOpenings'
import { roomExtents } from '@/lib/roomDims'
import { placedSiblingRooms } from '@/pages/studio/three-d/helpers'

/**
 * The room's geometry with the doors and windows its neighbours' walls lend it, for laying out
 * furniture and floor lamps — never to store.
 *
 * A door in the partition between two rooms is stored in ONE room's geometry, and the other room
 * only borrows it at render time (lib/borrowedOpenings). A layout read off the room's own openings
 * alone stood an armchair in front of that door in the borrowing room: drawn there, opening there,
 * and not kept clear. This hands the layout the same openings the studio cuts into the room's walls
 * (`withNeighbourOpenings`, mapped onto this room's wall with its own offset and its hinge and swing
 * turned round), with the flat placed exactly as the studio places it when this room is open
 * (`placedSiblingRooms`, from the room's `layoutPos`).
 *
 * `rooms` is the apartment's list as the server holds it (`getRooms`, the studio's `['apt-rooms']`);
 * the room itself may be in it and is left out. Gives `geometry` itself when nothing is borrowed.
 */
export function withFlatOpenings(
  geometry: RoomGeometry,
  roomId: string,
  rooms: readonly Room[],
  layoutPos: { x: number; z: number } | null | undefined,
): RoomGeometry {
  const { W, D } = roomExtents(geometry)
  const neighbours = placedSiblingRooms([...rooms], roomId, W, D, layoutPos ?? null)
  if (neighbours.length === 0) return geometry
  const found = neighbourOpenings({ id: roomId, geometry, offsetXM: 0, offsetZM: 0 }, neighbours, { activeId: roomId })
  return withNeighbourOpenings(geometry, found)
}
