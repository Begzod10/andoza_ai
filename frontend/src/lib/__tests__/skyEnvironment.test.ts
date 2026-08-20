/**
 * The sky's pure parts — the ones that decide whether the world outside the
 * window agrees with the light inside it.
 *
 * The drawing itself needs a real 2D canvas and is left to the browser; what is
 * checked here is the day/night curve everything else is keyed to, and the
 * colours derived from it.
 */
import { describe, it, expect } from 'vitest'
import { daylight, sunPosition } from '../sunPosition'
import { skyIntensity, skyFogColor } from '../skyEnvironment'

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const luma = (hex: string) => {
  const [r, g, b] = rgb(hex)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

describe('daylight', () => {
  it('is out at night and full under a high sun', () => {
    expect(daylight(-40)).toBe(0)
    expect(daylight(-12)).toBe(0)
    expect(daylight(60)).toBe(1)
  })

  it('still has light in the sky at sunset, when the beam is already gone', () => {
    // The mistake this curve exists to prevent: driving the window view from
    // the sun's own intensity, which hits zero the instant it sets and snaps
    // the world outside to black.
    expect(sunPosition({ hour: 19 }).intensity).toBe(0)
    expect(daylight(sunPosition({ hour: 19 }).altitude)).toBeGreaterThan(0.1)
  })

  it('rises without a step anywhere', () => {
    let prev = daylight(-30)
    for (let a = -30; a <= 90; a += 0.5) {
      const v = daylight(a)
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9)
      expect(v - prev).toBeLessThan(0.1) // smooth, not a switch
      prev = v
    }
  })
})

describe('skyIntensity', () => {
  it('keeps a floor at night so a room stays navigable', () => {
    expect(skyIntensity(sunPosition({ hour: 0 }))).toBeGreaterThan(0)
  })

  it('is brightest at midday and dimmest at midnight', () => {
    const noon = skyIntensity(sunPosition({ hour: 13 }))
    const midnight = skyIntensity(sunPosition({ hour: 0 }))
    expect(noon).toBeGreaterThan(midnight * 3)
  })
})

describe('skyFogColor', () => {
  it('is dark at midnight and bright at midday', () => {
    expect(luma(skyFogColor(sunPosition({ hour: 0 })))).toBeLessThan(40)
    expect(luma(skyFogColor(sunPosition({ hour: 14 })))).toBeGreaterThan(180)
  })

  it('warms as the sun sets — red overtakes blue', () => {
    const [dr, , db] = rgb(skyFogColor(sunPosition({ hour: 18.4 })))
    expect(dr).toBeGreaterThan(db)
  })

  it('is a well-formed hex colour at every hour', () => {
    for (let h = 0; h < 24; h += 0.5) {
      expect(skyFogColor(sunPosition({ hour: h }))).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})
