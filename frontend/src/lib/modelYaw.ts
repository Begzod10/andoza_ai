import * as THREE from 'three'
import type { FurnitureRole } from '@/lib/furnitureRole'

/**
 * Which way a catalog model faces. Turning the model about +Y by this many degrees (three.js
 * `rotation.y = yaw·π/180`, the same sense as a placement's `rotation`) puts its back on -Z and its
 * front on +Z, the way the studio lays every piece out. A back on -X is 270, +X 90, +Z 180, -Z 0.
 */
export type ModelYaw = 0 | 90 | 180 | 270

export const MODEL_YAWS: ModelYaw[] = [0, 90, 180, 270]

export interface YawGuess {
  yaw: ModelYaw
  /** False when the model has no clear back (a round pouf, a table): the yaw is then 0. */
  detected: boolean
}

const NOT_DETECTED: YawGuess = { yaw: 0, detected: false }

// Only these have a back tall enough to tell it from the front.
const BACKED_ROLES = new Set<FurnitureRole>(['bed', 'sofa', 'armchair', 'dining_chair', 'desk_chair'])

/** The top share of the model's height read as its back (a headboard, a sofa's back). */
const BACK_SHARE = 0.25
/** A back shifted less than this share of the size on both axes is no back at all: the model is symmetric. */
const MIN_OFFSET = 0.1
/** Vertices read per mesh: plenty for a mean, and a 500k-vertex scan stays quick. */
const MAX_SAMPLES = 5000

/**
 * The yaw of a model from its points: the mean of its top quarter, against the middle of its box,
 * is where its back stands. Mirrors `yawFromPoints` in backend/scripts/model_yaw_detect.mjs: keep the two in step.
 */
export function yawFromPoints(points: ReadonlyArray<readonly [number, number, number]>): YawGuess {
  if (points.length === 0) return NOT_DETECTED
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const p of points) {
    for (let i = 0; i < 3; i++) {
      if (p[i] < min[i]) min[i] = p[i]
      if (p[i] > max[i]) max[i] = p[i]
    }
  }
  const [sizeX, sizeY, sizeZ] = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
  if (!(sizeY > 0)) return NOT_DETECTED

  const top = max[1] - BACK_SHARE * sizeY
  let sumX = 0, sumZ = 0, n = 0
  for (const p of points) {
    if (p[1] < top) continue
    sumX += p[0]; sumZ += p[2]; n++
  }
  const dx = sizeX > 0 ? (sumX / n - (min[0] + max[0]) / 2) / sizeX : 0
  const dz = sizeZ > 0 ? (sumZ / n - (min[2] + max[2]) / 2) / sizeZ : 0
  if (Math.abs(dx) < MIN_OFFSET && Math.abs(dz) < MIN_OFFSET) return NOT_DETECTED

  if (Math.abs(dx) > Math.abs(dz)) return { yaw: dx > 0 ? 90 : 270, detected: true }
  return { yaw: dz < 0 ? 0 : 180, detected: true }
}

/**
 * The yaw of a loaded model, for the pieces with a tall back; any other gets 0. It reads the model in
 * its own frame (the parents that place or turn it on screen are left out), so a preview that already
 * shows it turned does not turn it twice.
 */
export function detectModelYaw(scene: THREE.Object3D, role: FurnitureRole | null): YawGuess {
  if (!role || !BACKED_ROLES.has(role)) return NOT_DETECTED
  scene.updateWorldMatrix(true, true)
  const toModel = scene.parent ? scene.parent.matrixWorld.clone().invert() : new THREE.Matrix4()
  const points: [number, number, number][] = []
  const m = new THREE.Matrix4()
  const v = new THREE.Vector3()
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const pos = (child.geometry as THREE.BufferGeometry | undefined)?.getAttribute('position')
    if (!pos) return
    m.multiplyMatrices(toModel, child.matrixWorld)
    const step = Math.max(1, Math.ceil(pos.count / MAX_SAMPLES))
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m)
      points.push([v.x, v.y, v.z])
    }
  })
  return yawFromPoints(points)
}

/** A width and depth after turning by the yaw: a quarter turn swaps them. */
export function turnedSize(size: { w: number; d: number }, yaw: ModelYaw): { w: number; d: number } {
  return yaw === 90 || yaw === 270 ? { w: size.d, d: size.w } : { w: size.w, d: size.d }
}

/** The yaw in the radians three.js turns by (`rotation.y`); a model without one is not turned. */
export function yawRadians(yaw: number | undefined): number {
  return yaw ? (yaw * Math.PI) / 180 : 0
}
