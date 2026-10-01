/**
 * What the user will actually see of the moonrise sky, and what the room will
 * actually get from it.
 *
 * These are not placeholder assertions. The sky was wired up in an environment
 * with no GPU and no WebGL, so none of it could be looked at; every judgement
 * about it was made by decoding the EXR offline and running three's own ACES
 * tone mapping over the result. That reasoning is reproduced here so it stops
 * being a one-off measurement in a commit message and becomes something that
 * breaks loudly if the numbers are nudged.
 *
 * Two of these tests are regression guards for complaints already on record:
 * glossy tiles "reflecting the big light from outside", and nothing being
 * visible against a flat white environment.
 */
import { describe, it, expect } from 'vitest'
import {
  ENV_RADIANCE_BUDGET,
  MOONRISE_BACKGROUND_INTENSITY,
  MOONRISE_ENVIRONMENT_INTENSITY,
  MOONRISE_FOG_COLOR,
  MOONRISE_SKY,
  REMOVED_SKY_NIGHT_RADIANCE,
  REMOVED_SKY_NOON_RADIANCE,
  acesFilmicToneMap,
  linearToSrgbHex,
  moonriseEnvironmentIntensity,
  moonriseFogColor,
  srgbHexToLinear,
  type LinearRgb,
} from '../moonriseSky'

/** Scale a linear colour, as a background/environment intensity does. */
const scale = (rgb: LinearRgb, k: number): LinearRgb => [rgb[0] * k, rgb[1] * k, rgb[2] * k]

/** The 0-255 sRGB triple a linear colour ends up as on screen. */
const onScreen = (rgb: LinearRgb): [number, number, number] =>
  linearToSrgbHex(acesFilmicToneMap(rgb))
    .slice(1)
    .match(/../g)!
    .map((h) => parseInt(h, 16)) as [number, number, number]

describe('acesFilmicToneMap', () => {
  it('leaves black alone and saturates rather than overshooting', () => {
    expect(acesFilmicToneMap([0, 0, 0])).toEqual([0, 0, 0])
    for (const channel of acesFilmicToneMap([MOONRISE_SKY.peakRadiance, 0, 0])) {
      expect(channel).toBeGreaterThanOrEqual(0)
      expect(channel).toBeLessThanOrEqual(1)
    }
  })

  it('never falls as the input rises, so an intensity table can be read as a ramp', () => {
    // The whole justification for picking 0.22 over 0.40 or 0.10 is a monotone
    // ladder of tone-mapped readings. If the curve folded back anywhere, that
    // argument would not hold.
    let prev = -1
    for (let v = 0; v < 8; v += 0.05) {
      const lit = acesFilmicToneMap([v, v, v])[1]
      expect(lit).toBeGreaterThanOrEqual(prev - 1e-12)
      prev = lit
    }
  })

  it('compresses hard enough that a white backdrop is not actually white', () => {
    // 230, not 255 — which is why the moonrise horizon at 172 is three quarters
    // of the brightness the old #FFFFFF backdrop had, not two thirds.
    expect(onScreen(srgbHexToLinear('#ffffff'))).toEqual([230, 230, 230])
  })
})

describe('sRGB round trip', () => {
  it('survives a trip through a hex, which is how the fog colour reaches three', () => {
    for (const v of [0, 0.002, 0.05, 0.29, 0.5, 1]) {
      const [r] = srgbHexToLinear(linearToSrgbHex([v, v, v]))
      expect(r).toBeCloseTo(v, 2)
    }
  })

  it('clamps, because a hex cannot carry radiance above 1', () => {
    expect(linearToSrgbHex([2, 2, 2])).toBe('#ffffff')
  })
})

describe('environment intensity', () => {
  it('spends exactly the budget it was given, whatever the sky is stored at', () => {
    expect(MOONRISE_ENVIRONMENT_INTENSITY * MOONRISE_SKY.meanRadiance).toBeCloseTo(
      ENV_RADIANCE_BUDGET,
      10,
    )
  })

  it('halves when a replacement file is stored twice as hot', () => {
    // The point of deriving this rather than writing a number down: swapping
    // the EXR must not quietly change how hard the sky lights the room.
    const hotter = { ...MOONRISE_SKY, meanRadiance: MOONRISE_SKY.meanRadiance * 2 }
    expect(moonriseEnvironmentIntensity(hotter)).toBeCloseTo(MOONRISE_ENVIRONMENT_INTENSITY / 2, 10)
  })

  it('never lights the room harder than the sky that drew the complaint', () => {
    // The reported bug: glossy tiles "reflecting the big light from outside".
    // three.js has no notion of being indoors, so this is the only lever —
    // ShadowShell stops the directional sun at the walls and can do nothing
    // about an environment map. Ten times under the setting that caused it.
    const delivered = MOONRISE_ENVIRONMENT_INTENSITY * MOONRISE_SKY.meanRadiance
    expect(delivered).toBeLessThan(REMOVED_SKY_NOON_RADIANCE / 8)
    expect(delivered).toBeLessThanOrEqual(REMOVED_SKY_NIGHT_RADIANCE)
  })

  it('stays a rounding error next to the ambient fill, so it cannot flatten the room', () => {
    // The other complaint on record: a flat white environment map, and
    // "nothing is visible in white background". A uniform environment adds a
    // constant term to every surface and takes the contrast away.
    //
    // Both terms land on a diffuse surface in the same units, once three's
    // shader maths is unwound: an ambient light contributes PI * colour as
    // irradiance and the Lambert BRDF divides it straight back out, so
    // `ambientLight intensity={1.0}` arrives as 1.0; the environment's
    // irradiance is likewise PI * mean radiance * envMapIntensity, arriving as
    // the product below. 0.1 is plaster's envMapIntensity in surfaceFinish —
    // walls and ceiling, the surfaces a flat lift would wash out.
    const ambientFill = 1.0
    const plasterEnvMapIntensity = 0.1
    const fromSky =
      MOONRISE_ENVIRONMENT_INTENSITY * MOONRISE_SKY.meanRadiance * plasterEnvMapIntensity
    expect(fromSky).toBeLessThan(ambientFill * 0.01)
  })

  it('still leaves the moon visible in a glossy reflection', () => {
    // And the reason the environment is kept at all. Diffuse is negligible
    // above; specular samples the map's peak, not its mean, so even at this
    // intensity the moon and the horizon glow land on tile as a real highlight
    // rather than as nothing. 0.14 is tile's envMapIntensity in surfaceFinish.
    const tileEnvMapIntensity = 0.14
    const peak = MOONRISE_SKY.peakRadiance * MOONRISE_ENVIRONMENT_INTENSITY * tileEnvMapIntensity
    expect(peak).toBeGreaterThan(1)
  })
})

describe('background intensity', () => {
  it('draws a night sky: deep navy overhead, a moon glow at the horizon', () => {
    const zenith = onScreen(scale(MOONRISE_SKY.zenithRadiance, MOONRISE_BACKGROUND_INTENSITY))
    const horizon = onScreen(scale(MOONRISE_SKY.horizonRadiance, MOONRISE_BACKGROUND_INTENSITY))

    // Dark enough to read as night...
    expect(Math.max(...zenith)).toBeLessThan(80)
    // ...but not a black void, and still recognisably blue rather than grey.
    expect(Math.max(...zenith)).toBeGreaterThan(20)
    expect(zenith[2]).toBeGreaterThan(zenith[0] * 1.5)

    // The moon's glow has to survive, or the backdrop is just a dark wall.
    expect(Math.min(...horizon)).toBeGreaterThan(140)
    // Without clipping into a white band — #FFFFFF itself only reaches 230.
    expect(Math.max(...horizon)).toBeLessThan(200)
  })

  it('is well under 1, because the file is stored hot', () => {
    // The surprise this constant exists for: left at 1 the "night" sky
    // tone-maps to a bright overcast afternoon, and its zenith alone comes out
    // brighter than the deep navy a moonrise should be by a factor of four.
    expect(MOONRISE_BACKGROUND_INTENSITY).toBeLessThan(0.5)
    const atOne = onScreen(MOONRISE_SKY.zenithRadiance)
    expect(Math.max(...atOne)).toBeGreaterThan(150)
  })

  it('is several times the environment intensity — they answer different questions', () => {
    // Tying them together gives you either a washed-out sky or the moon
    // reflected off the floor tiles. Keep them apart.
    expect(MOONRISE_BACKGROUND_INTENSITY).toBeGreaterThan(MOONRISE_ENVIRONMENT_INTENSITY * 3)
  })
})

describe('moonriseFogColor', () => {
  it('is a well-formed hex', () => {
    expect(MOONRISE_FOG_COLOR).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('is indistinguishable from the sky it hangs in front of', () => {
    // Fog is mixed in linear space and tone-mapped with everything else, so
    // matching the horizon's linear radiance makes the two agree exactly on
    // screen. This is the test that would have caught shipping the old white
    // fog under a night sky — a bright grey veil across a dark room.
    expect(onScreen(srgbHexToLinear(MOONRISE_FOG_COLOR))).toEqual(
      onScreen(scale(MOONRISE_SKY.horizonRadiance, MOONRISE_BACKGROUND_INTENSITY)),
    )
  })

  it('follows the background intensity instead of waiting to be edited', () => {
    const dim = moonriseFogColor(MOONRISE_SKY, MOONRISE_BACKGROUND_INTENSITY / 3)
    const bright = moonriseFogColor(MOONRISE_SKY, MOONRISE_BACKGROUND_INTENSITY)
    expect(srgbHexToLinear(dim)[1]).toBeLessThan(srgbHexToLinear(bright)[1])
  })

  it('clamps to white at full intensity, where the horizon exceeds 1', () => {
    // Not a case we ship, but it is why the encoder clamps rather than wrapping:
    // the horizon band's raw radiance is above 1.3 in every channel.
    expect(Math.min(...MOONRISE_SKY.horizonRadiance)).toBeGreaterThan(1)
    expect(moonriseFogColor(MOONRISE_SKY, 1)).toBe('#ffffff')
  })
})
