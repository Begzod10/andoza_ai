/**
 * Where the sun stands over the room, and what it looks like from there.
 *
 * A fixed key light is fine for a product shot and wrong for a design tool:
 * whether a room is pleasant at 8am is a question about *this* room facing
 * *that* way, and a light nailed to one corner cannot answer it. So the sun
 * here is a real one — it rises in the east, crosses at an angle set by the
 * latitude and the season, sets in the west, and reddens as it goes.
 *
 * Two frames meet in this file and they must not be confused:
 *
 *  - **Compass bearings** run clockwise from true north: N 0°, E 90°, S 180°,
 *    W 270°. Declination, hour angle and azimuth are all computed here.
 *  - **The scene frame** is the one every view already shares (see
 *    `roomDims.ts`): X runs along wall A, Z along wall B, Y is up. The rest of
 *    the app treats −Z as "north" — `AddRoomButtons` puts its north button at
 *    −Z — so an unrotated room has wall A's outward face pointing north.
 *
 * `facing` is what joins them: the compass bearing that wall A's outward face
 * actually points at. Leave it at 0 and the two frames coincide; set it to
 * 'south' and the room turns under a sun that does not, which is the whole
 * point of having it.
 *
 * The astronomy is NOAA's low-precision solar position algorithm — good to
 * well under a degree, which is a small fraction of the sun's own half-degree
 * disc and far below what a shadow in a 4-metre room can show.
 */

export type Cardinal = 'north' | 'east' | 'south' | 'west'

/** Compass bearings in degrees, clockwise from true north. */
export const CARDINAL_BEARING: Record<Cardinal, number> = {
  north: 0,
  east: 90,
  south: 180,
  west: 270,
}

export interface SunInput {
  /** Local clock time in hours, 0–24. 13.5 is 13:30. */
  hour: number
  /**
   * Day of the year, 1–366 — this is the seasonal tilt of the arc, and it is
   * not a detail: at Tashkent's latitude the noon sun swings 47° between
   * solstices, the difference between light reaching the back wall and not.
   * Defaults to the March equinox, the neutral middle of that swing.
   */
  dayOfYear?: number
  /** Site latitude in degrees, positive north. */
  latitude?: number
  /** Site longitude in degrees, positive east. */
  longitude?: number
  /** The site's offset from UTC in hours — with longitude, this is what puts
   *  solar noon at the right point on the local clock. */
  utcOffset?: number
  /** Compass bearing wall A's outward face points at. See the note above. */
  facing?: number | Cardinal
  /** How far off the room to stand the light, in metres. Only the direction
   *  matters to a directional light; the distance decides where its shadow
   *  frustum sits, so it wants to clear the room. */
  distance?: number
  /** Intensity to hand a `directionalLight` with the sun straight overhead. */
  peakIntensity?: number
}

export interface SunState {
  /** Degrees above the horizon. Negative once the sun has set. */
  altitude: number
  /** Compass bearing of the sun, degrees clockwise from true north. */
  azimuth: number
  /** Unit vector from the room toward the sun, in the scene's X/Y/Z frame.
   *  Y is negative at night — gate on `isUp` before lighting anything. */
  direction: [number, number, number]
  /** `direction` scaled by `distance` — what a `directionalLight` wants. */
  position: [number, number, number]
  /** Whether the sun is above the horizon. */
  isUp: boolean
  /** Directional-light intensity, dimmed by the air the beam crosses. 0 at
   *  night. */
  intensity: number
  /** Sun colour as `#rrggbb`, reddening as it drops. Below the horizon it
   *  holds at the sunset hue rather than running on to black. */
  color: string
}

/** Tashkent — the app's home, and the default site. */
export const DEFAULT_SITE = { latitude: 41.31, longitude: 69.24, utcOffset: 5 }

/** 21 March. The equinox arc, halfway between the solstices. */
const DEFAULT_DAY_OF_YEAR = 80

const DEG = Math.PI / 180

/**
 * The studio's daylight white, as linear-ish RGB. The reddening below tints
 * this rather than pure white, so a high sun still matches the warm key light
 * the rest of the app was built around.
 */
const SUN_WHITE: [number, number, number] = [1, 0.953, 0.871] // #FFF3DE

/**
 * Rayleigh optical depth per channel. Blue scatters out of the beam first,
 * which is the entire reason a low sun is orange.
 */
const RAYLEIGH: [number, number, number] = [0.06, 0.12, 0.22]

/**
 * Air masses past which the colour stops reddening.
 *
 * The beam really does go blood-red and then black in the last degree, but by
 * then this light is standing in for a whole bright horizon, not a disc — and
 * a directional light that turns pure #FF0000 at dusk looks like a bug, not
 * like evening. Intensity keeps the unclamped air mass, so the sun still fades
 * out properly; only the hue stops moving.
 */
const MAX_TINT_AIR_MASS = 10

/** Air mass straight up, the value everything else is normalised against. */
const ZENITH_TRANSMITTANCE = 0.7

function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function bearingOf(facing: number | Cardinal | undefined): number {
  if (facing === undefined) return 0
  return typeof facing === 'number' ? facing : CARDINAL_BEARING[facing]
}

function hex2(v: number): string {
  return Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')
}

/** Day of the year, 1–366, in local time. */
export function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1)
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.round((startOfDay.getTime() - start.getTime()) / 86_400_000) + 1
}

/** Local clock time as fractional hours, e.g. 13:30 → 13.5. */
export function hourOfDay(date: Date): number {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600
}

/**
 * Kasten–Young relative air mass: how much atmosphere the beam crosses,
 * measured in zenith-paths. 1 straight up, ~38 at the horizon. This is what
 * makes the difference between a low sun and a high one a matter of colour
 * and not only of angle.
 */
function relativeAirMass(altitudeDeg: number): number {
  const alt = Math.max(altitudeDeg, 0)
  return 1 / (Math.sin(alt * DEG) + 0.50572 * Math.pow(alt + 6.07995, -1.6364))
}

/**
 * Where the sun is, and what colour it arrives.
 *
 * Everything but `hour` has a default, so the smallest useful call is
 * `sunPosition({ hour: 9 })` — 9am over Tashkent at the equinox, on a room
 * whose wall A faces north.
 */
export function sunPosition(input: SunInput): SunState {
  const {
    hour,
    dayOfYear: day = DEFAULT_DAY_OF_YEAR,
    latitude = DEFAULT_SITE.latitude,
    longitude = DEFAULT_SITE.longitude,
    utcOffset = DEFAULT_SITE.utcOffset,
    distance = 12,
    peakIntensity = 1.3,
  } = input

  // NOAA's fractional year, advanced by the time of day so the declination and
  // the equation of time both track within the day rather than stepping at
  // midnight.
  const gamma = ((2 * Math.PI) / 365) * (day - 1 + (hour - 12) / 24)
  const [c1, s1] = [Math.cos(gamma), Math.sin(gamma)]
  const [c2, s2] = [Math.cos(2 * gamma), Math.sin(2 * gamma)]
  const [c3, s3] = [Math.cos(3 * gamma), Math.sin(3 * gamma)]

  // Minutes by which true solar time runs ahead of mean solar time — the orbit
  // is elliptical and the axis is tilted, so the sun keeps its own clock.
  const eqTimeMin =
    229.18 *
    (0.000075 + 0.001868 * c1 - 0.032077 * s1 - 0.014615 * c2 - 0.040849 * s2)

  // Solar declination in radians: how far north or south of the equator the
  // sun stands today. ±23.44° at the solstices.
  const decl =
    0.006918 -
    0.399912 * c1 +
    0.070257 * s1 -
    0.006758 * c2 +
    0.000907 * s2 -
    0.002697 * c3 +
    0.00148 * s3

  // Local clock → true solar time. Longitude and the UTC offset are what make
  // 12:00 in Tashkent land at 12:43 solar, an 11° swing of the shadow that a
  // naive "noon is overhead" model puts in the wrong place.
  const trueSolarMin = hour * 60 + eqTimeMin + 4 * longitude - 60 * utcOffset
  // Degrees past solar noon, positive in the afternoon.
  const hourAngle = (trueSolarMin / 4 - 180) * DEG

  const lat = latitude * DEG
  const sinAlt = clamp(
    Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle),
    -1,
    1,
  )
  const altitude = Math.asin(sinAlt)
  const altitudeDeg = altitude / DEG

  // atan2 rather than the acos form: it needs no quadrant fix-up, and it stays
  // right in the tropics, where the noon sun is genuinely due *north*.
  const azFromSouth = Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat),
  )
  const azimuth = norm360(azFromSouth / DEG + 180)

  // Compass → scene. The room's −Z looks along `facing`, and +X is a quarter
  // turn clockwise from it, so a bearing is just an angle relative to `facing`.
  const rel = (azimuth - bearingOf(input.facing)) * DEG
  const cosAlt = Math.cos(altitude)
  const direction: [number, number, number] = [
    cosAlt * Math.sin(rel),
    sinAlt,
    -cosAlt * Math.cos(rel),
  ]

  const isUp = altitudeDeg > 0

  // Beam strength, not surface illumination: three.js applies the N·L falloff
  // itself, so dimming by altitude here as well would darken the low sun twice.
  const airMass = relativeAirMass(altitudeDeg)
  const transmittance = Math.pow(0.7, Math.pow(airMass, 0.678))
  const intensity = isUp ? peakIntensity * (transmittance / ZENITH_TRANSMITTANCE) : 0

  const tintMass = Math.min(airMass, MAX_TINT_AIR_MASS)
  const tint = RAYLEIGH.map((beta) => Math.exp(-beta * (tintMass - 1)))
  const peak = Math.max(...tint) || 1
  const color = `#${SUN_WHITE.map((base, i) => hex2((base * tint[i]) / peak)).join('')}`

  return {
    altitude: altitudeDeg,
    azimuth,
    direction,
    position: [direction[0] * distance, direction[1] * distance, direction[2] * distance],
    isUp,
    intensity,
    color,
  }
}

/**
 * How much daylight there is, 0 at night through 1 under a high sun.
 *
 * Not the same question as `intensity`, and using one for the other is the
 * mistake this exists to prevent: intensity is the strength of the *beam*,
 * which is gone the instant the sun clears the horizon, while the sky stays
 * bright well into twilight. Drive a window view or an ambient fill from the
 * beam and the world outside snaps to black at sunset.
 *
 * The ramp runs from −12° (nautical twilight, genuinely dark) to +8°, smoothed
 * so nothing switches.
 */
export function daylight(altitudeDeg: number): number {
  const t = clamp((altitudeDeg + 12) / 20, 0, 1)
  return t * t * (3 - 2 * t)
}

/** `sunPosition` for a moment on the wall clock — the live-clock case. */
export function sunPositionAt(date: Date, input: Omit<SunInput, 'hour' | 'dayOfYear'> = {}): SunState {
  return sunPosition({ ...input, hour: hourOfDay(date), dayOfYear: dayOfYear(date) })
}
