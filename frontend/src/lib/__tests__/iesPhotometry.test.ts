import { describe, expect, it } from 'vitest'
import {
  iesAngleAtFractionDeg,
  iesCutoffDeg,
  iesRelativeOutputAt,
  iesSpotMapField,
  parseIes,
} from '@/lib/iesPhotometry'

/**
 * The shipped file, byte for byte: `public/ies/wide_downlight_13k.ies`, which
 * is the user's `Best IES 4/5.IES`. Inlined rather than read off disk so the
 * test is a statement about THESE numbers — if the asset is swapped, this test
 * still describes the parser and a second one would be needed for the new
 * fixture's own values.
 */
const SHIPPED = `IESNA91
[TEST]     Test unknown
[MANUFAC]  Manufacturing company unknown
TILT=NONE
1 13172.61 1
37 1
1
2
0 0 0
1 1 0
 0.00 2.50 5.00 7.50 9.11 10.00 10.80 12.50 15.83 22.50 25.00 27.50 32.50 34.28 35.00 42.50 47.02 47.50 47.81 50.00 50.78 52.50
 55.00 57.50 60.00 62.50 65.00 67.50 70.00 72.50 75.00 77.50 80.00 82.50 85.00 87.50 90.00
 0.00
 8379.00 8409.00 8528.00 8126.65 8500.00 8564.00 8301.00 8158.61 8411.98 8036.59 7865.61 7283.76 5209.38 6038.93 4533.49 3091.00
 3665.38 2996.97 3625.45 2194.62 3170.85 1115.28 651.00 450.00 244.00 102.00 80.00 43.00 5.00 2.00 0.00 0.00 0.00 0.00 0.00 0.00
 0.00
`

describe('parseIes — the shipped wide downlight', () => {
  const profile = parseIes(SHIPPED)

  it('reads the lamp row across its wrapped lines', () => {
    // The ten values of the lamp row are split over five physical lines in
    // this file, which is why the parser reads a stream of numbers rather
        // than going line by line.
    expect(profile.lumens).toBeCloseTo(13172.61, 2)
    expect(profile.verticalAnglesDeg).toHaveLength(37)
    expect(profile.candela).toHaveLength(37)
    expect(profile.horizontalPlanes).toBe(1)
  })

  it('keeps the candela table as measured, without squaring it', () => {
    // The whole reason this parser exists instead of three's own IESLoader,
    // which does `candela *= candela * multiplier * ...`. Straight down,
    // at the peak, and at the two shoulder readings the user quoted.
    expect(profile.candela[0]).toBeCloseTo(8379, 2)
    expect(profile.peakCandela).toBeCloseTo(8564, 2)
    expect(profile.candela[12]).toBeCloseTo(5209.38, 2)
    expect(profile.candela[15]).toBeCloseTo(3091, 2)
    expect(profile.candela[21]).toBeCloseTo(1115.28, 2)
    expect(profile.candela[24]).toBeCloseTo(244, 2)
  })

  it('is dark from 75 degrees out', () => {
    const { verticalAnglesDeg: angles, candela } = profile
    for (let i = 0; i < angles.length; i++) {
      if (angles[i] >= 75) expect(candela[i]).toBe(0)
    }
    expect(candela[29]).toBeCloseTo(2, 6) // 72.5 degrees, the last lit reading
  })

  it('puts the spot light cone at the angle the fixture goes dark', () => {
    expect(iesCutoffDeg(profile)).toBe(75)
  })

  it('finds the beam and field angles for the spacing rule', () => {
    // Half of peak between 35 degrees (4533 cd) and 42.5 (3091), and a tenth
    // of peak between 52.5 (1115) and 55 (651).
    expect(iesAngleAtFractionDeg(profile, 0.5)).toBeCloseTo(36.31, 2)
    expect(iesAngleAtFractionDeg(profile, 0.1)).toBeCloseTo(53.89, 2)
  })

  it('reads the beam angle past the dip in the shoulder, not at it', () => {
    // The table is not monotonic — 5209 cd at 32.5 degrees, back up to 6039
    // at 34.28. Walking outward from the axis would call 32.5 the edge of a
    // 60%-of-peak beam; walking inward from the far end gives the real one.
    expect(iesAngleAtFractionDeg(profile, 0.6)).toBeGreaterThan(34.28)
  })

  it('interpolates linearly between tabulated readings', () => {
    expect(iesRelativeOutputAt(profile, 0)).toBeCloseTo(8379 / 8564, 6)
    expect(iesRelativeOutputAt(profile, 10)).toBeCloseTo(1, 6)
    // Halfway from 55 (651 cd) to 57.5 (450 cd).
    expect(iesRelativeOutputAt(profile, 56.25)).toBeCloseTo(((651 + 450) / 2) / 8564, 6)
    expect(iesRelativeOutputAt(profile, 80)).toBe(0)
    // Below the first angle there is nothing to interpolate towards.
    expect(iesRelativeOutputAt(profile, -5)).toBeCloseTo(8379 / 8564, 6)
  })
})

describe('parseIes — other shapes of the format', () => {
  it('steps over an inline TILT block', () => {
    const text = `IESNA:LM-63-1995
TILT=INCLUDE
1
2
0 90
1.0 0.9
1 1000 1 3 1 1 2 0 0 0
1 1 10
0 45 90
0
100 50 0
`
    const profile = parseIes(text)
    expect(profile.lumens).toBe(1000)
    expect(profile.candela).toEqual([100, 50, 0])
    expect(iesCutoffDeg(profile)).toBe(90)
  })

  it('applies the candela multiplier and both ballast factors', () => {
    const text = `IESNA91
TILT=NONE
1 1000 2 3 1 1 2 0 0 0
0.5 1 10
0 45 90
0
100 50 0
`
    // 2 (multiplier) x 0.5 (ballast) x 1 = 1, so the table is unchanged in
    // absolute terms — and the point of the test is that all three are read
    // in and none of them is squared.
    expect(parseIes(text).candela).toEqual([100, 50, 0])
  })

  it('averages several horizontal planes into one curve', () => {
    const text = `IESNA91
TILT=NONE
1 1000 1 3 2 1 2 0 0 0
1 1 10
0 45 90
0 90
100 50 0
200 150 0
`
    const profile = parseIes(text)
    expect(profile.horizontalPlanes).toBe(2)
    expect(profile.candela).toEqual([150, 100, 0])
  })

  it('refuses a file it cannot read rather than guessing', () => {
    expect(() => parseIes('hello\nworld\n')).toThrow(/TILT/)
    expect(() => parseIes('TILT=NONE\n1 1000 1 3 1 1 2 0 0 0\n1 1 10\n0 45\n')).toThrow(/ran out/)
  })
})

describe('iesSpotMapField — the radial projection', () => {
  const profile = parseIes(SHIPPED)
  const SIZE = 64
  const field = iesSpotMapField(profile, SIZE)
  const at = (i: number, j: number) => field[j * SIZE + i]

  it('fills the whole square', () => {
    expect(field).toHaveLength(SIZE * SIZE)
  })

  it('peaks in the middle, where the cone axis projects', () => {
    const middle = at(SIZE / 2, SIZE / 2)
    for (let i = 0; i < field.length; i++) expect(field[i]).toBeLessThanOrEqual(middle + 1e-6)
    // Not exactly the on-axis 8379/8564: the texel centres straddle the middle
    // of the image, so the brightest texel is a few degrees off axis, where
    // this fixture is slightly brighter than straight down (it peaks at 8564
    // cd at 10 degrees). It is still within 2% of full output.
    expect(middle).toBeGreaterThan(0.98)
    expect(middle).toBeLessThanOrEqual(1)
  })

  it('is radially symmetric', () => {
    for (const [i, j] of [[10, 20], [3, 31], [0, 0], [63, 17]]) {
      expect(at(SIZE - 1 - i, j)).toBeCloseTo(at(i, j), 6)
      expect(at(i, SIZE - 1 - j)).toBeCloseTo(at(i, j), 6)
      expect(at(j, i)).toBeCloseTo(at(i, j), 6)
    }
  })

  it('maps texel radius to angle the way the shadow camera projects it', () => {
    // uv radius 0.5 is the cone edge, so a texel in the middle of an edge of
    // the image is right at the cutoff and dark, and the corners (radius
    // 0.707) are outside the cone entirely, where the light's own angular
    // attenuation is zero anyway.
    expect(at(0, SIZE / 2)).toBeLessThan(1e-4)
    expect(at(0, 0)).toBe(0)

    // Quarter of the way across: reproduce the mapping the shader will apply
    // and check the texel carries the fixture's output at exactly that angle.
    const u = (SIZE / 4 + 0.5) / SIZE - 0.5
    const v = (SIZE / 2 + 0.5) / SIZE - 0.5
    const rho = Math.hypot(u, v)
    const theta = (Math.atan(2 * rho * Math.tan((75 * Math.PI) / 180)) * 180) / Math.PI
    expect(at(SIZE / 4, SIZE / 2)).toBeCloseTo(iesRelativeOutputAt(profile, theta), 6)
    // Which is between the 60 degree (244 cd) and 62.5 degree (102 cd)
    // readings — a projective mapping, so a quarter of the image is already
    // most of the way to the cone's edge in angle.
    expect(theta).toBeGreaterThan(60)
    expect(theta).toBeLessThan(62.5)
  })

  it('puts the half-output edge where the projection says it should be', () => {
    // tan(36.31) / tan(75) / 2 = 0.0984 of the image radius. That is the
    // projection being projective: the measured core and shoulder live in the
    // inner fifth of the cone's own circle, and the outer four fifths carry
    // the tail and the zeros.
    const row = SIZE / 2
    let halfAt = -1
    for (let i = SIZE / 2; i < SIZE; i++) {
      if (at(i, row) < 0.5) { halfAt = i; break }
    }
    const rho = (halfAt + 0.5) / SIZE - 0.5
    expect(rho).toBeCloseTo(0.0984, 1)
    const edgeDeg = (Math.atan(2 * rho * Math.tan((75 * Math.PI) / 180)) * 180) / Math.PI
    expect(edgeDeg).toBeGreaterThan(34)
    expect(edgeDeg).toBeLessThan(40)
  })
})
