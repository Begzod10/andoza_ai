/**
 * Where the moon in the studio's sky stands, and that the mapping that puts it
 * there is not mirrored or a quarter turn out.
 *
 * This is the half of the work that cannot be looked at. There is no WebGL in
 * CI and no GPU in the environment the sky was wired up in, so "the shadows now
 * agree with the glow in the photograph" is an arithmetic claim, and the only
 * way to stop it rotting is to assert the arithmetic. Two things are pinned
 * here and they fail for different reasons:
 *
 *  - The equirectangular convention, texel by texel against three's own
 *    `equirectUv`. Mirror the u axis or flip the v axis and every number
 *    downstream stays plausible while the sun moves to the wrong wall — or
 *    under the floor. The cardinal cases below are what a mirror breaks.
 *
 *  - The measurement itself, against the actual pixels. `MOON_PATCH` is the
 *    13x9 block of `qwantani_moonrise_puresky_1k.exr` around its brightest
 *    texel, decoded with the same three-stdlib EXRLoader the browser uses and
 *    rounded to whole luminances. Running `findSkyLightSource` over a map
 *    carrying nothing but that block reproduces the whole-file measurement
 *    exactly at every threshold, which is the point: the moon IS those few
 *    texels, and `MOONRISE_LIGHT_SOURCE` is derivable from the file rather than
 *    being a number somebody wrote down once.
 */
import { describe, it, expect } from 'vitest'
import {
  BRIGHT_THRESHOLD,
  MOONRISE_LIGHT_SOURCE,
  equirectDirection,
  equirectUv,
  findSkyLightSource,
  luminance,
  texelDirection,
  type EquirectRadianceMap,
} from '../skyLightSource'

/** The shipped file's own dimensions — 1024x512 equirectangular. */
const W = 1024
const H = 512

/**
 * Luminance of the 13x9 texels of the sky file centred one row below its
 * brightest texel, rounded to integers. Top-left corner is data texel
 * (608, 291), and data row 0 is the nadir, so rows run upward here.
 *
 * The moon's core is the 91,250 in the middle; two decades of halo fall away
 * from it to the 10-40 of the surrounding sky, which is itself already ten to
 * forty times the file's whole-sphere mean of 1.083.
 */
const PATCH_X = 608
const PATCH_Y = 291
const MOON_PATCH = [
  [12, 14, 16, 18, 20, 22, 22, 21, 19, 16, 14, 12, 10],
  [15, 17, 20, 25, 30, 35, 37, 34, 28, 22, 18, 14, 12],
  [17, 21, 26, 33, 45, 62, 76, 64, 44, 31, 23, 18, 15],
  [20, 25, 32, 44, 65, 5115, 40808, 7824, 71, 42, 28, 21, 16],
  [21, 27, 36, 50, 81, 19752, 91250, 33180, 82, 46, 31, 22, 17],
  [22, 27, 35, 47, 66, 116, 1829, 139, 63, 41, 29, 22, 17],
  [21, 26, 32, 39, 49, 61, 67, 60, 46, 34, 25, 20, 17],
  [19, 23, 27, 32, 38, 42, 43, 40, 34, 27, 22, 18, 15],
  [17, 20, 23, 27, 29, 31, 31, 29, 26, 22, 18, 15, 13],
]

/** A grey equirect map — grey because `luminance`'s weights sum to exactly 1,
 *  so an (L, L, L) texel has luminance L and the fixtures read as themselves. */
function greyMap(width: number, height: number, fill = 0): EquirectRadianceMap {
  const data = new Float32Array(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill
    data[i + 1] = fill
    data[i + 2] = fill
    data[i + 3] = 1
  }
  return { width, height, data }
}

function setTexel(map: EquirectRadianceMap, x: number, y: number, lum: number) {
  const data = map.data as Float32Array
  const i = (y * map.width + x) * 4
  data[i] = lum
  data[i + 1] = lum
  data[i + 2] = lum
}

/** The sky file, reduced to the moon's own neighbourhood over a dim sky. */
function moonMap(): EquirectRadianceMap {
  // 1.083 is the file's measured whole-sphere mean (see MOONRISE_SKY) — a
  // realistic floor, and three orders of magnitude below the lowest threshold
  // tested, so it can never join the bright region.
  const map = greyMap(W, H, 1.083)
  for (let dy = 0; dy < MOON_PATCH.length; dy++) {
    for (let dx = 0; dx < MOON_PATCH[dy].length; dx++) {
      setTexel(map, PATCH_X + dx, PATCH_Y + dy, MOON_PATCH[dy][dx])
    }
  }
  return map
}

describe('luminance', () => {
  it('has weights that sum to one, so a grey texel reads as itself', () => {
    expect(luminance(1, 1, 1)).toBeCloseTo(1, 12)
    expect(luminance(500, 500, 500)).toBeCloseTo(500, 9)
  })
})

describe("three's equirectangular convention", () => {
  // These six are the whole anti-mirror argument. u = 0 is -X, u grows toward
  // +Z, and v grows toward +Y. Flip any of those and one of these fails.
  it('puts u = 0 on -X and u = 0.5 on +X', () => {
    expect(equirectUv([-1, 0, 0])[0]).toBeCloseTo(1, 12) // the seam, == 0
    expect(equirectUv([1, 0, 0])[0]).toBeCloseTo(0.5, 12)
  })

  it('turns from +X toward +Z as u grows, not toward -Z', () => {
    expect(equirectUv([0, 0, 1])[0]).toBeCloseTo(0.75, 12)
    expect(equirectUv([0, 0, -1])[0]).toBeCloseTo(0.25, 12)
  })

  it('puts the nadir at v = 0 and the zenith at v = 1', () => {
    expect(equirectUv([0, -1, 0])[1]).toBeCloseTo(0, 12)
    expect(equirectUv([0, 1, 0])[1]).toBeCloseTo(1, 12)
    expect(equirectUv([1, 0, 0])[1]).toBeCloseTo(0.5, 12)
  })

  it('round-trips every direction through uv and back', () => {
    for (const dir of [
      [1, 0, 0],
      [0, 0, 1],
      [-0.6, 0.5, 0.62],
      [0.785, 0.238, 0.572],
      [0.1, -0.9, -0.42],
    ] as const) {
      const len = Math.hypot(...dir)
      const unit = dir.map((v) => v / len) as unknown as [number, number, number]
      const [u, v] = equirectUv(unit)
      const back = equirectDirection(u, v)
      for (let i = 0; i < 3; i++) expect(back[i]).toBeCloseTo(unit[i], 10)
    }
  })

  it('samples texel centres, not texel corners', () => {
    // Half a texel matters at 1024 wide: it is 0.18 degrees of azimuth, twice
    // the spread the whole threshold sweep below produces.
    const [u, v] = equirectUv(texelDirection({ width: W, height: H }, 614, 295))
    expect(u * W).toBeCloseTo(614.5, 9)
    expect(v * H).toBeCloseTo(295.5, 9)
  })
})

describe('findSkyLightSource', () => {
  it('reproduces the shipped measurement from the file\'s own texels', () => {
    const found = findSkyLightSource(moonMap())
    expect(found.peakRadiance).toBe(91250)
    expect(found.peakTexel).toEqual([614, 295])
    expect(found.texelCount).toBe(7)
    expect(found.altitudeDeg).toBeCloseTo(MOONRISE_LIGHT_SOURCE.altitudeDeg, 4)
    expect(found.seamAzimuthDeg).toBeCloseTo(MOONRISE_LIGHT_SOURCE.seamAzimuthDeg, 4)
    for (let i = 0; i < 3; i++) {
      expect(found.direction[i]).toBeCloseTo(MOONRISE_LIGHT_SOURCE.direction[i], 6)
    }
  })

  it('is barely sensitive to the threshold, across three decades of it', () => {
    // From one texel (90% of the peak) to nine (0.1% of it). If this spread
    // ever opened up, the "radiance-weighted centroid" argument would be doing
    // no work and the choice of threshold would need defending instead.
    const map = moonMap()
    const sweep = [0.9, 0.5, 0.25, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001].map((f) =>
      findSkyLightSource(map, f),
    )
    const alts = sweep.map((s) => s.altitudeDeg)
    const azis = sweep.map((s) => s.seamAzimuthDeg)
    expect(Math.max(...alts) - Math.min(...alts)).toBeLessThan(0.1)
    expect(Math.max(...azis) - Math.min(...azis)).toBeLessThan(0.1)
    // And the plateau the shipped threshold sits on is genuinely flat.
    for (const f of [0.02, 0.01, 0.005, 0.002]) {
      expect(findSkyLightSource(map, f).altitudeDeg).toBeCloseTo(
        MOONRISE_LIGHT_SOURCE.altitudeDeg,
        6,
      )
    }
  })

  it('does not simply return the hottest texel', () => {
    // The argmax answer is 13.8867 / 216.0352; the centroid is 13.7953 /
    // 216.0635. A tenth of a degree apart, which is the point — if these ever
    // came out equal the centroid code would have stopped running.
    const argmax = texelDirection({ width: W, height: H }, 614, 295)
    expect(Math.asin(argmax[1]) * (180 / Math.PI)).toBeCloseTo(13.886719, 5)
    expect(MOONRISE_LIGHT_SOURCE.altitudeDeg).not.toBeCloseTo(13.886719, 3)
  })

  it('weights each row by the solid angle it covers', () => {
    // Two equally bright texels, one on the horizon and one 86 degrees up. An
    // unweighted mean lands near 43 degrees; weighting by cos(altitude) all but
    // ignores the polar one, because its row covers a twentieth of the sphere
    // the equatorial row does. Without that, a handful of hot texels near a
    // pole would outvote the real source.
    const map = greyMap(W, H, 0)
    setTexel(map, 300, 256, 1000)
    setTexel(map, 300, 502, 1000)
    const found = findSkyLightSource(map, 0.5)
    expect(found.texelCount).toBe(2)
    expect(found.altitudeDeg).toBeGreaterThan(0)
    expect(found.altitudeDeg).toBeLessThan(10)
  })

  it('averages vectors, so a source straddling the u = 0 seam stays put', () => {
    // Azimuths of 359.8 and 0.2 degrees average to 180 if you average the
    // angles, which would throw the sun exactly halfway around the sky.
    const map = greyMap(W, H, 0)
    setTexel(map, 0, 256, 1000)
    setTexel(map, W - 1, 256, 1000)
    const found = findSkyLightSource(map, 0.5)
    // Not exactly -1: both texel centres sit a tenth of a degree off the seam
    // and the row itself is a tenth of a degree above the equator.
    expect(found.direction[0]).toBeCloseTo(-1, 4)
    expect(found.direction[2]).toBeCloseTo(0, 9)
  })
})

describe('MOONRISE_LIGHT_SOURCE', () => {
  it('is a unit vector', () => {
    expect(Math.hypot(...MOONRISE_LIGHT_SOURCE.direction)).toBeCloseTo(1, 12)
  })

  it('lands back on the texel it was measured from', () => {
    const [u, v] = equirectUv(MOONRISE_LIGHT_SOURCE.direction)
    expect(Math.floor(u * W)).toBe(MOONRISE_LIGHT_SOURCE.peakTexel[0])
    expect(Math.floor(v * H)).toBe(MOONRISE_LIGHT_SOURCE.peakTexel[1])
  })

  it('stands above the horizon, as a risen moon must', () => {
    // The decisive check on the v axis. Read the map upside down and this
    // becomes -13.8 degrees: a light source below the floor, in a file named
    // "moonrise" whose moon the user can point at in a screenshot.
    expect(MOONRISE_LIGHT_SOURCE.direction[1]).toBeGreaterThan(0)
    expect(MOONRISE_LIGHT_SOURCE.altitudeDeg).toBeCloseTo(13.7953, 3)
  })

  it('stands in the +X/+Z quadrant, 36 degrees off +X', () => {
    // Pins the horizontal quadrant outright: a mirrored u axis would put the
    // moon at -36 degrees and the shadows across the opposite pair of walls.
    expect(MOONRISE_LIGHT_SOURCE.direction[0]).toBeGreaterThan(0)
    expect(MOONRISE_LIGHT_SOURCE.direction[2]).toBeGreaterThan(0)
    expect(MOONRISE_LIGHT_SOURCE.seamAzimuthDeg - 180).toBeCloseTo(36.06, 1)
  })

  it('agrees with the peak radiance measured independently in moonriseSky', () => {
    // MOONRISE_SKY.peakRadiance is 91250, arrived at by a different pass over
    // the same file. Two decodes, one answer.
    expect(MOONRISE_LIGHT_SOURCE.peakRadiance).toBeCloseTo(91250, 0)
    expect(MOONRISE_LIGHT_SOURCE.thresholdFraction).toBe(BRIGHT_THRESHOLD)
  })
})
