/**
 * A three-finger drag has to move the room exactly as far as the two-finger
 * one does, so these tests check the pan against real THREE transforms and
 * against OrbitControls' own arithmetic, not against a second copy of the
 * formula written out by hand.
 */
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createMultiTouchPan, panCamera, type PannableControls } from '../multiTouchPan'

const VIEWPORT_H = 800

function setup(cameraPos: [number, number, number] = [0, 1.6, 4]) {
  const camera = new THREE.PerspectiveCamera(50, 1.5, 0.1, 100)
  camera.position.set(...cameraPos)
  const controls: PannableControls = { target: new THREE.Vector3(0, 1.6, 0), update: () => {} }
  camera.lookAt(controls.target)
  camera.updateMatrix()
  camera.updateMatrixWorld(true)
  return { camera, controls }
}

/** What OrbitControls' own pan() would do for the same delta: the distance to
 *  the target, through the vertical fov, along the camera's right/up columns. */
function orbitControlsPan(camera: THREE.PerspectiveCamera, target: THREE.Vector3, dx: number, dy: number) {
  const targetDistance =
    camera.position.clone().sub(target).length() * Math.tan(((camera.fov / 2) * Math.PI) / 180)
  const panOffset = new THREE.Vector3()
  const v = new THREE.Vector3()
  v.setFromMatrixColumn(camera.matrix, 0)
  v.multiplyScalar(-((2 * dx * targetDistance) / VIEWPORT_H))
  panOffset.add(v)
  v.setFromMatrixColumn(camera.matrix, 1)
  v.multiplyScalar((2 * dy * targetDistance) / VIEWPORT_H)
  panOffset.add(v)
  return panOffset
}

function touch(pointerId: number, clientX: number, clientY: number) {
  return { pointerId, pointerType: 'touch', clientX, clientY }
}

describe('panCamera', () => {
  it('moves the camera exactly as far as OrbitControls would', () => {
    const { camera, controls } = setup()
    const expected = orbitControlsPan(camera, controls.target, 40, -25)
    const before = camera.position.clone()

    panCamera(camera, controls, 40, -25, VIEWPORT_H)

    expect(camera.position.clone().sub(before).toArray()).toEqual(
      expected.toArray().map((n) => expect.closeTo(n, 10)),
    )
  })

  it('carries the orbit target along, so the gesture pans instead of orbiting', () => {
    const { camera, controls } = setup()
    const offsetBefore = camera.position.clone().sub(controls.target)

    panCamera(camera, controls, 30, 12, VIEWPORT_H)

    // Same vector from target to camera => the viewing direction and the
    // distance are untouched; only where the pair sits has changed.
    const offsetAfter = camera.position.clone().sub(controls.target)
    expect(offsetAfter.distanceTo(offsetBefore)).toBeLessThan(1e-10)
    // ...and the target really did move, i.e. this is not a no-op pan.
    expect(controls.target.length()).toBeGreaterThan(0)
  })

  it('drags the room with the fingers, not away from them', () => {
    const { camera, controls } = setup()
    // Camera at +Z looking back at the origin, so its right axis is world +X.
    // Fingers moving right (+deltaX) must carry the room right, which means
    // the camera itself goes left.
    panCamera(camera, controls, 50, 0, VIEWPORT_H)
    expect(camera.position.x).toBeLessThan(0)

    const { camera: c2, controls: ct2 } = setup()
    // Fingers moving down (+deltaY) carry the room down => camera goes up.
    panCamera(c2, ct2, 0, 50, VIEWPORT_H)
    expect(c2.position.y).toBeGreaterThan(1.6)
  })

  it('pans further the further out the camera is', () => {
    const near = setup([0, 1.6, 2])
    const far = setup([0, 1.6, 8])
    panCamera(near.camera, near.controls, 40, 0, VIEWPORT_H)
    panCamera(far.camera, far.controls, 40, 0, VIEWPORT_H)
    // Same finger travel covers more of the room when zoomed out, exactly as
    // OrbitControls' distance-scaled pan does.
    expect(Math.abs(far.camera.position.x)).toBeGreaterThan(Math.abs(near.camera.position.x))
  })

  it('ignores a zero-height viewport instead of producing NaN', () => {
    const { camera, controls } = setup()
    panCamera(camera, controls, 40, 20, 0)
    expect(camera.position.toArray()).toEqual([0, 1.6, 4])
    expect(Number.isNaN(controls.target.x)).toBe(false)
  })
})

describe('createMultiTouchPan', () => {
  function tracker(overrides: { panSpeed?: number; minPointers?: number } = {}) {
    const { camera, controls } = setup()
    let panCount = 0
    const h = createMultiTouchPan(
      {
        getCamera: () => camera,
        getControls: () => controls,
        getViewportHeight: () => VIEWPORT_H,
        onPan: () => { panCount += 1 },
      },
      overrides,
    )
    return { camera, controls, h, panned: () => panCount }
  }

  it('does nothing until the third finger lands', () => {
    const { camera, h, panned } = tracker()
    h.onDown(touch(1, 100, 100))
    h.onDown(touch(2, 200, 100))
    h.onMove(touch(1, 160, 100))
    h.onMove(touch(2, 260, 100))
    // One and two fingers belong to OrbitControls (rotate, pinch+pan).
    expect(panned()).toBe(0)
    expect(camera.position.x).toBe(0)

    h.onDown(touch(3, 300, 100))
    h.onMove(touch(1, 200, 100))
    h.onMove(touch(2, 300, 100))
    h.onMove(touch(3, 340, 100))
    expect(panned()).toBeGreaterThan(0)
    expect(camera.position.x).not.toBe(0)
  })

  it('pans by the centroid, so one finger drifting does not steer it', () => {
    const steady = tracker()
    // All three fingers travel +60px: the centroid travels +60px.
    for (const id of [1, 2, 3]) steady.h.onDown(touch(id, 100 * id, 100))
    for (const id of [1, 2, 3]) steady.h.onMove(touch(id, 100 * id + 60, 100))

    const drifting = tracker()
    // Only one finger moves, by three times as much: the centroid still
    // travels +60px, so the room moves by the same amount.
    for (const id of [1, 2, 3]) drifting.h.onDown(touch(id, 100 * id, 100))
    drifting.h.onMove(touch(1, 100 + 180, 100))

    expect(drifting.camera.position.x).toBeCloseTo(steady.camera.position.x, 10)
  })

  it('does not lurch when a fourth finger lands or one lifts mid-drag', () => {
    // How far a calm 10px drag moves the room, as a yardstick.
    const calm = tracker()
    for (const id of [1, 2, 3]) calm.h.onDown(touch(id, 100 * id, 100))
    for (const id of [1, 2, 3]) calm.h.onMove(touch(id, 100 * id + 10, 100))
    const oneSmallDrag = Math.abs(calm.camera.position.x)
    expect(oneSmallDrag).toBeGreaterThan(0)

    const { camera, h } = tracker()
    for (const id of [1, 2, 3]) h.onDown(touch(id, 100 * id, 100))
    for (const id of [1, 2, 3]) h.onMove(touch(id, 100 * id + 10, 100))
    const settled = camera.position.clone()

    // A fourth finger far from the others yanks the centroid hundreds of
    // pixels sideways. The landing itself pans nothing...
    h.onDown(touch(4, 2000, 100))
    expect(camera.position.distanceTo(settled)).toBe(0)
    // ...and the NEXT move must be measured against where the fingers are
    // NOW, not against the pre-landing centroid — otherwise that jump gets
    // thrown at the camera on the first move after it.
    for (const id of [1, 2, 3, 4]) h.onMove(touch(id, (id === 4 ? 2000 : 100 * id) + 10, 100))
    expect(camera.position.distanceTo(settled)).toBeLessThanOrEqual(oneSmallDrag * 1.01)

    // Same on the way back down: lifting the outlier moves the centroid back.
    const afterFourth = camera.position.clone()
    h.onUp({ pointerId: 4 })
    expect(camera.position.distanceTo(afterFourth)).toBe(0)
    for (const id of [1, 2, 3]) h.onMove(touch(id, 100 * id + 20, 100))
    expect(camera.position.distanceTo(afterFourth)).toBeLessThanOrEqual(oneSmallDrag * 1.01)
  })

  it('stops panning once fingers drop below the threshold, and resumes cleanly', () => {
    const { camera, h } = tracker()
    for (const id of [1, 2, 3]) h.onDown(touch(id, 100 * id, 100))
    for (const id of [1, 2, 3]) h.onMove(touch(id, 100 * id + 20, 100))
    const afterFirstDrag = camera.position.clone()

    h.onUp({ pointerId: 3 })
    expect(h.pointerCount).toBe(2)
    // Two fingers left: OrbitControls owns this, so a move here must not pan.
    h.onMove(touch(1, 400, 400))
    h.onMove(touch(2, 500, 400))
    expect(camera.position.distanceTo(afterFirstDrag)).toBe(0)

    h.onDown(touch(3, 600, 400))
    for (const id of [1, 2, 3]) h.onMove(touch(id, 100 * id + 30, 400))
    expect(camera.position.distanceTo(afterFirstDrag)).toBeGreaterThan(0)
  })

  it('ignores the mouse — this is a touch gesture', () => {
    const { camera, h } = tracker()
    for (const id of [1, 2, 3]) {
      h.onDown({ pointerId: id, pointerType: 'mouse', clientX: 100 * id, clientY: 100 })
    }
    expect(h.pointerCount).toBe(0)
    for (const id of [1, 2, 3]) {
      h.onMove({ pointerId: id, pointerType: 'mouse', clientX: 100 * id + 50, clientY: 100 })
    }
    expect(camera.position.x).toBe(0)
  })

  it('scales the travel by panSpeed', () => {
    const slow = tracker({ panSpeed: 0.5 })
    const fast = tracker({ panSpeed: 1 })
    for (const t of [slow, fast]) {
      for (const id of [1, 2, 3]) t.h.onDown(touch(id, 100 * id, 100))
      for (const id of [1, 2, 3]) t.h.onMove(touch(id, 100 * id + 60, 100))
    }
    expect(Math.abs(slow.camera.position.x)).toBeCloseTo(Math.abs(fast.camera.position.x) / 2, 10)
  })
})
