import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { EffectComposer, N8AO, SMAA } from "@react-three/postprocessing";
import type { SunState } from "@/lib/sunPosition";
import { createSkyTexture, skyIntensity } from "@/lib/skyEnvironment";
import { fitShadowFrustum } from "@/lib/shadowFrustum";

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
 * Installs the generated sky as both the view out of the window and the room's
 * image-based lighting.
 *
 * Both, from one texture, on purpose: a sky that is dark in the window while
 * still filling the room with midday bounce is the mismatch this whole thing
 * exists to remove.
 */
export function BrandedSky({ sun }: { sun: SunState }) {
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)
  const texture = useMemo(() => createSkyTexture(sun), [sun])

  useEffect(() => {
    const prevBg = scene.background
    const prevEnv = scene.environment
    scene.background = texture
    scene.environment = texture
    scene.environmentIntensity = skyIntensity(sun)
    invalidate()
    return () => {
      if (scene.background === texture) scene.background = prevBg
      if (scene.environment === texture) scene.environment = prevEnv
      texture.dispose()
    }
  }, [scene, texture, sun, invalidate])

  return null
}


// ─── Lighting ─────────────────────────────────────────────────────────────────


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
        intensity={sun ? sun.intensity : highQuality ? 1.3 : 1.0}
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
        shadow-radius={4}
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
