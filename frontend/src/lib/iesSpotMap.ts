/**
 * The shipped IES profile, as a texture a three.js `SpotLight` can project.
 *
 * Served from `public/` and fetched at runtime rather than bundled, the same
 * way `lib/hdri.ts` handles the sky maps — and, like them, it stays out of the
 * service worker precache, because `globPatterns` in `vite.config.ts` only
 * covers js/css/html/ico/png/svg/webp. It is 622 bytes, so nobody notices
 * either way; the reason to keep it a file instead of a TypeScript constant is
 * that swapping the fixture then means dropping a new `.ies` in beside it,
 * which is how the HDRIs already work.
 *
 * `iesPhotometry.ts` explains why none of this goes through three's own
 * `IESLoader`, and derives the projection this module fills a texture for.
 */
import * as THREE from 'three'
import {
  iesAngleAtFractionDeg,
  iesCutoffDeg,
  iesSpotMapField,
  parseIes,
  type IesProfile,
} from '@/lib/iesPhotometry'

/**
 * `public/ies/wide_downlight_13k.ies` — the user's `Best IES 4/5.IES`.
 *
 * An IESNA91, TILT=NONE, single-lamp file: 13172.61 lumens, 37 vertical angles
 * from 0 to 90 degrees and one horizontal plane, so axially symmetric. It is a
 * wide downlight with a soft shoulder and a hard cutoff — 8379 cd straight
 * down, holding above 8000 out to about 16 degrees, through 5209 at 32.5,
 * 3091 at 42.5, 1115 at 52.5 and 244 at 60, dark by 75.
 */
export const DEFAULT_IES_URL = '/ies/wide_downlight_13k.ies'

/**
 * Texels across the profile image.
 *
 * The mapping is projective, not angular, so resolution is not spread evenly
 * over the cone: radius in the image goes as tan(theta), and this fixture's
 * whole core and shoulder — out to the 36.3 degree half-output edge — lands
 * inside tan(36.3)/tan(75)/2 = 0.098 of the image radius, with the outer four
 * fifths carrying only the tail and the zeros.
 *
 * So the number that matters is how much angle one texel spans where the
 * profile is actually changing, and at 256 that is about 1.1 degrees — finer
 * than the file's own 2.5 degree tabulation, which means the texture is not
 * the limiting approximation. On the floor of a 2.7 m room it works out at
 * roughly 8 cm per texel across the bright part of the pool, linearly
 * interpolated. 256 KB of RGBA on the GPU, uploaded once and shared by every
 * lamp in the room.
 */
const MAP_SIZE = 256

/** Everything a `<spotLight>` needs to reproduce one IES file. */
export interface IesSpotSetup {
  /** The profile image, for `SpotLight.map`. */
  map: THREE.DataTexture
  /** `SpotLight.angle`, radians — the angle past which the fixture is dark. */
  angleRad: number
  /** The same in degrees, for comments, labels and tests. */
  cutoffDeg: number
  /** Full angle between the 50%-of-peak directions, degrees. */
  beamAngleDeg: number
  /** The file's rated lumens, which is where the light's intensity comes from. */
  lumens: number
  /** The parsed table, for anything that needs the curve itself. */
  profile: IesProfile
}

/**
 * Build the projection texture for a profile.
 *
 * RGBA unsigned byte, deliberately. The core shader multiplies the light by
 * `spotColor.rgb` with no decode of any kind, so the texture has to carry a
 * plain linear multiplier in all three channels — a single-channel format
 * samples as (r, 0, 0) and would turn the lamp red, which is the second of the
 * two bugs `iesPhotometry.ts` lists against three's own `IESLoader`. Eight bits
 * is enough: one step is 1/255 of the lamp's peak, which on a floor lit to a
 * couple of times the ambient fill works out below a single 8-bit output code
 * value, so the gradient cannot band.
 *
 * `LinearFilter` on both axes has to be set explicitly — a `DataTexture`
 * defaults to `NearestFilter`, which over a beam several metres across would
 * show as visible steps — and mipmaps are left off, which `LinearFilter`
 * minification requires anyway.
 */
export function buildIesSpotMap(profile: IesProfile, size = MAP_SIZE): THREE.DataTexture {
  const field = iesSpotMapField(profile, size, iesCutoffDeg(profile))
  const data = new Uint8Array(size * size * 4)
  for (let i = 0; i < field.length; i++) {
    const v = Math.round(Math.min(1, Math.max(0, field[i])) * 255)
    data[i * 4] = v
    data[i * 4 + 1] = v
    data[i * 4 + 2] = v
    data[i * 4 + 3] = 255
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType)
  texture.colorSpace = THREE.NoColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

/** Profile plus texture, from the text of an `.ies` file. */
export function iesSpotSetup(text: string, size = MAP_SIZE): IesSpotSetup {
  const profile = parseIes(text)
  const cutoffDeg = iesCutoffDeg(profile)
  return {
    map: buildIesSpotMap(profile, size),
    angleRad: (cutoffDeg * Math.PI) / 180,
    cutoffDeg,
    beamAngleDeg: 2 * iesAngleAtFractionDeg(profile, 0.5),
    lumens: profile.lumens,
    profile,
  }
}

/**
 * One shared fetch-parse-upload for the whole app.
 *
 * Every lamp in every 3D view projects the same profile, so the parse and the
 * 256 KB texture happen once per page load and the result is handed out to all
 * of them. A failed fetch resolves to null rather than rejecting, so a missing
 * file costs the room its default lamps and nothing else.
 */
let pending: Promise<IesSpotSetup | null> | null = null

export function loadDefaultIesSpot(url = DEFAULT_IES_URL): Promise<IesSpotSetup | null> {
  if (!pending) {
    pending = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.text()
      })
      .then((text) => iesSpotSetup(text))
      .catch((err) => {
        console.warn(`[ies] could not load ${url}:`, err)
        return null
      })
  }
  return pending
}

/** Test seam — drops the memoised load so a test can stub `fetch` again. */
export function resetDefaultIesSpot(): void {
  pending = null
}
