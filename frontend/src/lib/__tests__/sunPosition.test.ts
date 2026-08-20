/**
 * The sun, checked against things that are true regardless of the algorithm.
 *
 * The interesting failures here are sign and frame errors — a sun that sets in
 * the east, a room that turns the wrong way under it, an azimuth that flips
 * quadrant at noon — so the assertions are about direction and geometry rather
 * than about matching an ephemeris to the arc-second.
 */
import { describe, it, expect } from 'vitest'
import { sunPosition, sunPositionAt, dayOfYear, hourOfDay, DEFAULT_SITE } from '../sunPosition'

const EQUINOX = 80 // 21 March
const SUMMER = 172 // 21 June
const WINTER = 355 // 21 December

/** Tashkent's latitude — the site every default assumes. */
const LAT = DEFAULT_SITE.latitude

/**
 * When the sun actually peaks, found by scanning rather than hardcoded: the
 * equation of time drags solar noon around by half an hour across the year, so
 * a fixed constant would only be right on one date.
 */
function solarNoon(day: number): number {
  let best = 12
  for (let h = 6; h < 18; h += 1 / 120) {
    if (sunPosition({ hour: h, dayOfYear: day }).altitude >
        sunPosition({ hour: best, dayOfYear: day }).altitude) best = h
  }
  return best
}

const SOLAR_NOON = solarNoon(EQUINOX)

describe('sunPosition — the daily arc', () => {
  it('rises in the east and sets in the west', () => {
    expect(sunPosition({ hour: 7 }).azimuth).toBeCloseTo(95, -1)
    expect(sunPosition({ hour: 18 }).azimuth).toBeCloseTo(265, -1)
  })

  it('climbs to its highest point at solar noon', () => {
    const noon = sunPosition({ hour: SOLAR_NOON }).altitude
    expect(sunPosition({ hour: SOLAR_NOON - 3 }).altitude).toBeLessThan(noon)
    expect(sunPosition({ hour: SOLAR_NOON + 3 }).altitude).toBeLessThan(noon)
  })

  it('is below the horizon at night', () => {
    expect(sunPosition({ hour: 2 }).isUp).toBe(false)
    expect(sunPosition({ hour: 2 }).intensity).toBe(0)
    expect(sunPosition({ hour: 23 }).direction[1]).toBeLessThan(0)
  })

  it('puts solar noon after 12:00 for a site east of its timezone meridian', () => {
    // Tashkent sits at 69.24°E while UTC+5 is centred on 75°E, so the sun gets
    // there late. Reading the wall clock as solar time would swing the shadow
    // by the better part of half an hour's rotation.
    expect(SOLAR_NOON).toBeGreaterThan(12)
    expect(SOLAR_NOON).toBeLessThan(13)
    expect(sunPosition({ hour: 12 }).azimuth).toBeLessThan(180) // still east of south
    expect(sunPosition({ hour: SOLAR_NOON }).azimuth).toBeCloseTo(180, 0)
  })
})

describe('sunPosition — the seasonal arc', () => {
  // At the equinox the noon sun stands at (90 − latitude); the solstices move
  // it by the axial tilt, 23.44°, either way.
  const noonAltitude = (day: number) =>
    sunPosition({ hour: solarNoon(day), dayOfYear: day }).altitude

  it('reaches 90 − latitude at the equinox', () => {
    expect(noonAltitude(EQUINOX)).toBeCloseTo(90 - LAT, 0)
  })

  it('stands a tilt higher in summer and a tilt lower in winter', () => {
    expect(noonAltitude(SUMMER)).toBeCloseTo(90 - LAT + 23.44, 0)
    expect(noonAltitude(WINTER)).toBeCloseTo(90 - LAT - 23.44, 0)
  })

  it('gives a longer day in summer than in winter', () => {
    const upHours = (day: number) =>
      Array.from({ length: 48 }, (_, i) => sunPosition({ hour: i / 2, dayOfYear: day }))
        .filter((s) => s.isUp).length / 2
    expect(upHours(SUMMER)).toBeGreaterThan(upHours(WINTER) + 4)
  })

  it('swings north of the room at noon inside the tropics', () => {
    // The acos form of the azimuth formula gets this backwards; atan2 does not.
    const s = sunPosition({ hour: 12, dayOfYear: SUMMER, latitude: 10, longitude: 0, utcOffset: 0 })
    expect(s.azimuth).toBeCloseTo(0, -1)
    expect(s.direction[2]).toBeLessThan(0) // −Z is north
  })
})

describe('sunPosition — the scene frame', () => {
  it('returns a unit direction, and a position that is it scaled', () => {
    const s = sunPosition({ hour: 10, distance: 20 })
    const len = Math.hypot(...s.direction)
    expect(len).toBeCloseTo(1, 6)
    expect(s.position).toEqual(s.direction.map((v) => v * 20))
  })

  it('maps a bearing onto −Z north / +X east with facing at 0', () => {
    // Sunrise, near due east: the sun should be almost entirely along +X.
    const s = sunPosition({ hour: 6.4, dayOfYear: EQUINOX })
    expect(s.direction[0]).toBeGreaterThan(0.9)
    expect(Math.abs(s.direction[2])).toBeLessThan(0.2)
  })

  it('turns the room, not the sun, when facing changes', () => {
    const north = sunPosition({ hour: 9 })
    const south = sunPosition({ hour: 9, facing: 'south' })
    // Same sky, room spun 180° — the horizontal components invert, height does not.
    expect(south.azimuth).toBeCloseTo(north.azimuth, 6)
    expect(south.direction[0]).toBeCloseTo(-north.direction[0], 6)
    expect(south.direction[2]).toBeCloseTo(-north.direction[2], 6)
    expect(south.direction[1]).toBeCloseTo(north.direction[1], 6)
  })

  it('accepts a bearing in degrees as well as a cardinal name', () => {
    expect(sunPosition({ hour: 9, facing: 90 }).direction)
      .toEqual(sunPosition({ hour: 9, facing: 'east' }).direction)
  })

  it('reads the same sun from any facing, only re-framed', () => {
    for (const facing of [0, 45, 90, 180, 270] as const) {
      const s = sunPosition({ hour: 14, facing })
      expect(s.altitude).toBeCloseTo(sunPosition({ hour: 14 }).altitude, 6)
      expect(Math.hypot(...s.direction)).toBeCloseTo(1, 6)
    }
  })
})

describe('sunPosition — how it looks', () => {
  it('dims and warms as the sun drops', () => {
    const noon = sunPosition({ hour: SOLAR_NOON })
    const dusk = sunPosition({ hour: 18 })
    expect(dusk.intensity).toBeLessThan(noon.intensity)

    const blue = (hex: string) => parseInt(hex.slice(5, 7), 16)
    expect(blue(dusk.color)).toBeLessThan(blue(noon.color))
  })

  it('holds a believable sunset hue below the horizon instead of going red-black', () => {
    // Unclamped, the air mass runs away at the horizon and the colour collapses
    // to pure #FF0000 — which reads as a bug in any view that samples it.
    const night = sunPosition({ hour: 1 })
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(night.color.slice(i, i + 2), 16))
    expect(r).toBeGreaterThan(g)
    expect(g).toBeGreaterThan(b)
    expect(g).toBeGreaterThan(64)
  })

  it('never exceeds the peak intensity it was given', () => {
    for (let h = 0; h < 24; h += 0.25) {
      expect(sunPosition({ hour: h, dayOfYear: SUMMER, peakIntensity: 1.3 }).intensity)
        .toBeLessThanOrEqual(1.3)
    }
  })

  it('emits a well-formed hex colour all day', () => {
    for (let h = 0; h < 24; h += 0.5) {
      expect(sunPosition({ hour: h }).color).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})

describe('date helpers', () => {
  it('counts the day of the year from 1', () => {
    expect(dayOfYear(new Date(2026, 0, 1))).toBe(1)
    expect(dayOfYear(new Date(2026, 2, 21))).toBe(80)
    expect(dayOfYear(new Date(2026, 11, 31))).toBe(365)
  })

  it('survives a DST boundary in the local zone', () => {
    // Built from local parts, so any shift lands inside the day, not across it.
    expect(dayOfYear(new Date(2026, 2, 29, 3, 30))).toBe(88)
  })

  it('reads the clock as fractional hours', () => {
    expect(hourOfDay(new Date(2026, 5, 1, 13, 30))).toBeCloseTo(13.5, 6)
  })

  it('sunPositionAt matches the equivalent explicit call', () => {
    const d = new Date(2026, 2, 21, 9, 0)
    expect(sunPositionAt(d)).toEqual(sunPosition({ hour: 9, dayOfYear: 80 }))
  })
})
