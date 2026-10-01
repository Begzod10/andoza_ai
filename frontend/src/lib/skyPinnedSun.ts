/**
 * Pinning the studio's sun to the sky photograph, and hiding the clock that
 * used to aim it.
 *
 * Both switches in this file are TEMPORARY and both are the user's, from
 * 2026-10-02: "find hdri light source point and place sun to that point and
 * hide sunlight direction according to time button temporarily".
 *
 * The background and environment of the 3D studio is now a single photograph —
 * Poly Haven's "Qwantani Moonrise (pure sky)", see `moonriseSky.ts` — and a
 * photograph's light source does not move. The directional light was still
 * being aimed by the time-of-day clock, so the user was looking at a sky whose
 * glow sat on one side of the frame and a pool of sunlight that came in through
 * a window on the other. `skyLightSource.ts` measures where the glow actually
 * is; this file is where that measurement is allowed to override the clock, and
 * it is the only place in the app that does so.
 *
 * ── How to put it back ──────────────────────────────────────────────────────
 *
 * Set `PIN_SUN_TO_SKY` to false. That is the whole revert: `skyPinnedSun`
 * becomes the identity function, `SHOW_SUN_CLOCK` becomes true and the clock
 * reappears in the ⋮ menu. Nothing was deleted to make this work — the
 * astronomy in `sunPosition.ts`, the `sunHour` state and its setter in
 * `store/slices/uiSlice.ts`, and the slider's own markup in
 * `three-d/ToolsDrawerPanel.tsx` are all still there and still live, and the
 * clock keeps driving the sun's strength and colour even now (see below). The
 * walkthrough and the shared-room view are untouched: they show different
 * skies, so their suns still follow the clock and must keep doing so.
 *
 * ── What is pinned, and what deliberately is not ─────────────────────────────
 *
 * Only `direction` and `position`, which is to say only the geometry — where
 * the beam comes from and therefore which way the shadows fall. `altitude`,
 * `azimuth`, `intensity`, `color` and `isUp` are left exactly as the clock
 * computed them, and the reason is that they are not geometry, they are mood:
 * `SceneLighting` feeds `altitude` to the hemisphere fill's daylight ramp and
 * hands `intensity` and `color` straight to the light, and the user set
 * `SUN_INTENSITY` to 1.5 by hand the same day. Pinning those too would quietly
 * re-expose the whole room, which is not what was asked for and not something
 * to do behind a flag named after a direction.
 *
 * ── Why the whole sun is pinned, not only its direction ─────────────────────
 *
 * The first pass here replaced `direction` alone and left `altitude`, `isUp`,
 * `intensity` and `color` to the clock. That could not survive its own first
 * night: `isUp` is false between dusk and dawn, a directional light that is not
 * up contributes nothing, and the clock that could have been wound round to
 * daylight is now hidden. `sunHour` starts at the wall-clock hour (`uiSlice`),
 * so opening the studio at three in the morning would have given a room with no
 * sun in it at all and no control to bring one back — the exact opposite of
 * what was asked for, and it would have read as the pin having broken the sun
 * rather than aimed it.
 *
 * A photograph is one moment. Pinning the sun to it means the scene stands at
 * that moment too, so the whole `SunState` comes from the measurement: the
 * altitude the moon actually has, `isUp` true because it plainly is, and a beam
 * reddened and dimmed by the air at that altitude through `sunBeamAt` — the
 * same air-mass maths the clock's own sun crosses, called rather than copied so
 * there is one answer to the question.
 *
 * What that costs, stated plainly: the studio's sun no longer changes through
 * the day at all. It cannot, while it is nailed to a fixed photograph; that is
 * the trade the pin IS. The clock keeps running for everything else — the
 * walkthrough and the shared-room view still have their own moving suns.
 *
 * 13.8 degrees is a LOW sun, and a low sun is a dim, raking one: the air takes
 * about 44 per cent of the beam, and the floor meets it at a glancing angle, so
 * its pool falls far across the room rather than under the sill. That is what
 * the photograph shows, so that is what the room gets. If the user wants it
 * stronger, `SUN_INTENSITY` in `SceneEnvironment.tsx` is the peak this is a
 * fraction of.
 */
import { sunBeamAt, type SunState } from './sunPosition'
import { MOONRISE_LIGHT_SOURCE } from './skyLightSource'

/**
 * Whether the studio's sun is aimed at the sky's own light source instead of
 * by the clock. TEMPORARY — see the header for the one-line revert.
 */
export const PIN_SUN_TO_SKY = true

/**
 * Whether the ⋮ menu shows the "Vaqt" sun-clock slider.
 *
 * Derived from the pin rather than set on its own, because the two are the same
 * decision: a slider that swings the sun around is meaningless while the sun is
 * nailed to a photograph, and the moment the pin comes off the slider has to
 * come back or the sun is stuck wherever the page happened to open. Read by
 * `three-d/ToolsDrawerPanel.tsx`, which is the only place the control exists.
 */
export const SHOW_SUN_CLOCK = !PIN_SUN_TO_SKY

/** The direction the moon in the studio's sky stands in, as a unit vector. */
export const SKY_SUN_DIRECTION = MOONRISE_LIGHT_SOURCE.direction

/** How far above the horizon it stands. Low — see the header. */
export const SKY_SUN_ALTITUDE_DEG = MOONRISE_LIGHT_SOURCE.altitudeDeg

/**
 * The sun as the sky photograph has it.
 *
 * `peakIntensity` is the strength the beam would have with the sun overhead —
 * `SUN_INTENSITY`, the number the user sets — and the air at this altitude
 * takes its cut from there, so raising that one knob still does what it says.
 *
 * `position` is kept consistent with the new direction at the distance the
 * clock's sun used it — it is only ever a direction to a `directionalLight`,
 * and `SceneLighting` rescales it to its own distance anyway, but leaving a
 * stale position behind would be a trap for the next reader.
 *
 * `azimuth` is left as the clock computed it. The sky is a photograph and has
 * no compass — see the last section of the header — so there is no honest
 * bearing to put there, and inventing one would be inventing a fact about the
 * world the picture was taken in.
 */
export function skyPinnedSun(sun: SunState, peakIntensity: number): SunState {
  if (!PIN_SUN_TO_SKY) return sun
  const [x, y, z] = SKY_SUN_DIRECTION
  const distance = Math.hypot(...sun.position) || 1
  const { intensity, color } = sunBeamAt(SKY_SUN_ALTITUDE_DEG, peakIntensity)
  return {
    ...sun,
    altitude: SKY_SUN_ALTITUDE_DEG,
    direction: [x, y, z],
    position: [x * distance, y * distance, z * distance],
    // The moon in the picture is up, whatever the hour is here.
    isUp: true,
    intensity,
    color,
  }
}
