/**
 * Imported models, reduced to colour.
 *
 * An interior studio loads furniture from wherever the user got it — 3ds Max
 * exports, asset-pack GLBs, a scan someone converted twice. Their PBR setups
 * are written for other renderers and arrive half-broken: a normal map bound
 * into the roughness slot, a metalness of 1 because glTF's `metallicFactor`
 * *defaults* to 1 and the exporter never wrote one, an environment map baked
 * for a studio that is not this one. Under an HDRI a fully metallic surface
 * mirrors the sky, so a chair with a perfectly good wood texture renders as a
 * white blob and the texture is never seen.
 *
 * So: keep the diffuse map, throw away every other map, and neutralise the
 * scalars that turn a surface into a mirror. The model loses relief and
 * reflections it probably never had authored correctly, and gains the one
 * thing it is actually for — its colours.
 *
 * Alpha is deliberately kept. It is not a lighting trick: dropping it turns
 * every leaf, curtain and glass panel into a solid slab.
 */
import * as THREE from 'three'

/**
 * Every map slot on Standard/Physical that is not the base colour.
 *
 * Listed by name rather than filtered by type because three keeps adding
 * slots, and a stray one left bound is exactly the kind of thing that shows up
 * as "the model is white" months later.
 */
const NON_COLOR_MAPS = [
  // Surface relief
  'normalMap',
  'bumpMap',
  'displacementMap',
  // Reflection / specular response
  'roughnessMap',
  'metalnessMap',
  'envMap',
  'specularIntensityMap',
  'specularColorMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'iridescenceMap',
  'iridescenceThicknessMap',
  'anisotropyMap',
  // Refraction
  'transmissionMap',
  'thicknessMap',
  // Baked shading — real lighting is the room's job
  'aoMap',
  'lightMap',
] as const

/**
 * A mirror-smooth surface reflects the environment even at zero metalness, and
 * an HDRI is mostly bright sky. Furniture is not a mirror; hold it back.
 */
const MIN_ROUGHNESS = 0.35

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/**
 * A diffuse-only copy of one material. Always a copy: models share materials
 * across instances, so editing in place would leak one chair's colour override
 * onto every other chair of the same kind.
 *
 * Materials that are not Standard/Physical pass through untouched — by the
 * time furniture reaches a viewport the converter has already promoted
 * Phong/Lambert, and anything else here is a special case that knows better.
 */
export function toDiffuseOnly(m: THREE.Material): THREE.Material {
  if (!(m instanceof THREE.MeshStandardMaterial)) return m

  const c = m.clone()
  // clone() drops the name, and the color-override lookup is keyed on it.
  c.name = m.name

  for (const slot of NON_COLOR_MAPS) {
    if (slot in c) (c as unknown as Record<string, unknown>)[slot] = null
  }

  // Whatever the exporter claimed, this is furniture lit by a room.
  c.metalness = 0
  c.roughness = clamp(m.roughness || 1, MIN_ROUGHNESS, 1)
  c.envMapIntensity = m.map ? 1 : 1.2
  c.displacementScale = 0
  c.aoMapIntensity = 1
  c.lightMapIntensity = 1

  const phys = c as THREE.MeshPhysicalMaterial
  if (phys.isMeshPhysicalMaterial) {
    // Refraction goes, but a glass tabletop must not come back as a slab —
    // carry the transmission across as plain alpha instead of deleting it.
    if (phys.transmission > 0) {
      phys.transparent = true
      phys.opacity = clamp(Math.min(phys.opacity, 1 - phys.transmission * 0.85), 0.05, 1)
      phys.transmission = 0
    }
    phys.clearcoat = 0
    phys.sheen = 0
    phys.iridescence = 0
    phys.specularIntensity = 1
  }

  // A colour map decoded as linear renders washed-out and pale — the same
  // symptom as no texture at all, which makes it worth asserting rather than
  // trusting whichever loader bound it.
  if (c.map && c.map.colorSpace !== THREE.SRGBColorSpace) {
    c.map.colorSpace = THREE.SRGBColorSpace
    c.map.needsUpdate = true
  }

  c.needsUpdate = true
  return c
}

/** `toDiffuseOnly` across a whole loaded model. Preserves per-mesh material
 *  arrays, which multi-material imports rely on to keep their groups aligned. */
export function applyDiffuseOnly(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.material = Array.isArray(child.material)
      ? child.material.map(toDiffuseOnly)
      : toDiffuseOnly(child.material as THREE.Material)
  })
}
