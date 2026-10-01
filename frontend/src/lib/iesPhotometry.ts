/**
 * Reading an IES photometric file, and turning it into something three.js can
 * actually project.
 *
 * An `.ies` file (IESNA LM-63) is how a real luminaire's measured light
 * distribution is published: a table of candela against the angle away from
 * the fixture's axis. The user asked for the room's default ceiling lights to
 * use one — `Best IES 4/5.IES`, shipped here as
 * `public/ies/wide_downlight_13k.ies` — rather than for a cone with a guessed
 * beam angle, because a guessed cone is the one thing that never looks like a
 * real downlight: it has a flat middle and a cut edge, where a measured
 * fixture has a shoulder and a tail.
 *
 * three.js has no IES support worth using in the version this app is pinned to
 * (0.165), which is why this file exists rather than an import:
 *
 *   - `three/addons/loaders/IESLoader.js` is present, but it SQUARES the table
 *     on the way in — `candelaValues[i][j] *= candelaValues[i][j] * multiplier
 *     * ballFactor * blpFactor` — so after its own normalisation the curve is
 *     the measured one raised to the power 2. For this file that turns a
 *     fixture holding ~98% of peak out to 22.5 degrees into one down to 95%,
 *     and a 36% shoulder at 42.5 degrees into 13%: a visibly narrower, harder
 *     light than the one that was measured.
 *   - It emits a `RedFormat` DataTexture, and the core shader multiplies the
 *     light by `spotColor.rgb` (see `lights_fragment_begin.glsl.js`). A
 *     single-channel sampler reads as (r, 0, 0), so the lamp would come out
 *     pure red.
 *   - Its texture is 180x1 and `SpotLight.map` is sampled with the light's
 *     PROJECTIVE coordinates, not with an angle, so a 1-D table lands as a
 *     horizontal ramp across the cone instead of a radial falloff.
 *
 * So: parse the file here, and build the radial map `SpotLight.map` really
 * wants in `iesSpotMap.ts`. Everything in this module is pure arithmetic over
 * numbers, with the shipped file's own values as the test fixtures, because
 * there is no WebGL in this environment and "the light looks right" cannot be
 * checked by looking.
 */

/**
 * One luminaire's measured distribution, collapsed to the single
 * candela-against-angle curve a radial projection can carry.
 */
export interface IesProfile {
  /** Rated output of one lamp in lumens, as the file declares it. */
  lumens: number
  /** Vertical (polar) angles in degrees, ascending. 0 is the fixture's axis. */
  verticalAnglesDeg: number[]
  /**
   * Candela at each of those angles, already through the file's candela
   * multiplier and its ballast factors, and averaged over however many
   * horizontal planes the file tabulates.
   */
  candela: number[]
  /**
   * How many horizontal planes the file measured. 1 means the fixture is
   * axially symmetric and the average above is the exact curve; more than 1
   * means it is a mean over the planes, which is all a radially symmetric
   * projection can represent anyway.
   */
  horizontalPlanes: number
  /** The largest value in `candela` — the normalising divisor. */
  peakCandela: number
}

/**
 * Pull the numbers out of an LM-63 file.
 *
 * The format allows a logical row to be wrapped over as many physical lines as
 * it likes — the shipped file splits its 37 vertical angles over two lines and
 * its 37 candela over three — so everything after the TILT line is read as one
 * stream of numbers rather than line by line. Everything BEFORE the TILT line
 * is keyword metadata ([TEST], [MANUFAC], ...) and is skipped wholesale, which
 * is also what keeps a file with extra keywords from shifting the stream.
 */
export function parseIes(text: string): IesProfile {
  const lines = text.split(/\r?\n/)
  const tiltIndex = lines.findIndex((l) => l.trimStart().toUpperCase().startsWith('TILT='))
  if (tiltIndex < 0) throw new Error('parseIes: no TILT= line — not an LM-63 photometric file')

  const tilt = lines[tiltIndex].trim().toUpperCase()
  const numbers = lines
    .slice(tiltIndex + 1)
    .join(' ')
    .split(/[\s,]+/)
    .filter((t) => t.length > 0)
    .map(Number)

  let cursor = 0
  const take = (count: number, what: string): number[] => {
    const out = numbers.slice(cursor, cursor + count)
    if (out.length < count || out.some((v) => !isFinite(v))) {
      throw new Error(`parseIes: ran out of numbers reading ${what} (wanted ${count}, got ${out.length})`)
    }
    cursor += count
    return out
  }

  // TILT=INCLUDE carries its own block of angles and multiplying factors
  // inline, which has to be stepped over before the lamp row. TILT=<filename>
  // points at a separate file we have no way to fetch, and TILT=NONE has no
  // block at all; both mean "read on from here".
  if (tilt === 'TILT=INCLUDE') {
    take(1, 'tilt lamp-to-luminaire geometry')
    const [tiltAngles] = take(1, 'tilt angle count')
    take(tiltAngles, 'tilt angles')
    take(tiltAngles, 'tilt multiplying factors')
  }

  const [, lumens, multiplier, numVertical, numHorizontal] = take(10, 'the lamp row')
  const [ballastFactor, ballastLampFactor] = take(3, 'the ballast row')

  if (numVertical < 2 || numHorizontal < 1) {
    throw new Error(`parseIes: unusable angle counts (${numVertical} vertical, ${numHorizontal} horizontal)`)
  }

  const verticalAnglesDeg = take(numVertical, 'the vertical angles')
  take(numHorizontal, 'the horizontal angles')

  // The candela multiplier and the two ballast factors all scale the table;
  // the file's own lumens figure does NOT, since it is a statement about the
  // lamp rather than a scale on the measurement.
  const scale = multiplier * ballastFactor * ballastLampFactor
  const candela = new Array<number>(numVertical).fill(0)
  for (let h = 0; h < numHorizontal; h++) {
    const plane = take(numVertical, `the candela for horizontal plane ${h}`)
    for (let v = 0; v < numVertical; v++) candela[v] += (plane[v] * scale) / numHorizontal
  }

  const peakCandela = candela.reduce((m, v) => Math.max(m, v), 0)
  if (!(peakCandela > 0)) throw new Error('parseIes: the candela table is all zero')

  return { lumens, verticalAnglesDeg, candela, horizontalPlanes: numHorizontal, peakCandela }
}

/**
 * The angle at which the fixture stops emitting, in degrees.
 *
 * This is what a three.js `SpotLight.angle` should be set to, and the reason
 * not to guess it: pick anything smaller and the cone cuts off light the file
 * says is there, pick anything larger and the cone's own edge becomes a hard
 * line the measurement does not have. The shipped file's last non-zero reading
 * is 2 cd at 72.5 degrees and its next reading is 0 at 75, so 75 is the angle
 * past which the fixture is dark — and 75 is what this returns.
 *
 * Capped at 90 because a `SpotLight` cone cannot open past a hemisphere, and
 * an LM-63 table never measures past 180 anyway.
 */
export function iesCutoffDeg(profile: IesProfile): number {
  const { verticalAnglesDeg, candela } = profile
  let lastLit = -1
  for (let i = 0; i < candela.length; i++) if (candela[i] > 0) lastLit = i
  if (lastLit < 0) return 0
  const firstDark = verticalAnglesDeg[lastLit + 1]
  return Math.min(90, firstDark ?? verticalAnglesDeg[lastLit])
}

/**
 * The angle at which output has fallen to `fraction` of peak, in degrees.
 *
 * The lighting-design "beam angle" is this at 0.5 and the "field angle" is it
 * at 0.1; `defaultRoomLights` uses the first to work out how much floor one of
 * these fixtures actually covers, which is how the spacing between them is
 * decided rather than invented.
 *
 * Measured tables are not monotonic — the shipped file dips to 5209 cd at 32.5
 * degrees and climbs back to 6039 at 34.28 — so this walks from the far end
 * inward and returns the LAST crossing rather than the first. Otherwise a dip
 * in the shoulder would be reported as the edge of the beam.
 */
export function iesAngleAtFractionDeg(profile: IesProfile, fraction: number): number {
  const { verticalAnglesDeg, candela, peakCandela } = profile
  const threshold = peakCandela * fraction
  for (let i = candela.length - 1; i > 0; i--) {
    if (candela[i] >= threshold) {
      if (i === candela.length - 1) return verticalAnglesDeg[i]
      // Cross between this reading and the next, which is below the threshold.
      const span = candela[i] - candela[i + 1]
      const t = span === 0 ? 0 : (candela[i] - threshold) / span
      return verticalAnglesDeg[i] + t * (verticalAnglesDeg[i + 1] - verticalAnglesDeg[i])
    }
  }
  return verticalAnglesDeg[0]
}

/**
 * Output at an arbitrary angle, as a fraction of peak.
 *
 * Linear between tabulated readings, which is what LM-63 intends; 1 below the
 * first angle (the table starts at the axis, so there is nothing below it) and
 * 0 past the last.
 */
export function iesRelativeOutputAt(profile: IesProfile, deg: number): number {
  const { verticalAnglesDeg: angles, candela, peakCandela } = profile
  if (deg <= angles[0]) return candela[0] / peakCandela
  const last = angles.length - 1
  if (deg >= angles[last]) return candela[last] / peakCandela
  let i = 0
  while (i < last && angles[i + 1] < deg) i++
  const span = angles[i + 1] - angles[i]
  const t = span === 0 ? 0 : (deg - angles[i]) / span
  return (candela[i] + t * (candela[i + 1] - candela[i])) / peakCandela
}

/**
 * The profile as the square image `SpotLight.map` is sampled with.
 *
 * three projects a spot light's map through the light's own perspective
 * frustum: the fragment shader reads `texture2D(spotLightMap[i],
 * spotLightCoord.xy)` where `spotLightCoord` comes from the shadow camera's
 * matrix, a `PerspectiveCamera` of aspect 1 whose vertical fov is twice the
 * light's `angle` (`SpotLightShadow.updateMatrices`). So for a point lying at
 * `theta` off the axis,
 *
 *     uv = 0.5 + 0.5 * tan(theta) / tan(angle) * (direction in the uv plane)
 *
 * which inverts to `theta = atan(2 * rho * tan(angle))` for a texel at radius
 * `rho` from the middle of the image. Fill each texel with the fixture's
 * relative output at its own `theta` and the projection reproduces the
 * measured distribution exactly — no shader patching, no custom material, and
 * nothing for a three.js upgrade to break.
 *
 * The cone's circle is inscribed in the image: `rho = 0.5` is `theta = angle`,
 * and the corners (`rho = 0.707`) are outside the cone, where the light's own
 * angular attenuation is already zero. Returned as one value per texel; the
 * caller decides the texture format.
 */
export function iesSpotMapField(
  profile: IesProfile,
  size: number,
  cutoffDeg: number = iesCutoffDeg(profile),
): Float32Array {
  const field = new Float32Array(size * size)
  const tanCutoff = Math.tan((cutoffDeg * Math.PI) / 180)
  for (let j = 0; j < size; j++) {
    const v = (j + 0.5) / size - 0.5
    for (let i = 0; i < size; i++) {
      const u = (i + 0.5) / size - 0.5
      const rho = Math.hypot(u, v)
      const deg = (Math.atan(2 * rho * tanCutoff) * 180) / Math.PI
      field[j * size + i] = iesRelativeOutputAt(profile, deg)
    }
  }
  return field
}
