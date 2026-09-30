import { describe, it, expect } from 'vitest'
import { qiblaBearing, bearingToScene, compassPoint, CITY_PRESETS, isValidCoordinate, FACING_OPTIONS } from '../qibla'

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

describe('room orientation', () => {
  it('offers eight facings starting at north', () => {
    expect(FACING_OPTIONS).toHaveLength(8)
    expect(FACING_OPTIONS[0]).toEqual({ bearing: 0, label: 'Shimol' })
  })

  it('swings the Qibla arrow with the room: facing east puts a south-west Qibla toward the back-left', () => {
    // Qibla 240° with wall A facing 90° is 150° relative: down and to the right in the plan.
    const [x, z] = bearingToScene(240, 90)
    expect(x).toBeCloseTo(Math.sin(150 * Math.PI / 180))
    expect(z).toBeCloseTo(-Math.cos(150 * Math.PI / 180))
  })
})

describe('compassPoint', () => {
  it('names the Tashkent Qibla south-west-ish and wraps at north', () => {
    expect(compassPoint(240.3)).toBe("Janubi-g'arb")
    expect(compassPoint(359)).toBe('Shimol')
  })
})

describe('room locations', () => {
  it('gives every preset city a valid coordinate and a distinct name', () => {
    for (const c of CITY_PRESETS) expect(isValidCoordinate(c.latitude, c.longitude)).toBe(true)
    expect(new Set(CITY_PRESETS.map((c) => c.label)).size).toBe(CITY_PRESETS.length)
  })

  it('leads with Tashkent, the default site', () => {
    expect(CITY_PRESETS[0].label).toBe('Toshkent')
  })

  it('moves the bearing with the city (Nukus is further west than Tashkent)', () => {
    const nukus = CITY_PRESETS.find((c) => c.label === 'Nukus')!
    expect(qiblaBearing(nukus.latitude, nukus.longitude)).not.toBeCloseTo(qiblaBearing(), 0)
  })

  it('rejects out-of-range and non-numeric coordinates', () => {
    expect(isValidCoordinate(999, 0)).toBe(false)
    expect(isValidCoordinate(0, 181)).toBe(false)
    expect(isValidCoordinate(NaN, 0)).toBe(false)
  })
})
