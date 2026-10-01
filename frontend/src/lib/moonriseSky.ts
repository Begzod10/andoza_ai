/**
 * Exposure for the Qwantani Moonrise sky — how hard the photo is allowed to
 * push on the backdrop, and how hard on the room.
 *
 * The user handed us `qwantani_moonrise_puresky_1k.exr` and asked for it as the
 * scene's background atmosphere. The naive wiring — drop it into
 * `scene.background` and `scene.environment` at intensity 1 — gets both jobs
 * wrong, and not in the direction anybody expects from the words "night sky".
 *
 * It was measured, not guessed. Decoding the file with the same EXRLoader the
 * browser will use (three-stdlib's, via drei's <Environment>) and taking
 * solid-angle-weighted means over the sphere gives the numbers in
 * `MOONRISE_SKY` below. Two of them decide everything here:
 *
 *   - Above the horizon the sky averages 1.78 in linear radiance. That is 3.5x
 *     the `urban_street_04_2k.hdr` sky this studio used to show and 1.5x the
 *     daylight `kloofendal_partly_cloudy.hdr`. Poly Haven does not normalise
 *     exposure, and this particular file is stored hot. At intensity 1, ACES at
 *     the studio's 1.15 exposure tone-maps its zenith to sRGB 97,130,169 and
 *     its horizon to 237,237,236 — a bright overcast afternoon, and brighter
 *     than the #FFFFFF backdrop it replaces, which tone-maps to 230,230,230.
 *     The user would not recognise it as the file they gave us.
 *
 *   - The moon's disc peaks at ~91,000. That is the thing the room must not be
 *     allowed to see through its own ceiling. The complaint this studio already
 *     has on record — glossy tiles "reflecting the big light from outside" —
 *     came from exactly that geometry, because three.js has no notion of being
 *     indoors and an environment map lights every surface as if the roof were
 *     not there. The ShadowShell stops the *directional* sun at the walls; it
 *     cannot stop an environment map, so the only lever is the intensity.
 *
 * Hence the split: one scale for the backdrop, a much smaller one for the
 * image-based lighting. See `MOONRISE_BACKGROUND_INTENSITY` and
 * `moonriseEnvironmentIntensity` for how each was chosen.
 *
 * Nothing here is coupled to the sun clock, deliberately. `skyEnvironment.ts`
 * explains at length why a photographic HDRI and a moving solar position fight
 * each other; a moonrise photo brightened on a noon curve does not become
 * daytime, it just washes out. The time of day keeps being told by the
 * directional sun, the hemisphere fill and the room's own lamps, which is where
 * it belongs.
 */

/** Linear RGB, in the renderer's working colour space. */
export type LinearRgb = readonly [number, number, number]

/**
 * Radiance statistics of one equirectangular sky, all in linear units.
 *
 * Measured offline rather than at runtime: parsing a 5 MB EXR to average it
 * would cost the user a second of main thread on every studio open, to arrive
 * at numbers that only change when somebody swaps the file. If the file is
 * replaced, re-measure — decode it with three-stdlib's EXRLoader at
 * `FloatType`, remember that the loader reverses scanlines (so data row 0 is
 * the nadir), and weight each row by cos(altitude) when averaging, or the poles
 * will count for far more sphere than they cover.
 */
export interface SkyRadiance {
  /** Solid-angle-weighted mean luminance over the whole sphere. */
  readonly meanRadiance: number
  /** The same, above the horizon only — the half seen through a window. */
  readonly skyMeanRadiance: number
  /** Mean linear RGB of the band within 1.5 degrees of the horizon. */
  readonly horizonRadiance: LinearRgb
  /** Mean linear RGB of the band within 1.5 degrees of straight up. */
  readonly zenithRadiance: LinearRgb
  /** Brightest single pixel's luminance — for this file, the moon's disc. */
  readonly peakRadiance: number
}

/** `public/hdri/qwantani_moonrise_puresky_1k.exr`, as measured 2026-10-02. */
export const MOONRISE_SKY: SkyRadiance = {
  meanRadiance: 1.083,
  skyMeanRadiance: 1.782,
  horizonRadiance: [1.324, 1.346, 1.275],
  zenithRadiance: [0.095, 0.162, 0.289],
  peakRadiance: 91250,
}

/**
 * The studio canvas's `toneMappingExposure`.
 *
 * Exported so `ThreeDCanvasScene` can read it instead of repeating the literal:
 * every judgement in this file about what the sky will look like on screen runs
 * through ACES at this exposure, so the two drifting apart would quietly
 * invalidate all of it.
 */
export const STUDIO_TONE_MAPPING_EXPOSURE = 1.15

/**
 * three's ACESFilmicToneMapping, in TypeScript.
 *
 * This is the same arithmetic as `tonemapping_pars_fragment.glsl` — the input
 * and output matrices, the RRT/ODT rational fit, the 0.6 pre-divide and the
 * final saturate. It is here because there is no WebGL in CI and no GPU in the
 * environment this sky was tuned in: without it, "the zenith reads as a dark
 * navy and the horizon keeps its moonglow" is an opinion, and with it the tests
 * in `__tests__/moonriseSky.test.ts` can assert it.
 */
export function acesFilmicToneMap(
  rgb: LinearRgb,
  exposure = STUDIO_TONE_MAPPING_EXPOSURE,
): [number, number, number] {
  const input: LinearRgb[] = [
    [0.59719, 0.35458, 0.04823],
    [0.076, 0.90834, 0.01566],
    [0.0284, 0.13383, 0.83777],
  ]
  const output: LinearRgb[] = [
    [1.60475, -0.53108, -0.07367],
    [-0.10208, 1.10813, -0.00605],
    [-0.00327, -0.07276, 1.07602],
  ]
  const apply = (m: LinearRgb[], v: LinearRgb): [number, number, number] => [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ]
  const fit = (v: [number, number, number]): [number, number, number] =>
    v.map((x) => (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.432951) + 0.238081)) as [
      number,
      number,
      number,
    ]

  const scaled: LinearRgb = [
    (rgb[0] * exposure) / 0.6,
    (rgb[1] * exposure) / 0.6,
    (rgb[2] * exposure) / 0.6,
  ]
  return apply(output, fit(apply(input, scaled))).map((x) =>
    x < 0 ? 0 : x > 1 ? 1 : x,
  ) as [number, number, number]
}

// ─── sRGB transfer function ───────────────────────────────────────────────────
// Both directions are needed, and for opposite reasons. `linearToSrgbHex`
// writes a colour three will hand back to the shader; `srgbHexToLinear` is what
// three itself does to every hex it is given (Color.setStyle ->
// ColorManagement.toWorkingColorSpace), and the fog's correctness argument is a
// round trip through both.

function encode(channel: number): number {
  const c = channel < 0 ? 0 : channel > 1 ? 1 : channel
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}

function decode(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
}

/** Linear RGB to a `#rrggbb` string, clamped — a hex cannot carry radiance > 1. */
export function linearToSrgbHex(rgb: LinearRgb): string {
  const hex = (v: number) =>
    Math.round(encode(v) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${hex(rgb[0])}${hex(rgb[1])}${hex(rgb[2])}`
}

/** A `#rrggbb` string back to linear RGB, the way three reads a fog colour. */
export function srgbHexToLinear(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [decode(((n >> 16) & 255) / 255), decode(((n >> 8) & 255) / 255), decode((n & 255) / 255)]
}

// ─── The two intensities ──────────────────────────────────────────────────────

/**
 * What the removed sky contributed as image-based lighting at night, and at
 * noon.
 *
 * `BrandedSky` used to light the studio with `urban_street_04_2k.hdr` — mean
 * radiance 0.504 — scaled by `skyIntensity(sun)`, which runs 0.08 at night to
 * 0.70 at midday. So the environment's diffuse contribution swung between
 * these two numbers, and the upper one is the setting the user was looking at
 * when they reported the blown tiles.
 */
export const REMOVED_SKY_NIGHT_RADIANCE = 0.504 * 0.08
export const REMOVED_SKY_NOON_RADIANCE = 0.504 * 0.7

/**
 * How much image-based lighting the room is allowed, as a mean radiance.
 *
 * Pinned to the quietest setting the studio ever shipped rather than to a new
 * number of our own: the night end of the old sky's curve. The daylight end of
 * that same curve is what produced the complaint, so anything at or below its
 * night end is a setting the user has already lived with without objecting.
 *
 * It is also small enough not to repeat the *other* mistake on record. When the
 * backdrop went white, a first attempt installed the white as a uniform
 * environment map and the user said nothing was visible against it — a flat
 * environment adds a constant term to every surface and takes the contrast
 * away. At this budget the environment's diffuse term on plaster is under half
 * a percent of what the `ambientLight intensity={1.0}` fill already delivers,
 * so it cannot flatten anything.
 *
 * Which raises the fair question of why keep an environment map at all. Because
 * diffuse is not the job. The environment's visible contribution here is
 * specular: the horizon glow and the moon itself, picked up as a sheen on tile,
 * parquet and glass that no analytic light can stand in for, because the
 * specular term samples the map's peak (91,000) and not its mean.
 */
export const ENV_RADIANCE_BUDGET = REMOVED_SKY_NIGHT_RADIANCE

/**
 * The `environmentIntensity` that spends exactly that budget on a given sky.
 *
 * Trivial arithmetic, but it is the arithmetic that stops a file swap from
 * silently changing how hard the sky lights the room: a replacement HDRI stored
 * twice as hot gets half the intensity, with no number here to remember to edit.
 */
export function moonriseEnvironmentIntensity(
  sky: SkyRadiance = MOONRISE_SKY,
  budget = ENV_RADIANCE_BUDGET,
): number {
  return budget / sky.meanRadiance
}

/** `environmentIntensity` for the shipped file — about 0.037. */
export const MOONRISE_ENVIRONMENT_INTENSITY = moonriseEnvironmentIntensity()

/**
 * The `backgroundIntensity` the sky is drawn at.
 *
 * Chosen by walking the value down and reading the tone-mapped result, which is
 * what the tests now pin:
 *
 *   intensity   zenith (sRGB)   horizon glow (sRGB)
 *   1.00        97,130,169      237,237,236   bright overcast afternoon
 *   0.40        45,69,102       207,208,205   blue hour
 *   0.22        25,42,65        172,173,170   moonrise
 *   0.10        9,19,33         115,116,113   nearly black overhead
 *
 * 0.22 is bracketed from both sides by things already in this scene. Above it,
 * at 0.40, the horizon glow is at 207 and closing on the ceiling — #FFFFFF
 * itself only tone-maps to 230 — so the moon's halo starts clipping and the
 * whole thing reads as blue hour, not night. Below it, at 0.10, the zenith is
 * at 9,19,33, within a few counts of what the studio's lights-off backdrop
 * (#14171F) tone-maps to on screen (6,8,15): indistinguishable from having no
 * sky at all, which throws away the atmosphere the user asked for. At 0.22 the
 * zenith is a deep navy that is still plainly blue rather than black, and the
 * moon's glow along the horizon reaches 172 — a sky with a light source in it,
 * and still bright enough along the horizon for the room's near-white walls to
 * keep the silhouette they were in danger of losing against #FFFFFF.
 *
 * Separate from the environment intensity on purpose, and ~6x larger. They are
 * answering different questions: this one is "does the picture outside the
 * window look like the picture I gave you", the other is "how much does the
 * outdoors light a room it should not be able to reach". Tying them together is
 * how you end up either with a washed-out sky or with the moon reflected off
 * the floor tiles.
 */
export const MOONRISE_BACKGROUND_INTENSITY = 0.22

/**
 * The fog colour that matches a sky drawn at a given background intensity.
 *
 * Fog is mixed into the fragment in linear space and then tone-mapped along
 * with everything else, so fog and backdrop agree on screen exactly when their
 * *linear* values agree — which makes this the horizon band's radiance, scaled
 * by the same intensity the backdrop is drawn at, encoded to the hex three
 * wants. No eyeballing involved, and the match is exact rather than close.
 *
 * It has to be derived and not written down. The white backdrop left a note
 * saying that if its colour ever changed, "the fog follows it" — a manual step
 * nobody would have remembered. Swapping a white fog under this sky would have
 * hung a bright grey veil across a night room, which is the same bug
 * `skyFogColor` was written to prevent for the drawn sky.
 */
export function moonriseFogColor(
  sky: SkyRadiance = MOONRISE_SKY,
  intensity = MOONRISE_BACKGROUND_INTENSITY,
): string {
  const [r, g, b] = sky.horizonRadiance
  return linearToSrgbHex([r * intensity, g * intensity, b * intensity])
}

/** Fog for the shipped file at the shipped intensity. */
export const MOONRISE_FOG_COLOR = moonriseFogColor()
