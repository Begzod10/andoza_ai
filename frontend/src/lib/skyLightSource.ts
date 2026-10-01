/**
 * Where the light in the sky photograph actually comes from.
 *
 * The user looked at the running studio (2026-10-02) and said: "i found hdri
 * light source point, move the sun to that point so that sunlight comes from
 * that point, in image, sunlight is coming in different direction". Their
 * screenshot shows it plainly — a broad white glow high in the sky on one side
 * of the frame, and the pool of sunlight on the floor entering through a window
 * on the *other* side. The room is lit by a photograph of a sky, and the
 * photograph says where its light source is; the directional light was still
 * being aimed by the time-of-day clock, which knows nothing about the picture.
 * A beam arriving from one direction while the visible sky shows its source in
 * another is the single most obvious giveaway in an interior render.
 *
 * So this file answers one question about an equirectangular radiance map: in
 * which world direction does its light source stand. `moonriseSky.ts` is the
 * companion file — it measures how *bright* this same photograph is and what
 * that forces on the exposures; this one measures *where* it is bright.
 *
 * ── Why a centroid and not an argmax ────────────────────────────────────────
 *
 * The brightest single texel is the obvious answer and the wrong one. The moon
 * in this file is not a texel, it is a small disc smeared over a handful of
 * them by whatever resampling produced the 1k version, and the hottest of those
 * is hot by an accident of where the disc's centre fell inside a texel grid.
 * Taking the radiance-weighted centroid of the bright region instead uses all
 * of the disc's energy, which is also exactly what a directional light stands
 * in for: not a point of peak radiance but the mean direction the energy
 * arrives from. For this file the two answers differ by about a tenth of a
 * degree — small, but free to get right, and the centroid is the one that does
 * not jump by half a texel when somebody re-exports the HDRI at another size.
 *
 * The weight is radiance x solid angle, not radiance alone. An equirectangular
 * map devotes the same number of texels to the ring around the pole as to the
 * one around the equator, and the polar ring covers almost no sphere: each row
 * subtends cos(altitude) (equivalently sin(theta)) of it. Leaving that out
 * would let a few bright texels near a pole outvote the real source.
 *
 * ── The equirectangular convention, which is where this work usually breaks ──
 *
 * Getting the mapping mirrored, or a quarter turn out, puts the sun on the
 * wrong wall while every number on the way still looks plausible. three.js's
 * own convention is the only one that matters here, and it is a single function
 * in `common.glsl.js`:
 *
 *   u = atan2(d.z, d.x) / 2pi + 0.5
 *   v = asin(d.y) / pi + 0.5
 *
 * Both paths this sky takes to the screen go through that exact function:
 * `WebGLCubeRenderTarget.fromEquirectangularTexture` calls `equirectUv` on a
 * world-space direction to build the cubemap the background box is drawn with,
 * and `PMREMGenerator`'s EquirectangularToCubeUV shader calls it on the output
 * direction to build the environment. So one convention covers both the view
 * out of the window and the light the room receives, and `skyEnvironment.ts`
 * already writes the same two lines down for the sky it draws by hand.
 *
 * The vertical half of it has one more link in the chain, and it is the link
 * that would silently put the sun underneath the floor. three-stdlib's
 * EXRLoader writes EXR scanline 0 — the TOP of the image — to the LAST row of
 * the data buffer (`outIndex = (height - 1 - true_y) * ...`), and `DataTexture`
 * sets `flipY = false`, which the loader never overrides. So texture v = 0 is
 * data row 0 is the bottom of the image is the nadir, and v rises with y. That
 * is the convention `rowDirection` below encodes, and the measurement confirms
 * it from the pixels: the file's bright near-neutral horizon band lands on data
 * rows 255-257 of 512 and its dark blue zenith on rows 508-511, matching the
 * `horizonRadiance` and `zenithRadiance` already recorded in `moonriseSky.ts`.
 * Were it the other way round the moon would measure 13.8 degrees BELOW the
 * horizon, and a sky called "moonrise" whose moon is underground is not a
 * reading anyone has to take seriously.
 *
 * Nothing here runs in the browser. Decoding a 5 MB EXR to average it would
 * cost a second of main thread on every studio open to arrive at numbers that
 * only change when somebody swaps the file, exactly as `moonriseSky.ts` argues
 * for its own measurements. `findSkyLightSource` exists so the measurement is
 * reproducible code with tests rather than a number in a commit message, and
 * `MOONRISE_LIGHT_SOURCE` is what it returned for the shipped file.
 */

/** Unit vector in the scene's X/Y/Z frame — X along wall A, Z along wall B, Y up. */
export type Direction = readonly [number, number, number]

/**
 * An equirectangular radiance map as three-stdlib's EXRLoader hands it over:
 * four floats per texel (RGBA), row-major, and **row 0 is the nadir** — see
 * the note on the loader's scanline reversal above.
 */
export interface EquirectRadianceMap {
  readonly width: number
  readonly height: number
  readonly data: ArrayLike<number>
}

/** Where a light source in one of these maps stands, and how well pinned down. */
export interface SkyLightSource {
  /** Radiance-weighted centroid of the bright region, as a unit vector. */
  readonly direction: Direction
  /** Degrees above the horizon. */
  readonly altitudeDeg: number
  /**
   * Degrees along u from the texture's u = 0 seam, which is the -X direction.
   * Reported rather than a compass bearing on purpose: the sky is a photograph
   * and has no compass, so the seam is the only landmark it actually carries.
   */
  readonly seamAzimuthDeg: number
  /** Luminance of the brightest single texel, and where it sits. */
  readonly peakRadiance: number
  readonly peakTexel: readonly [number, number]
  /** How many texels passed the threshold — the size of the disc, in texels. */
  readonly texelCount: number
  /** The fraction of the peak used as the threshold. */
  readonly thresholdFraction: number
}

/**
 * Rec. 709 luminance, the same weights three's own `luminance()` uses.
 *
 * The source is thresholded on luminance rather than on a single channel so a
 * coloured source — a sun reddened by the horizon, say — is found by how bright
 * it is and not by how red it happens to be.
 */
export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** three's `equirectUv`, in TypeScript. u and v both in [0, 1]. */
export function equirectUv(direction: Direction): [number, number] {
  const [x, y, z] = direction
  const clamped = y < -1 ? -1 : y > 1 ? 1 : y
  return [
    Math.atan2(z, x) / (Math.PI * 2) + 0.5,
    Math.asin(clamped) / Math.PI + 0.5,
  ]
}

/** The inverse: the world direction a given (u, v) is sampled for. */
export function equirectDirection(u: number, v: number): [number, number, number] {
  const phi = (u - 0.5) * Math.PI * 2
  const altitude = (v - 0.5) * Math.PI
  const cosAlt = Math.cos(altitude)
  return [cosAlt * Math.cos(phi), Math.sin(altitude), cosAlt * Math.sin(phi)]
}

/** The direction sampled at the CENTRE of texel (x, y) — hence the half-texel. */
export function texelDirection(
  map: Pick<EquirectRadianceMap, 'width' | 'height'>,
  x: number,
  y: number,
): [number, number, number] {
  return equirectDirection((x + 0.5) / map.width, (y + 0.5) / map.height)
}

/**
 * The fraction of the peak at which a texel counts as part of the source.
 *
 * 2% for this file, and the choice turns out not to matter: see the threshold
 * sweep in `__tests__/skyLightSource.test.ts`. Between 90% of the peak (one
 * texel) and 0.1% of it (nine), the centroid moves 0.09 degrees in altitude and
 * 0.07 in azimuth — a twentieth of the moon's own apparent size, and far below
 * what a shadow in a 4-metre room can show. 2% sits in the middle of that
 * plateau: high enough that the disc's soft halo, which is a thousand times
 * dimmer than the core and spread over degrees, cannot drag the centroid
 * anywhere, and low enough to collect the whole disc rather than its hottest
 * corner.
 */
export const BRIGHT_THRESHOLD = 0.02

/**
 * Find the light source in an equirectangular radiance map.
 *
 * Two passes: one to find the peak, a second to average the directions of
 * everything within `thresholdFraction` of it, weighted by radiance x solid
 * angle. Summing the direction VECTORS and normalising at the end, rather than
 * averaging altitudes and azimuths, is what keeps it correct for a source that
 * straddles the u = 0 seam — where the azimuths to be averaged are 359 and 1.
 */
export function findSkyLightSource(
  map: EquirectRadianceMap,
  thresholdFraction = BRIGHT_THRESHOLD,
): SkyLightSource {
  const { width, height, data } = map

  let peakRadiance = -Infinity
  let peakX = 0
  let peakY = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const lum = luminance(data[i], data[i + 1], data[i + 2])
      if (lum > peakRadiance) {
        peakRadiance = lum
        peakX = x
        peakY = y
      }
    }
  }

  const cut = peakRadiance * thresholdFraction
  let sx = 0
  let sy = 0
  let sz = 0
  let texelCount = 0
  for (let y = 0; y < height; y++) {
    // Every texel in a row subtends the same solid angle, and it falls off as
    // the row approaches a pole. Hoisted out of the inner loop because it is a
    // property of the row, not of the texel.
    const altitude = ((y + 0.5) / height - 0.5) * Math.PI
    const solidAngle = Math.cos(altitude)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const lum = luminance(data[i], data[i + 1], data[i + 2])
      if (lum < cut) continue
      const [dx, dy, dz] = texelDirection(map, x, y)
      const weight = lum * solidAngle
      sx += weight * dx
      sy += weight * dy
      sz += weight * dz
      texelCount++
    }
  }

  const length = Math.hypot(sx, sy, sz)
  const direction: [number, number, number] = [sx / length, sy / length, sz / length]
  const [u] = equirectUv(direction)
  return {
    direction,
    altitudeDeg: (Math.asin(direction[1]) * 180) / Math.PI,
    seamAzimuthDeg: u * 360,
    peakRadiance,
    peakTexel: [peakX, peakY],
    texelCount,
    thresholdFraction,
  }
}

// ─── The shipped file, as measured ────────────────────────────────────────────

/** The two measured angles. Everything else about the moon follows from them. */
const MOONRISE_ALTITUDE_DEG = 13.795316
const MOONRISE_SEAM_AZIMUTH_DEG = 216.063549

/**
 * `public/hdri/qwantani_moonrise_puresky_1k.exr`, measured 2026-10-02.
 *
 * Produced by running `findSkyLightSource` over the file decoded offline with
 * three-stdlib's EXRLoader at `FloatType` — the same loader drei's
 * <Environment> reaches for on a `.exr` path, so this cannot disagree with what
 * the GPU samples. Its `peakRadiance` matches the 91,250 already recorded
 * independently in `moonriseSky.ts`, which is a free cross-check that both
 * measurements decoded the same file the same way.
 *
 * The moon is TINY: seven texels out of 524,288 carry 2% of the peak or more,
 * and the hottest one is 91,250 against a whole-sphere mean of 1.083 — eighty
 * thousand times the average sky. That is why it survives being drawn at
 * `MOONRISE_BACKGROUND_INTENSITY` = 0.22 as a broad saturated-white glow (the
 * halo is still ten times the mean sky two degrees out, and ACES at the
 * studio's exposure clips all of it to white), and why the user could point
 * straight at it in a screenshot.
 *
 * 13.8 degrees is LOW — the moon has only just risen, which is what the file
 * is named for. Consequences worth knowing before anything is pinned to it:
 * shadows are long, roughly four times the height of whatever casts them, and
 * the beam rakes through a window at a shallow angle so the pool of light lands
 * far across the floor rather than under the sill. It also appears HIGH in the
 * studio's usual view, which is not a contradiction: the camera looks down into
 * the room, which puts the horizon line itself in the upper part of the frame,
 * and the moon sits above that line. The mirrored reading would put it below
 * the horizon, where the user's screenshot plainly does not show it.
 */
export const MOONRISE_LIGHT_SOURCE: SkyLightSource = {
  direction: equirectDirection(
    MOONRISE_SEAM_AZIMUTH_DEG / 360,
    MOONRISE_ALTITUDE_DEG / 180 + 0.5,
  ),
  altitudeDeg: MOONRISE_ALTITUDE_DEG,
  seamAzimuthDeg: MOONRISE_SEAM_AZIMUTH_DEG,
  peakRadiance: 91249.86,
  peakTexel: [614, 295],
  texelCount: 7,
  thresholdFraction: BRIGHT_THRESHOLD,
}
