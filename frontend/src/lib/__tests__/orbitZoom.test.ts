/**
 * How far the camera may go, and how fast it gets there.
 *
 * The limit is the one the user felt: zooming out used to carry on long past
 * the point where the whole room was already in frame, so the last several
 * notches only shrank the room into an empty sky.
 */
import { describe, it, expect } from 'vitest'
import { fitRoomDistance, uniformZoomSpeed } from '../orbitZoom'

describe('uniformZoomSpeed', () => {
  it('moves a comparable distance per notch, close up and far out', () => {
    // The whole point of deriving the multiplier from a step in metres: one
    // wheel notch must not crawl a centimetre indoors and leap five metres
    // from outside.
    const near = uniformZoomSpeed(0.5, 6)
    const far = uniformZoomSpeed(20, 6)
    const travel = (d: number, z: number) => d * (1 - Math.pow(0.95, z))
    expect(travel(20, far) / travel(0.5, near)).toBeLessThan(40)
  })

  it('stays inside its own bounds at any distance', () => {
    for (const d of [0.01, 0.5, 3, 20, 500]) {
      const z = uniformZoomSpeed(d, 6)
      expect(z).toBeGreaterThanOrEqual(0.1)
      expect(z).toBeLessThanOrEqual(6)
    }
  })
})

describe('fitRoomDistance', () => {
  /** An ordinary room: 5.7 x 3.85 m, 2.8 m to the ceiling. */
  const ROOM = { W: 5.7, D: 3.85, H: 2.8 }
  /** The studio's own lens, and a phone held upright. */
  const FOV = 68
  const PORTRAIT = 9 / 16
  const LANDSCAPE = 16 / 9

  /** Half the room's space diagonal — the sphere it sits in. */
  const radius = 0.5 * Math.hypot(ROOM.W, ROOM.H, ROOM.D)

  it('puts the whole room inside the frame', () => {
    // The angle the room subtends from the limit must fit within the narrower
    // of the camera's two half-angles — that IS "fully visible".
    for (const aspect of [PORTRAIT, LANDSCAPE, 1]) {
      const d = fitRoomDistance(ROOM, FOV, aspect)
      const vHalf = (FOV * Math.PI) / 360
      const hHalf = Math.atan(Math.tan(vHalf) * aspect)
      const subtended = Math.asin(radius / d)
      expect(subtended).toBeLessThanOrEqual(Math.min(vHalf, hHalf))
    }
  })

  it('does not leave the room swimming in empty sky', () => {
    // The whole complaint: the old limit was max(W, D) * 4 + 6, nearly 29 m
    // for this room. The room has to still FILL most of the frame at full
    // zoom-out, so the angle it subtends must be most of the one available.
    const d = fitRoomDistance(ROOM, FOV, PORTRAIT)
    const hHalf = Math.atan(Math.tan((FOV * Math.PI) / 360) * PORTRAIT)
    expect(Math.asin(radius / d) / hHalf).toBeGreaterThan(0.9)
    expect(d).toBeLessThan(Math.max(ROOM.W, ROOM.D) * 4 + 6)
  })

  it('needs more room for a narrower window than a wider one', () => {
    // A phone held upright is much narrower across than it is tall, and a
    // distance that fits the room vertically still cuts its sides off.
    expect(fitRoomDistance(ROOM, FOV, PORTRAIT))
      .toBeGreaterThan(fitRoomDistance(ROOM, FOV, LANDSCAPE))
  })

  it('backs further off a bigger room', () => {
    const small = fitRoomDistance({ W: 3, D: 3, H: 2.5 }, FOV, PORTRAIT)
    const big = fitRoomDistance({ W: 9, D: 7, H: 3.2 }, FOV, PORTRAIT)
    expect(big).toBeGreaterThan(small)
  })

  it('answers to the lens as well as the room', () => {
    // A wider lens sees the same room from closer in.
    expect(fitRoomDistance(ROOM, 90, PORTRAIT)).toBeLessThan(fitRoomDistance(ROOM, 45, PORTRAIT))
  })

  it('survives a degenerate room rather than dividing by zero', () => {
    for (const room of [{ W: 0, D: 0, H: 0 }, { W: -2, D: 4, H: 2.5 }]) {
      const d = fitRoomDistance(room, FOV, PORTRAIT)
      expect(Number.isFinite(d)).toBe(true)
      expect(d).toBeGreaterThan(0)
    }
  })
})
