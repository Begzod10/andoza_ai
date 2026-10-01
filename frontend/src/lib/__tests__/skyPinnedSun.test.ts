/**
 * The sun pinned to the sky photograph: what it changes, what it must not, and
 * whether the shadow rig survives an altitude of 13.8 degrees.
 *
 * The last of those is the one that would actually break a render. A shadow
 * frustum that clips does not produce a missing shadow, it produces the
 * opposite — full sunlight lying across walls that stand under a closed
 * ceiling, bounded by the frustum's own straight edge (see
 * `shadowFrustum.test.ts`). The clock's sun only reached this low around dawn
 * and dusk; pinned, the studio sits there permanently, so the containment
 * question stops being an edge case and becomes the normal operating point.
 */
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  PIN_SUN_TO_SKY, SHOW_SUN_CLOCK, SKY_SUN_DIRECTION, SKY_SUN_ALTITUDE_DEG, skyPinnedSun,
} from '../skyPinnedSun'
import { MOONRISE_LIGHT_SOURCE } from '../skyLightSource'
import { fitShadowFrustum } from '../shadowFrustum'
import { sunBeamAt, sunPosition } from '../sunPosition'

/** What SceneEnvironment's SUN_INTENSITY was when this was written — the
 *  strength the beam would have with the sun overhead. */
const PEAK = 1.5

/**
 * Where `SceneLighting` stands the light, copied from it rather than imported:
 * that file is a .tsx full of React Three Fiber elements and this is the one
 * line of it that matters here.
 */
function lightPosition(
  direction: readonly [number, number, number],
  w: number,
  h: number,
  d: number,
): [number, number, number] {
  const dist = Math.max(w, d, h) * 1.6 + 4
  return [direction[0] * dist, direction[1] * dist, direction[2] * dist]
}

/** Every corner of the room, in the light's own view space. */
function cornersInLightSpace(
  position: [number, number, number],
  w: number,
  h: number,
  d: number,
) {
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

/** Rooms from a cupboard to a hall, plus the tallest ceiling the app offers. */
const ROOMS: [number, number, number][] = [
  [2, 2.4, 2],
  [3, 2.7, 4],
  [4, 2.8, 5],
  [6, 2.7, 4],
  [3, 3.6, 3],
  [8, 4, 10],
]

describe('skyPinnedSun', () => {
  it('aims the sun at the sky\'s measured light source', () => {
    const sun = skyPinnedSun(sunPosition({ hour: 11 }), PEAK)
    for (let i = 0; i < 3; i++) {
      expect(sun.direction[i]).toBeCloseTo(MOONRISE_LIGHT_SOURCE.direction[i], 12)
    }
  })

  it('aims it the same way at every hour, which is the whole point', () => {
    const seen = new Set<string>()
    for (let hour = 0; hour < 24; hour += 0.25) {
      seen.add(skyPinnedSun(sunPosition({ hour }), PEAK).direction.join(','))
    }
    expect(seen.size).toBe(1)
  })

  it('aims it the same way however the room is turned', () => {
    // A photograph has no compass: drei leaves the environment's rotation at
    // identity, so turning the room cannot turn the moon. `facing` still turns
    // the clock's sun, and that is exactly the disagreement being removed.
    for (const facing of [0, 45, 90, 180, 270] as const) {
      const sun = skyPinnedSun(sunPosition({ hour: 9, facing }), PEAK)
      expect(sun.direction[0]).toBeCloseTo(SKY_SUN_DIRECTION[0], 12)
      expect(sun.direction[2]).toBeCloseTo(SKY_SUN_DIRECTION[2], 12)
    }
  })

  it('keeps the position consistent with the new direction, same distance out', () => {
    const clock = sunPosition({ hour: 14, distance: 12 })
    const pinned = skyPinnedSun(clock, PEAK)
    expect(Math.hypot(...pinned.position)).toBeCloseTo(Math.hypot(...clock.position), 9)
    for (let i = 0; i < 3; i++) {
      expect(pinned.position[i]).toBeCloseTo(pinned.direction[i] * 12, 9)
    }
  })

  it('stands the sun at the moon\'s own altitude, not the clock\'s', () => {
    for (const hour of [0, 6, 9, 12, 18, 23.5]) {
      expect(skyPinnedSun(sunPosition({ hour }), PEAK).altitude)
        .toBeCloseTo(SKY_SUN_ALTITUDE_DEG, 12)
    }
  })

  it('is up at every hour, because the moon in the picture is', () => {
    // The first version of this file left `isUp` to the clock, and it could not
    // survive its own first night: a directional light that is not up
    // contributes nothing, `sunHour` starts at the wall-clock hour, and the
    // slider that could have been wound round to daylight is now hidden. The
    // studio opened at three in the morning would have had no sun at all and no
    // way to ask for one.
    for (let hour = 0; hour < 24; hour += 0.25) {
      expect(skyPinnedSun(sunPosition({ hour }), PEAK).isUp).toBe(true)
    }
  })

  it('gives the same beam at every hour, dimmed by the air at that altitude', () => {
    const want = sunBeamAt(SKY_SUN_ALTITUDE_DEG, PEAK)
    for (const hour of [0, 6, 9, 12, 18, 23.5]) {
      const pinned = skyPinnedSun(sunPosition({ hour }), PEAK)
      expect(pinned.intensity).toBeCloseTo(want.intensity, 12)
      expect(pinned.color).toBe(want.color)
    }
  })

  it('is a real fraction of the peak, not the peak and not nothing', () => {
    // 13.8 degrees is a low sun: the air takes a large bite, and a beam that
    // came through at full strength would mean the air-mass maths had been
    // bypassed, while one at zero would mean the night gate was still in play.
    const { intensity } = skyPinnedSun(sunPosition({ hour: 3 }), PEAK)
    expect(intensity).toBeGreaterThan(PEAK * 0.3)
    expect(intensity).toBeLessThan(PEAK * 0.8)
  })

  it('still answers to SUN_INTENSITY, which is what that knob is for', () => {
    const a = skyPinnedSun(sunPosition({ hour: 12 }), 1).intensity
    const b = skyPinnedSun(sunPosition({ hour: 12 }), 3).intensity
    expect(b).toBeCloseTo(a * 3, 12)
  })

  it('is a single switch away from the old behaviour', () => {
    // Nothing in the clock was deleted, so flipping PIN_SUN_TO_SKY off has to
    // restore the slider along with the moving sun. If these two ever drift
    // apart the sun would be frozen with no control left to move it.
    expect(SHOW_SUN_CLOCK).toBe(!PIN_SUN_TO_SKY)
  })
})

describe('the shadow frustum at the pinned altitude', () => {
  it('still contains every room it is offered', () => {
    for (const [w, h, d] of ROOMS) {
      const pos = lightPosition(SKY_SUN_DIRECTION, w, h, d)
      const f = fitShadowFrustum(pos, w, h, d)
      for (const c of cornersInLightSpace(pos, w, h, d)) {
        expect(Math.abs(c.x)).toBeLessThanOrEqual(f.hw)
        expect(Math.abs(c.y)).toBeLessThanOrEqual(f.hh)
        expect(c.z).toBeGreaterThanOrEqual(f.near)
        expect(c.z).toBeLessThanOrEqual(f.far)
      }
    }
  })

  it('never has to clamp its near plane, so nothing is clipped off the front', () => {
    // `fitShadowFrustum` floors `near` at 0.1, and a floored near plane means
    // the fit was asked for something it could not give — the light standing
    // inside the room's own bounding box. `SceneLighting`'s distance of
    // 1.6 * max + 4 keeps it well clear at any altitude, and this is the check
    // that the low pinned sun did not change that.
    for (const [w, h, d] of ROOMS) {
      const pos = lightPosition(SKY_SUN_DIRECTION, w, h, d)
      const f = fitShadowFrustum(pos, w, h, d)
      const nearest = Math.min(...cornersInLightSpace(pos, w, h, d).map((c) => c.z))
      expect(nearest).toBeGreaterThan(0.7) // 0.1 floor + the 0.6 margin
      expect(f.near).toBeCloseTo(nearest - 0.6, 9)
    }
  })

  it('costs no more shadow map resolution than the clock\'s own low sun did', () => {
    // A low sun stretches the room's silhouette, which spends shadow texels.
    // Dawn and dusk already put the clock's sun at this altitude, so the pinned
    // frustum must not be larger than the widest one the studio already drew.
    const [w, h, d] = [4, 2.8, 5]
    const pinned = fitShadowFrustum(lightPosition(SKY_SUN_DIRECTION, w, h, d), w, h, d)
    let worst = 0
    for (let hour = 0; hour < 24; hour += 0.25) {
      const { direction } = sunPosition({ hour })
      const f = fitShadowFrustum(lightPosition(direction, w, h, d), w, h, d)
      worst = Math.max(worst, f.hw * f.hh)
    }
    expect(pinned.hw * pinned.hh).toBeLessThanOrEqual(worst)
  })
})
