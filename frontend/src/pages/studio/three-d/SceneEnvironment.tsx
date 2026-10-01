import { EffectComposer, N8AO, SMAA } from "@react-three/postprocessing";
import type { SunState } from "@/lib/sunPosition";
import { skyIntensity } from "@/lib/skyEnvironment";
import { fitShadowFrustum } from "@/lib/shadowFrustum";
import { SafeEnvironment } from "@/components/studio/SafeEnvironment";
import { MOONRISE_HDRI } from "@/lib/hdri";
import {
  MOONRISE_BACKGROUND_INTENSITY,
  MOONRISE_ENVIRONMENT_INTENSITY,
  MOONRISE_FOG_COLOR,
} from "@/lib/moonriseSky";

/** User-supplied HDRI (8K EXR downsized to 2048x1024 .hdr) used as the
 *  studio's sky + image-based lighting. Regenerate from a new source with
 *  Blender (load EXR, image.scale(2048,1024), save as .hdr) into public/hdri/. */
const STUDIO_HDRI = "/hdri/urban_street_04_2k.hdr";

/**
 * Scene-wide environment: postprocessing (AO/AA), the generated sky (used
 * as both backdrop and image-based lighting), and the sun/ambient light
 * rig. Split out of ThreeDPage.tsx — see that file's header comment for the
 * full picture.
 */

// ─── Postprocessing — N8AO ambient occlusion + SMAA anti-alias ───────────────
// Mounted only when highQuality3d && declineCount < 2.
// drei Html overlays (SwapButtons, drag handles) are DOM portals — unaffected
// by the WebGL composer.
export function RealismEffects({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  return (
    <EffectComposer multisampling={0}>
      {/* intensity was 1.1 — measured (canvas.getImageData, not eyeballed)
          as the actual dominant factor keeping walls dark at low light,
          independent of and fighting every scene-light change above. 0.35
          keeps AO as a subtle corner/crease depth cue without crushing
          whole flat walls toward black at night. */}
      <N8AO
        halfRes
        aoRadius={0.35}
        intensity={0.35}
        distanceFalloff={0.5}
        quality="performance"
        depthAwareUpsampling
      />
      <SMAA />
    </EffectComposer>
  );
}


/**
 * Installs the chosen HDRI as both the view out of the window (background) and
 * the room's image-based lighting, via the crash-safe SafeEnvironment wrapper
 * (error boundary + Suspense + drei <Environment>).
 *
 * The environment intensity still tracks the sun's daylight curve, so
 * reflections dim at night alongside the analytic light rig below.
 */
export function BrandedSky({ sun }: { sun: SunState }) {
  return <SafeEnvironment files={STUDIO_HDRI} background intensity={skyIntensity(sun)} />
}


/**
 * The moonrise sky, in place of the flat white backdrop.
 *
 * The user supplied `qwantani_moonrise_puresky_1k.exr` and asked for it as the
 * scene's background atmosphere, so it is both: the view out of the window
 * (`scene.background`) and the room's image-based lighting
 * (`scene.environment`). The two are drawn from the same file at very
 * different exposures, which is the only reason this component is more than a
 * one-liner — `lib/moonriseSky.ts` carries the measurements and the argument
 * for each number, and is the file to read before touching either.
 *
 * The short version of why they differ: the file is stored hot enough to
 * tone-map to a bright overcast afternoon at intensity 1, so the backdrop is
 * drawn at 0.22 to look like the moonrise it is; and an environment map bright
 * enough to be a believable sky would hand every glossy surface indoors a view
 * of the moon, because three.js has no notion of being indoors and an
 * environment map lights every surface as if the roof were not there. That is
 * precisely the bug already on record here — glossy tiles reflecting the big
 * light from outside — and the ShadowShell cannot help, since all it can stop
 * is the directional sun. So the lighting half runs at ~0.037, the quietest
 * setting this studio has ever shipped a sky at.
 *
 * What still lights the room is the rig below: the ambient and hemisphere
 * fills, the directional sun the shadow shell confines to the windows, and the
 * lamps hanging in the room. The sky's contribution to diffuse is under half a
 * percent of the ambient fill, deliberately — a near-uniform environment term
 * only flattens contrast, which is the lesson from the attempt that made the
 * white backdrop a white *environment* and left the user saying nothing was
 * visible. What the sky is actually here for is specular: the moon and the
 * horizon glow picked up as a sheen on tile, parquet and glass, which the
 * specular term can see because it samples the map's peak rather than its mean.
 *
 * The flat colour underneath is not a leftover of the white backdrop. It is
 * what stands in for the sky while a 5 MB EXR is still in flight — and if the
 * decode fails outright, since SafeEnvironment's error boundary then renders
 * nothing — so the room never appears against an unset background. It is the
 * fog colour on purpose: fog and backdrop are derived from the same horizon
 * radiance, so the stand-in cannot read as a halo around the room.
 *
 * `scene.environment` is no longer cleared by hand here. drei's <Environment>
 * owns it while mounted and restores whatever it found on unmount, which
 * covers the leftover-sky bug the manual clear was written for.
 */
export function MoonriseSky() {
  return (
    <>
      <color attach="background" args={[MOONRISE_FOG_COLOR]} />
      <SafeEnvironment
        files={MOONRISE_HDRI}
        background
        intensity={MOONRISE_ENVIRONMENT_INTENSITY}
        backgroundIntensity={MOONRISE_BACKGROUND_INTENSITY}
      />
    </>
  )
}


// ─── Lighting ─────────────────────────────────────────────────────────────────

/**
 * The sun, as the user specified it (2026-10-02): intensity 1.5, size 15.
 *
 * Raised from the 0.5 they first asked for, on the same day and at their
 * request: with the white backdrop replaced by a night sky that deliberately
 * contributes almost no ambient light (see lib/moonriseSky.ts), 0.5 of sun was
 * the only daylight left in the room and it was not enough.
 *
 * The intensity is a PEAK — the beam thins as it crosses more air through the
 * day and goes out at night, so this is the strength at its highest, not a
 * number the sun is pinned to.
 *
 * The size is the sun's apparent width in the sky, which is the whole reason a
 * shadow's edge is soft rather than a cut line: a bigger disc spreads the
 * penumbra. three's directional light has no disc, so size lands on the shadow
 * blur, which is the same picture from the other end.
 */
export const SUN_INTENSITY = 1.5
export const SUN_SIZE = 15


export function SceneLighting({
  width, depth, height, highQuality, sun,
}: {
  width: number; depth: number; height: number; highQuality: boolean
  /**
   * Where the sun actually stands, from `sunPosition`. Omit it and the light
   * falls back to the fixed studio key — which is what the elektr preview and
   * the walkthrough still want, since neither offers a clock to set.
   */
  sun?: SunState
}) {
  // No layer juggling here on purpose. Enabling a layer on `shadow.camera`
  // looks like it should let the shadow map see objects the view camera hides,
  // and does nothing at all: three culls shadow casters against the *view*
  // camera's layers (WebGLShadowMap's renderObject tests
  // `object.layers.test(camera.layers)` with the camera it was handed, which is
  // the one you are looking through). Hiding a caster is done at the material
  // instead — see the ceiling in RoomScene.

  const mapSize = highQuality ? 2048 : 1024

  // Far enough out that a low sun still clears the room instead of standing
  // inside its own shadow frustum.
  const dist = Math.max(width, depth, height) * 1.6 + 4
  const position: [number, number, number] = sun
    ? [sun.direction[0] * dist, sun.direction[1] * dist, sun.direction[2] * dist]
    : [width * 0.3, height * 1.8, depth * 0.3]

  // Fit the shadow frustum to the room as the sun actually sees it.
  //
  // These bounds are in the LIGHT's view space, not the world's, so a fixed box
  // around the plan is only ever right for a sun straight overhead. As the sun
  // drops, the room's silhouette from up there grows tall and slides sideways,
  // and whatever falls outside the frustum samples as having no occluder at
  // all — which is how a closed ceiling ended up with a hard-edged wedge of
  // sunlight lying across the walls beneath it.
  //
  // Projecting the room's eight corners onto the light's own axes costs
  // nothing and is right from every direction.
  const shadowBox = fitShadowFrustum(position, width, height, depth)

  // Sky bounce follows the sun down. Without this the room keeps a full midday
  // fill under an orange dusk key, which reads as a colour bug rather than as
  // evening. The floor keeps a night/late-hour room legible while editing —
  // raised from 0.18 after users reported walls reading as unreadably dark
  // at hours like 23:20 while actively painting in Bo'yoq/Oboi.
  const daylight = sun
    ? Math.max(0.55, Math.pow(Math.sin(Math.max(sun.altitude, 0) * (Math.PI / 180)), 0.6))
    : 1

  return (
    <>
      {/* Warm low-angle directional "sun" for form-shading and realistic shadows */}
      <directionalLight
        color={sun ? sun.color : "#FFF3DE"}
        intensity={sun ? sun.intensity : SUN_INTENSITY}
        position={position}
        // A set sun contributes nothing, so its shadow map is pure cost.
        castShadow={sun ? sun.isUp : true}
        shadow-mapSize={[mapSize, mapSize]}
        shadow-camera-left={-shadowBox.hw}
        shadow-camera-right={shadowBox.hw}
        shadow-camera-top={shadowBox.hh}
        shadow-camera-bottom={-shadowBox.hh}
        shadow-camera-near={shadowBox.near}
        shadow-camera-far={shadowBox.far}
        // Small on purpose. The 2 cm normalBias these used to be was sized to
        // hide acne on zero-thickness walls, and pushed samples clean through
        // them at corners — the leak itself. The ShadowShell is 12 cm thick,
        // so a 1 cm offset lands well inside it and there is nothing to hide.
        shadow-bias={-0.0002}
        shadow-normalBias={0.01}
        // The sun's size, as a penumbra — see SUN_SIZE.
        shadow-radius={SUN_SIZE}
      />
      {/* Cool sky-bounce fill light — scaled by daylight for time-of-day mood,
          on top of the flat floor below (so evening still looks like evening,
          it just never goes unreadable) */}
      <hemisphereLight color="#DCE8FF" groundColor="#CFC6B4" intensity={0.35 * daylight} />
      {/* Flat visibility floor, deliberately NOT scaled by daylight/sun angle:
          a wall facing away from the single directional "sun" used to fall
          back on 0.18*daylight alone and could read as near-black, which
          looked like a broken material rather than "just unlit". Selection
          is communicated by the emissive highlight on the wall itself (see
          isSelected below), not by dimming everything that isn't selected —
          so this can stay generous without fighting that signal.
          ACES tone mapping compresses shadows/midtones hard enough that
          0.42, then 0.62, both measured (via canvas.getImageData, not just
          eyeballing a screenshot) as barely different — RGB ~54/255 on the
          unlit plaster wall at 23:xx, well below "clearly legible". 1.0 is
          the value that actually moved that reading into a readable range. */}
      <ambientLight color="#FFFFFF" intensity={1.0} />
    </>
  );
}
