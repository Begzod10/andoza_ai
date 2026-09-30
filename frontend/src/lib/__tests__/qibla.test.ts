import { describe, it, expect } from 'vitest'
import { qiblaBearing, bearingToScene, compassPoint } from '../qibla'

describe('qiblaBearing', () => {
  it('matches AlAdhan for Tashkent (240.297°)', () => {
    expect(qiblaBearing(41.2995, 69.2401)).toBeCloseTo(240.297, 1)
  })

  it('points south-east from Lisbon-side west and north-east from far south-west', () => {
    expect(qiblaBearing(51.5074, -0.1278)).toBeCloseTo(119, 0) // London
    expect(qiblaBearing(-33.8688, 151.2093)).toBeCloseTo(277, 0) // Sydney
  })

  it('defaults to the studio site (Tashkent)', () => {
    expect(qiblaBearing()).toBeCloseTo(240.3, 0)
  })

  it('always lands in [0, 360)', () => {
    for (const [lat, lon] of [[0, -179], [60, 100], [-60, 20]]) {
      const b = qiblaBearing(lat, lon)
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThan(360)
    }
  })
})

describe('bearingToScene', () => {
  it('puts north on −Z and east on +X when wall A faces north', () => {
    const [nx, nz] = bearingToScene(0)
    expect(nx).toBeCloseTo(0); expect(nz).toBeCloseTo(-1)
    const [ex, ez] = bearingToScene(90)
    expect(ex).toBeCloseTo(1); expect(ez).toBeCloseTo(0)
  })

  it('turns with the room: facing south, north lies on +Z', () => {
    const [x, z] = bearingToScene(0, 'south')
    expect(x).toBeCloseTo(0); expect(z).toBeCloseTo(1)
  })
})

describe('compassPoint', () => {
  it('names the Tashkent Qibla south-west-ish and wraps at north', () => {
    expect(compassPoint(240.3)).toBe("Janubi-g'arb")
    expect(compassPoint(359)).toBe('Shimol')
  })
})
