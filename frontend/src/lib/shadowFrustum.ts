/**
 * An orthographic shadow camera that actually contains the room.
 *
 * A directional light's `shadow.camera` bounds are in the LIGHT's view space,
 * not the world's — which is why a box sized from the floor plan looks correct
 * and silently isn't. It matches only for a sun straight overhead. As the sun
 * drops toward the horizon the room's silhouette from up there grows tall and
 * slides sideways, and anything that falls outside the frustum is sampled as
 * having no occluder in front of it at all. The symptom is not a missing
 * shadow, it is the opposite: a hard-edged wedge of full sunlight lying across
 * walls that sit under a closed ceiling, with the frustum's straight edge for
 * a boundary.
 *
 * Projecting the room's eight corners onto the light's own axes costs eight
 * dot products and is right from every direction.
 */
import * as THREE from 'three'

export interface ShadowFrustum {
  /** Half-width, for camera left/right. */
  hw: number
  /** Half-height, for camera top/bottom. */
  hh: number
  near: number
  far: number
}

/** Slack around the room, in metres — covers the corner posts and wall rims
 *  that sit just outside the interior box, plus a texel of safety. */
const MARGIN = 0.6

/**
 * @param position where the light stands. It is assumed to look at the origin,
 *        which is what a `directionalLight` with an untouched `target` does.
 * @param width/height/depth the room's interior box: ±width/2 on X, ±depth/2
 *        on Z, and 0…height on Y — the floor is at y = 0, not at −height/2.
 */
export function fitShadowFrustum(
  position: readonly [number, number, number],
  width: number,
  height: number,
  depth: number,
): ShadowFrustum {
  const eye = new THREE.Vector3(position[0], position[1], position[2])
  const fwd = eye.clone().negate().normalize()
  // Any up that is not parallel to the view direction; three's own camera does
  // the same dance for a light hanging straight overhead.
  const up = Math.abs(fwd.y) > 0.999 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0)
  const right = new THREE.Vector3().crossVectors(fwd, up).normalize()
  const trueUp = new THREE.Vector3().crossVectors(right, fwd).normalize()

  let hw = 0
  let hh = 0
  let near = Infinity
  let far = -Infinity
  const corner = new THREE.Vector3()
  for (const sx of [-1, 1]) {
    for (const sy of [0, 1]) {
      for (const sz of [-1, 1]) {
        corner.set((sx * width) / 2, sy * height, (sz * depth) / 2).sub(eye)
        hw = Math.max(hw, Math.abs(corner.dot(right)))
        hh = Math.max(hh, Math.abs(corner.dot(trueUp)))
        const along = corner.dot(fwd)
        near = Math.min(near, along)
        far = Math.max(far, along)
      }
    }
  }

  return {
    hw: hw + MARGIN,
    hh: hh + MARGIN,
    // A near plane behind the light clips nothing and only wastes depth
    // precision; 0.1 is as close as it ever needs to come.
    near: Math.max(0.1, near - MARGIN),
    far: far + MARGIN,
  }
}
