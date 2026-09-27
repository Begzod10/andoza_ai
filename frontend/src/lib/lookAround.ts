/**
 * The arithmetic behind turning an orbit into a look-around.
 *
 * An orbit and a look-around differ only in which end of the camera-to-pivot
 * offset is pinned. OrbitControls pins the pivot and flies the camera round
 * it; from inside a room that reads as the walls sliding past while the user
 * expects to be standing still. Pinning the camera end instead — keeping the
 * direction the controls just produced, and the distance the gesture started
 * with — turns the same gesture into looking around.
 *
 * Kept apart from three and React so it can be checked without a renderer.
 */
export interface Vec3 { x: number; y: number; z: number }

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const len = (v: Vec3) => Math.hypot(v.x, v.y, v.z)

/**
 * Where the pivot belongs once the camera is put back at `anchor`.
 *
 * Returns null when the camera has ended up on top of the pivot — there is no
 * direction to preserve then, and the caller should leave things alone rather
 * than invent one.
 */
export function repinnedTarget(
  /** Where the camera stood when the gesture began, and where it stays. */
  anchor: Vec3,
  /** Where OrbitControls has just moved the camera to. */
  cameraPos: Vec3,
  /** The pivot OrbitControls has just turned the camera around. */
  target: Vec3,
  /** Camera-to-pivot distance at the start of the gesture, kept so a turn
   *  does not also dolly. */
  distance: number,
): Vec3 | null {
  const offset = sub(target, cameraPos)
  const d = len(offset)
  if (d < 1e-6) return null
  const k = distance / d
  return {
    x: anchor.x + offset.x * k,
    y: anchor.y + offset.y * k,
    z: anchor.z + offset.z * k,
  }
}
