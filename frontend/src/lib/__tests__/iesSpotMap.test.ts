import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import {
  DEFAULT_IES_URL,
  buildIesSpotMap,
  iesSpotSetup,
  loadDefaultIesSpot,
  resetDefaultIesSpot,
} from '@/lib/iesSpotMap'
import { iesRelativeOutputAt, parseIes } from '@/lib/iesPhotometry'

/**
 * The shipped asset itself, off disk.
 *
 * On purpose: `iesPhotometry.test.ts` pins the parser against an inlined copy
 * of the file's text, and this pins that the file we actually serve from
 * `public/` is the one those numbers describe. A truncated or replaced asset
 * would leave the room with no default lamps at runtime and nothing else would
 * notice.
 */
const SHIPPED = readFileSync(resolve(__dirname, '../../../public/ies/wide_downlight_13k.ies'), 'utf8')

describe('the shipped asset', () => {
  it('is served from the path the code asks for', () => {
    expect(DEFAULT_IES_URL).toBe('/ies/wide_downlight_13k.ies')
  })

  it('is the user’s file, and parses', () => {
    const profile = parseIes(SHIPPED)
    expect(profile.lumens).toBeCloseTo(13172.61, 2)
    expect(profile.peakCandela).toBeCloseTo(8564, 2)
    expect(profile.horizontalPlanes).toBe(1)
  })

  it('is small enough that fetching it at runtime costs nothing', () => {
    expect(SHIPPED.length).toBeLessThan(4096)
  })
})

describe('iesSpotSetup', () => {
  const setup = iesSpotSetup(SHIPPED, 64)

  it('sets the cone to the angle the fixture goes dark at', () => {
    expect(setup.cutoffDeg).toBe(75)
    expect(setup.angleRad).toBeCloseTo(Math.PI * (75 / 180), 9)
    // three refuses a spot light wider than a hemisphere.
    expect(setup.angleRad).toBeLessThanOrEqual(Math.PI / 2)
  })

  it('carries the file lumens and the beam angle through', () => {
    expect(setup.lumens).toBeCloseTo(13172.61, 2)
    expect(setup.beamAngleDeg).toBeCloseTo(72.62, 2)
  })
})

describe('buildIesSpotMap', () => {
  const profile = parseIes(SHIPPED)
  const SIZE = 64
  const texture = buildIesSpotMap(profile, SIZE)
  const data = texture.image.data as Uint8Array

  it('is RGBA, not single-channel', () => {
    // A RedFormat texture samples as (r, 0, 0) and the core shader multiplies
    // the light by spotColor.rgb — which is why three's own IESLoader output
    // would make the lamp pure red. All three channels carry the profile.
    expect(texture.format).toBe(THREE.RGBAFormat)
    expect(texture.type).toBe(THREE.UnsignedByteType)
    expect(data).toHaveLength(SIZE * SIZE * 4)
    const middle = ((SIZE / 2) * SIZE + SIZE / 2) * 4
    expect(data[middle + 1]).toBe(data[middle])
    expect(data[middle + 2]).toBe(data[middle])
    expect(data[middle + 3]).toBe(255)
  })

  it('carries a plain linear multiplier, with no colour space applied to it', () => {
    // The shader samples it raw. An sRGB colour space on the texture would
    // have three decode it and gamma the measured curve.
    expect(texture.colorSpace).toBe(THREE.NoColorSpace)
  })

  it('is filtered, which a DataTexture is not by default', () => {
    // DataTexture defaults to NearestFilter and no mipmaps; over a beam
    // several metres across nearest sampling shows as visible steps.
    expect(texture.minFilter).toBe(THREE.LinearFilter)
    expect(texture.magFilter).toBe(THREE.LinearFilter)
    expect(texture.generateMipmaps).toBe(false)
    expect(texture.wrapS).toBe(THREE.ClampToEdgeWrapping)
    expect(texture.wrapT).toBe(THREE.ClampToEdgeWrapping)
  })

  it('quantises the profile to within one part in 255', () => {
    for (const [i, j] of [[32, 32], [36, 32], [40, 40], [0, 0], [20, 44]]) {
      const u = (i + 0.5) / SIZE - 0.5
      const v = (j + 0.5) / SIZE - 0.5
      const rho = Math.hypot(u, v)
      const deg = (Math.atan(2 * rho * Math.tan((75 * Math.PI) / 180)) * 180) / Math.PI
      const want = iesRelativeOutputAt(profile, deg)
      expect(data[(j * SIZE + i) * 4] / 255).toBeCloseTo(want, 2)
    }
  })
})

describe('loadDefaultIesSpot', () => {
  afterEach(() => {
    resetDefaultIesSpot()
    vi.unstubAllGlobals()
  })

  it('fetches, parses and shares one setup', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => SHIPPED })
    vi.stubGlobal('fetch', fetchMock)
    const [a, b] = await Promise.all([loadDefaultIesSpot(), loadDefaultIesSpot()])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(DEFAULT_IES_URL)
    expect(a).toBe(b)
    expect(a?.cutoffDeg).toBe(75)
  })

  it('costs the room its default lamps and nothing else when the file is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(loadDefaultIesSpot()).resolves.toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
