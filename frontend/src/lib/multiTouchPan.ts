/**
 * Three-finger drag-to-pan for an OrbitControls scene — the gesture bookkeeping
 * and the camera maths, with no React and no DOM wiring, so both can be tested
 * directly. `MultiTouchPan.tsx` is the component that feeds it pointer events.
 *
 * OrbitControls handles one and two pointers and nothing else: its
 * `onTouchStart` switches on `pointers.length` and every case past 2 falls
 * through to `state = NONE`. So a third finger did not just do nothing — it
 * killed whatever gesture was already running. Nothing here has to fight the
 * controls for the gesture, precisely because they have already given up at
 * three pointers; their one- and two-finger handling (rotate, and
 * pinch-zoom-plus-pan) is left exactly as it was.
 */
import * as THREE from 'three'

/** The slice of OrbitControls this needs — small enough to stub in a test. */
export interface PannableControls {
  target: THREE.Vector3
  update: () => boolean | void
}

export interface MultiTouchPanOptions {
  /** Matches the `panSpeed` of the controls it rides on, so a three-finger
   *  drag travels exactly as far as the same two-finger drag would. */
  panSpeed?: number
  /** Fingers required. Two is left to OrbitControls' own DOLLY_PAN, which pans
   *  AND pinch-zooms — taking it over here would cost the pinch. */
  minPointers?: number
}

/**
 * Slide the camera and its orbit target together by a screen-space delta, using
 * the same maths as OrbitControls' own `pan()`: pixels are converted through
 * the distance to the target and the vertical field of view, then applied along
 * the camera's own right/up axes. Panning moves the pair — leaving the target
 * behind would turn the gesture into a slow orbit.
 *
 * `deltaX`/`deltaY` are in CSS pixels, in the direction the fingers moved; the
 * room follows them rather than running away from them.
 */
export function panCamera(
  camera: THREE.PerspectiveCamera,
  controls: PannableControls,
  deltaX: number,
  deltaY: number,
  viewportHeight: number,
) {
  if (!camera.isPerspectiveCamera || viewportHeight <= 0) return
  const offset = new THREE.Vector3().copy(camera.position).sub(controls.target)
  const targetDistance = offset.length() * Math.tan(((camera.fov / 2) * Math.PI) / 180)
  const k = (2 * targetDistance) / viewportHeight
  const v = new THREE.Vector3()
  // panLeft: the camera's +X axis, negated.
  v.setFromMatrixColumn(camera.matrix, 0).multiplyScalar(-deltaX * k)
  camera.position.add(v)
  controls.target.add(v)
  // panUp: the camera's +Y axis (screen-space panning, as the studio's
  // controls are configured).
  v.setFromMatrixColumn(camera.matrix, 1).multiplyScalar(deltaY * k)
  camera.position.add(v)
  controls.target.add(v)
  controls.update()
}

export interface MultiTouchPanHandlers {
  onDown: (e: { pointerId: number; pointerType: string; clientX: number; clientY: number }) => void
  onMove: (e: { pointerId: number; pointerType: string; clientX: number; clientY: number }) => void
  onUp: (e: { pointerId: number }) => void
  /** Fingers currently tracked — exposed for tests and debugging. */
  readonly pointerCount: number
}

/**
 * Gesture tracker: collects touch points, and once `minPointers` are down pans
 * by however far their centroid moves.
 *
 * The centroid (not a single finger) is what drives it, so the pan follows the
 * hand as a whole and a finger wobbling against the others does not steer it.
 */
export function createMultiTouchPan(
  deps: {
    getCamera: () => THREE.PerspectiveCamera | null
    getControls: () => PannableControls | null
    /** Height of the canvas in CSS pixels — the same denominator OrbitControls
     *  divides by, so both gestures scale identically. */
    getViewportHeight: () => number
    onPan?: () => void
  },
  { panSpeed = 1, minPointers = 3 }: MultiTouchPanOptions = {},
): MultiTouchPanHandlers {
  /** Live touch points, keyed by pointerId. A Map (not a count) because the
   *  centroid has to survive fingers landing and lifting mid-gesture. */
  const touches = new Map<number, { x: number; y: number }>()
  let last: { x: number; y: number } | null = null

  function centroid() {
    let x = 0
    let y = 0
    for (const p of touches.values()) { x += p.x; y += p.y }
    return { x: x / touches.size, y: y / touches.size }
  }

  /** A finger joining or leaving moves the centroid on its own; re-seed it so
   *  that jump is never mistaken for a drag and thrown at the camera. */
  function reseed() {
    last = touches.size >= minPointers ? centroid() : null
  }

  return {
    get pointerCount() { return touches.size },

    onDown(e) {
      if (e.pointerType !== 'touch') return
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      reseed()
    },

    onMove(e) {
      if (e.pointerType !== 'touch' || !touches.has(e.pointerId)) return
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (touches.size < minPointers) return
      const c = centroid()
      if (!last) { last = c; return }
      const camera = deps.getCamera()
      const controls = deps.getControls()
      if (camera && controls) {
        panCamera(camera, controls, (c.x - last.x) * panSpeed, (c.y - last.y) * panSpeed, deps.getViewportHeight())
        deps.onPan?.()
      }
      last = c
    },

    onUp(e) {
      if (!touches.delete(e.pointerId)) return
      reseed()
    },
  }
}
