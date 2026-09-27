/**
 * Two properties carry the whole illusion: the camera must not move, and the
 * direction the controls just produced must survive the correction. If either
 * fails the gesture goes back to being an orbit — which is what the user was
 * complaining about.
 */
import { describe, it, expect } from 'vitest'
import { repinnedTarget, type Vec3 } from '../lookAround'

const dir = (from: Vec3, to: Vec3) => {
  const d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z }
  const l = Math.hypot(d.x, d.y, d.z)
  return { x: d.x / l, y: d.y / l, z: d.z / l }
}
const close = (a: Vec3, b: Vec3, tol = 1e-9) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < tol

describe('repinnedTarget', () => {
  // The camera stood 3 m out from a pivot at the origin...
  const anchor: Vec3 = { x: 0, y: 1.6, z: 3 }
  const target: Vec3 = { x: 0, y: 1.6, z: 0 }

  it('keeps the direction OrbitControls just produced', () => {
    // ...and the orbit has swung it a quarter turn.
    const moved: Vec3 = { x: 3, y: 1.6, z: 0 }
    const repinned = repinnedTarget(anchor, moved, target, 3)!
    expect(close(dir(anchor, repinned), dir(moved, target))).toBe(true)
  })

  it('keeps the distance the gesture started with, so a turn does not dolly', () => {
    const moved: Vec3 = { x: 2, y: 2.6, z: 1 }
    const repinned = repinnedTarget(anchor, moved, target, 3)!
    const d = Math.hypot(repinned.x - anchor.x, repinned.y - anchor.y, repinned.z - anchor.z)
    expect(d).toBeCloseTo(3, 9)
  })

  it('is a no-op when nothing has moved', () => {
    expect(close(repinnedTarget(anchor, anchor, target, 3)!, target)).toBe(true)
  })

  it('holds the old distance even when the controls changed it', () => {
    // A clamped orbit can land the camera nearer the pivot; the turn should
    // not inherit that as a zoom.
    const moved: Vec3 = { x: 0, y: 1.6, z: 1 }
    const repinned = repinnedTarget(anchor, moved, target, 3)!
    expect(repinned.z).toBeCloseTo(0, 9)
    expect(Math.hypot(repinned.x - anchor.x, repinned.y - anchor.y, repinned.z - anchor.z))
      .toBeCloseTo(3, 9)
  })

  it('gives up rather than inventing a direction when the two coincide', () => {
    expect(repinnedTarget(anchor, target, target, 3)).toBeNull()
  })

  it('leaves the camera where it was — that is the whole point', () => {
    // The caller restores `anchor`; this checks the pivot it gets back is
    // consistent with that, i.e. the offset from the anchor is what the
    // controls will recompute the same position from.
    const moved: Vec3 = { x: 1, y: 3, z: 2 }
    const repinned = repinnedTarget(anchor, moved, target, 3)!
    const offset = { x: anchor.x - repinned.x, y: anchor.y - repinned.y, z: anchor.z - repinned.z }
    expect(Math.hypot(offset.x, offset.y, offset.z)).toBeCloseTo(3, 9)
  })
})
