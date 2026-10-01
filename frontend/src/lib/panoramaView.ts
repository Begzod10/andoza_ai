/**
 * How a 360 viewer turns input into a view: a drag into angles, a wheel or a
 * pinch into a field of view.
 *
 * Pure arithmetic, kept out of the component so it can be tested without a GPU.
 * Angles are radians; the field of view is degrees, as three.js wants it.
 *
 * Conventions (matching the camera, `Euler(pitch, yaw, 0, 'YXZ')`): a positive
 * yaw turns the view LEFT and a positive pitch looks UP. Dragging moves the
 * picture with the finger, so a drag to the right turns the view left (yaw up)
 * and a drag down looks up (pitch up).
 */

export const FOV_MIN = 30
export const FOV_MAX = 100
export const FOV_DEFAULT = 75

/** Straight up or down flips the horizon over; stop just short of it. */
export const PITCH_LIMIT = Math.PI / 2 - 0.01

export interface PanoView {
  yaw: number
  pitch: number
  fov: number
}

export const DEFAULT_VIEW: PanoView = { yaw: 0, pitch: 0, fov: FOV_DEFAULT }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Yaw is a full turn around: keep it in (-PI, PI] so it never grows without bound. */
export function wrapYaw(yaw: number): number {
  const twoPi = Math.PI * 2
  const wrapped = ((((yaw + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI
  return wrapped === -Math.PI ? Math.PI : wrapped
}

export const clampPitch = (pitch: number) => clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT)
export const clampFov = (fov: number) => clamp(fov, FOV_MIN, FOV_MAX)

/**
 * A drag of (dx, dy) pixels as a change of yaw and pitch.
 *
 * Proportional to the field of view, so the picture tracks the finger at any
 * zoom: the screen's height always spans `fov` degrees, so a pixel is
 * fov / height degrees. A fixed speed would race when zoomed in.
 */
export function dragToAngles(
  dx: number,
  dy: number,
  fovDeg: number,
  viewportHeightPx: number,
): { dyaw: number; dpitch: number } {
  if (viewportHeightPx <= 0) return { dyaw: 0, dpitch: 0 }
  const radPerPx = (fovDeg * Math.PI) / 180 / viewportHeightPx
  return { dyaw: dx * radPerPx, dpitch: dy * radPerPx }
}

/** Move a view by a drag, keeping it legal. */
export function applyDrag(view: PanoView, dx: number, dy: number, viewportHeightPx: number): PanoView {
  const { dyaw, dpitch } = dragToAngles(dx, dy, view.fov, viewportHeightPx)
  return { ...view, yaw: wrapYaw(view.yaw + dyaw), pitch: clampPitch(view.pitch + dpitch) }
}

/** Wheel: scrolling away from you (positive deltaY) widens the view, towards you zooms in. */
export function zoomFov(fov: number, wheelDeltaY: number): number {
  return clampFov(fov * Math.exp(wheelDeltaY * 0.0012))
}

/** Pinch: fingers apart (distance up) zoom in, so the field of view shrinks in proportion. */
export function pinchFov(startFov: number, startDistance: number, distance: number): number {
  if (startDistance <= 0 || distance <= 0) return clampFov(startFov)
  return clampFov(startFov * (startDistance / distance))
}

/** Letting go of a fast drag keeps the view coasting, slowing to a stop. */
export function decayVelocity(v: number, dtMs: number): number {
  const decayed = v * Math.exp(-dtMs / 260)
  return Math.abs(decayed) < 0.00005 ? 0 : decayed
}

/** Keyboard: how far one arrow press turns the view. */
export const KEY_STEP = (6 * Math.PI) / 180

/** The fastest the view may coast, radians per ms (about 200 degrees a second):
 *  a flick that was one jump between two events must not become a spin. */
export const MAX_VELOCITY = 0.0035

export const capVelocity = (v: number) => Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, v))
