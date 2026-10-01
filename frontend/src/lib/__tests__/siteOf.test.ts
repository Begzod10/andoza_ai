import { describe, it, expect } from 'vitest'
import { siteOf, DEFAULT_SITE, sunPosition } from '../sunPosition'

describe('siteOf', () => {
  it('is Tashkent when the room has no location', () => {
    expect(siteOf(undefined)).toEqual(DEFAULT_SITE)
    expect(siteOf(null)).toEqual(DEFAULT_SITE)
  })

  it('keeps UTC+5 anywhere in Uzbekistan', () => {
    expect(siteOf({ latitude: 39.65, longitude: 66.96 }).utcOffset).toBe(5)
    expect(siteOf({ latitude: 42.46, longitude: 59.61 }).utcOffset).toBe(5)
  })

  it('falls back to 15° per hour outside it', () => {
    expect(siteOf({ latitude: 51.5, longitude: -0.1 }).utcOffset).toBe(0)
    expect(siteOf({ latitude: 21.4, longitude: 39.8 }).utcOffset).toBe(3)
  })

  it('moves solar noon with the site: Nukus (west) noons later on the clock than Tashkent', () => {
    const noonAzimuthGap = (loc: { latitude: number; longitude: number }) =>
      Math.abs(sunPosition({ hour: 12, ...siteOf(loc) }).azimuth - 180)
    const nukus = noonAzimuthGap({ latitude: 42.46, longitude: 59.61 })
    const tashkent = noonAzimuthGap({ latitude: 41.31, longitude: 69.24 })
    expect(nukus).toBeGreaterThan(tashkent)
  })
})
