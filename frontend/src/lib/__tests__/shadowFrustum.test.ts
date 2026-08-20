/**
 * The shadow frustum, checked by the only question that matters: does every
 * corner of the room land inside it?
 *
 * A frustum that clips does not produce a missing shadow — it produces the
 * opposite, full sunlight on surfaces that stand under a ceiling, bounded by
 * the frustum's own straight edge. So each case here rebuilds the light's
 * basis independently and asserts containment, rather than pinning numbers.
 */
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { fitShadowFrustum } from '../shadowFrustum'
import { sunPosition } from '../sunPosition'

const W = 6
const H = 2.7
const D = 4

/** Every corner of the room, in the light's own view space. */
function cornersInLightSpace(position: [number, number, number], w = W, h = H, d = D) {
  const eye = new THREE.Vector3(...position)
  const fwd = eye.clone().negate().normalize()
  const up = Math.abs(fwd.y) > 0.999 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0)
  const right = new THREE.Vector3().crossVectors(fwd, up).normalize()
  const trueUp = new THREE.Vector3().crossVectors(right, fwd).normalize()

  const out: { x: number; y: number; z: number }[] = []
  for (const sx of [-1, 1]) {
    for (const sy of [0, 1]) {
      for (const sz of [-1, 1]) {
        const c = new THREE.Vector3((sx * w) / 2, sy * h, (sz * d) / 2).sub(eye)
        out.push({ x: c.dot(right), y: c.dot(trueUp), z: c.dot(fwd) })
      }
    }
  }
  return out
}

/** Where the sun stands for the studio's own rig, at a given hour. */
function sunLightPosition(hour: number): [number, number, number] {
  const dist = Math.max(W, D, H) * 1.6 + 4
  const { direction } = sunPosition({ hour })
  return [direction[0] * dist, direction[1] * dist, direction[2] * dist]
}

describe('fitShadowFrustum', () => {
  it('contains the whole room from straight overhead', () => {
    const pos: [number, number, number] = [0, 14, 0]
    const f = fitShadowFrustum(pos, W, H, D)
    for (const c of cornersInLightSpace(pos)) {
      expect(Math.abs(c.x)).toBeLessThanOrEqual(f.hw)
      expect(Math.abs(c.y)).toBeLessThanOrEqual(f.hh)
      expect(c.z).toBeGreaterThanOrEqual(f.near)
      expect(c.z).toBeLessThanOrEqual(f.far)
    }
  })

  it('contains the whole room at every hour of the day', () => {
    for (let hour = 0; hour < 24; hour += 0.25) {
      const pos = sunLightPosition(hour)
      const f = fitShadowFrustum(pos, W, H, D)
      for (const c of cornersInLightSpace(pos)) {
        expect(Math.abs(c.x), `hour ${hour} x`).toBeLessThanOrEqual(f.hw)
        expect(Math.abs(c.y), `hour ${hour} y`).toBeLessThanOrEqual(f.hh)
        expect(c.z, `hour ${hour} near`).toBeGreaterThanOrEqual(f.near)
        expect(c.z, `hour ${hour} far`).toBeLessThanOrEqual(f.far)
      }
    }
  })

  it('contains the room whatever its shape', () => {
    const rooms: [number, number, number][] = [
      [2, 2.4, 2],
      [12, 3.2, 3],
      [3, 4.5, 11],
    ]
    for (const [w, h, d] of rooms) {
      for (const hour of [7, 10, 13, 17]) {
        const dist = Math.max(w, d, h) * 1.6 + 4
        const { direction } = sunPosition({ hour })
        const pos: [number, number, number] = [
          direction[0] * dist, direction[1] * dist, direction[2] * dist,
        ]
        const f = fitShadowFrustum(pos, w, h, d)
        for (const c of cornersInLightSpace(pos, w, h, d)) {
          expect(Math.abs(c.x)).toBeLessThanOrEqual(f.hw)
          expect(Math.abs(c.y)).toBeLessThanOrEqual(f.hh)
          expect(c.z).toBeGreaterThanOrEqual(f.near)
          expect(c.z).toBeLessThanOrEqual(f.far)
        }
      }
    }
  })

  it('is what the old plan-sized box was not', () => {
    // The bug: bounds taken from the floor plan (±W/2+1.2 by ±D/2+1.2) read as
    // a snug fit and are in the wrong space entirely. With the sun low, the
    // room's silhouette from up there overflows them, and the overflow renders
    // as unshadowed sunlight. Morning, sun in the east and well down.
    const pos = sunLightPosition(8)
    const corners = cornersInLightSpace(pos)
    const oldHw = W / 2 + 1.2
    const oldHh = D / 2 + 1.2
    expect(corners.some((c) => Math.abs(c.x) > oldHw || Math.abs(c.y) > oldHh)).toBe(true)

    const f = fitShadowFrustum(pos, W, H, D)
    expect(corners.every((c) => Math.abs(c.x) <= f.hw && Math.abs(c.y) <= f.hh)).toBe(true)
  })

  it('keeps the near plane in front of the light', () => {
    // A low sun stands close to the room's own bounding sphere; a near plane
    // allowed to go negative clips nothing and burns depth precision.
    for (let hour = 5; hour < 20; hour += 0.5) {
      expect(fitShadowFrustum(sunLightPosition(hour), W, H, D).near).toBeGreaterThan(0)
    }
  })

  it('stays finite for a light hanging exactly overhead', () => {
    // The up vector is parallel to the view there; picking it naively yields a
    // zero-length cross product and NaN bounds.
    const f = fitShadowFrustum([0, 10, 0], W, H, D)
    for (const v of [f.hw, f.hh, f.near, f.far]) expect(Number.isFinite(v)).toBe(true)
    expect(f.hw).toBeGreaterThan(0)
    expect(f.hh).toBeGreaterThan(0)
  })

  it('does not waste texels — bounds stay close to the corners they contain', () => {
    // Containment alone is satisfiable by an enormous frustum, which would
    // trade a light leak for mush. The fit should be tight to the margin.
    const pos = sunLightPosition(10)
    const f = fitShadowFrustum(pos, W, H, D)
    const corners = cornersInLightSpace(pos)
    const maxX = Math.max(...corners.map((c) => Math.abs(c.x)))
    const maxY = Math.max(...corners.map((c) => Math.abs(c.y)))
    expect(f.hw - maxX).toBeCloseTo(0.6, 6)
    expect(f.hh - maxY).toBeCloseTo(0.6, 6)
  })
})
