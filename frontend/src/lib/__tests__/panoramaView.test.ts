import { describe, it, expect } from 'vitest'
import {
  DEFAULT_VIEW, FOV_MAX, FOV_MIN, PITCH_LIMIT,
  MAX_VELOCITY, applyDrag, capVelocity, clampFov, clampPitch, decayVelocity, dragToAngles, pinchFov, wrapYaw, zoomFov,
} from '../panoramaView'

describe('wrapYaw', () => {
  it('keeps an angle inside one turn, however far it was wound', () => {
    expect(wrapYaw(0)).toBeCloseTo(0)
    expect(wrapYaw(Math.PI * 2 + 0.5)).toBeCloseTo(0.5)
    expect(wrapYaw(-Math.PI * 2 - 0.5)).toBeCloseTo(-0.5)
    expect(wrapYaw(Math.PI * 10 + 0.25)).toBeCloseTo(0.25)
  })
  it('puts the seam at PI, not -PI, so there is one name for "directly behind"', () => {
    expect(wrapYaw(Math.PI)).toBeCloseTo(Math.PI)
    expect(wrapYaw(-Math.PI)).toBeCloseTo(Math.PI)
  })
})

describe('limits', () => {
  it('stops pitch just short of straight up and down', () => {
    expect(clampPitch(10)).toBe(PITCH_LIMIT)
    expect(clampPitch(-10)).toBe(-PITCH_LIMIT)
    expect(clampPitch(0.3)).toBe(0.3)
  })
  it('keeps the field of view between its bounds', () => {
    expect(clampFov(5)).toBe(FOV_MIN)
    expect(clampFov(500)).toBe(FOV_MAX)
    expect(clampFov(60)).toBe(60)
  })
})

describe('dragToAngles', () => {
  it('turns the view by the field of view across the screen height', () => {
    // A drag the full height of an 800px screen at a 90 degree FOV is a quarter turn.
    expect(dragToAngles(0, 800, 90, 800).dpitch).toBeCloseTo(Math.PI / 2)
    expect(dragToAngles(800, 0, 90, 800).dyaw).toBeCloseTo(Math.PI / 2)
  })
  it('turns slower when zoomed in, so the picture still tracks the finger', () => {
    const wide = dragToAngles(100, 0, 90, 800).dyaw
    const tight = dragToAngles(100, 0, 45, 800).dyaw
    expect(tight).toBeCloseTo(wide / 2)
  })
  it('does nothing for a zero-height viewport rather than dividing by it', () => {
    expect(dragToAngles(10, 10, 75, 0)).toEqual({ dyaw: 0, dpitch: 0 })
  })
})

describe('applyDrag', () => {
  it('drags the picture with the finger: right turns the view left, down looks up', () => {
    const v = applyDrag(DEFAULT_VIEW, 50, 50, 800)
    expect(v.yaw).toBeGreaterThan(0)
    expect(v.pitch).toBeGreaterThan(0)
  })
  it('never lets a long drag tip the view over the poles or wind yaw up unboundedly', () => {
    const v = applyDrag(DEFAULT_VIEW, 100000, 100000, 800)
    expect(v.pitch).toBe(PITCH_LIMIT)
    expect(Math.abs(v.yaw)).toBeLessThanOrEqual(Math.PI)
  })
  it('leaves the field of view alone', () => {
    expect(applyDrag({ ...DEFAULT_VIEW, fov: 50 }, 10, 10, 800).fov).toBe(50)
  })
})

describe('zoom', () => {
  it('wheel: towards you zooms in, away widens, both within bounds', () => {
    expect(zoomFov(75, -100)).toBeLessThan(75)
    expect(zoomFov(75, 100)).toBeGreaterThan(75)
    expect(zoomFov(35, -100000)).toBe(FOV_MIN)
    expect(zoomFov(95, 100000)).toBe(FOV_MAX)
  })
  it('pinch: fingers apart shrinks the field of view in proportion', () => {
    expect(pinchFov(80, 100, 200)).toBeCloseTo(40)
    expect(pinchFov(60, 200, 100)).toBeCloseTo(100) // clamped from 120
    expect(pinchFov(60, 0, 100)).toBe(60)
  })
})

describe('decayVelocity', () => {
  it('slows a coasting view to a full stop', () => {
    let v = 0.02
    for (let i = 0; i < 200; i++) v = decayVelocity(v, 16)
    expect(v).toBe(0)
  })
  it('keeps the sign while it slows', () => {
    expect(decayVelocity(-0.02, 16)).toBeLessThan(0)
    expect(Math.abs(decayVelocity(-0.02, 16))).toBeLessThan(0.02)
  })
})

describe('capVelocity', () => {
  it('caps a one-event flick so it cannot become a spin, in either direction', () => {
    expect(capVelocity(5)).toBe(MAX_VELOCITY)
    expect(capVelocity(-5)).toBe(-MAX_VELOCITY)
  })
  it('leaves an ordinary drag speed alone', () => {
    expect(capVelocity(0.001)).toBe(0.001)
  })
})
