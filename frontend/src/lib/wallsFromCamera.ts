/**
 * Which walls the camera is standing behind.
 *
 * A wall is a single-sided plane: seen from outside the room it is culled and
 * simply is not there, which is what lets you look into a flat from above. But
 * everything HUNG on that wall — its door, its window, its skirting, its
 * sockets — is ordinary double-sided geometry, so those stayed in mid-air
 * after the wall they belong to had gone, a doorway's worth of joinery
 * floating in front of the room.
 *
 * This answers the same question the renderer answers when it culls: is the
 * camera on the room side of this wall, or the outside? The attachments then
 * follow their wall.
 */

export interface WallPlane {
  id: string
  /** A point on the wall, in world metres. */
  midX: number
  midZ: number
  /** Unit normal pointing INTO the room. */
  nx: number
  nz: number
}

/**
 * How far past the plane the camera must travel before the answer flips,
 * metres. Without a band, a camera sitting exactly in a wall's plane — which
 * is where it ends up when someone orbits along it — flickers the whole wall's
 * furniture on and off every frame.
 */
const HYSTERESIS_M = 0.08

export function wallsBehindCamera(
  walls: readonly WallPlane[],
  camX: number,
  camZ: number,
  /** What was hidden last time, so a wall has to be clearly back inside
   *  before its attachments return. */
  previous: ReadonlySet<string> = new Set(),
): Set<string> {
  const out = new Set<string>()
  for (const w of walls) {
    // Positive when the camera is on the side the room is on.
    const side = (camX - w.midX) * w.nx + (camZ - w.midZ) * w.nz
    const wasHidden = previous.has(w.id)
    if (side < (wasHidden ? HYSTERESIS_M : -HYSTERESIS_M)) out.add(w.id)
  }
  return out
}

export function sameWallSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const id of a) if (!b.has(id)) return false
  return true
}
