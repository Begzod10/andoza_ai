import * as THREE from 'three'

/**
 * Photo-real plaster (suvoq) PBR maps, served from our own public/ folder so
 * no CDN is involved at runtime.
 *
 * The active material is whatever 4 files sit in public/textures/plaster/
 * under the GENERIC names below — to swap the look (e.g. a different Poly
 * Haven asset), just replace those files; no code change needed:
 *   diff.jpg    — albedo/diffuse
 *   nor_gl.jpg  — normal map (OpenGL convention)
 *   rough.jpg   — roughness
 *   ao.jpg      — ambient occlusion
 *
 * The maps are loaded exactly once per session (module singleton). Per-wall
 * repeat/offset is applied on cheap texture clones that share the underlying
 * image, so memory cost stays flat no matter how many wall segments render.
 */

const BASE = '/textures/plaster'

/** Physical size (metres) one tile of the texture covers on a wall. */
export const PLASTER_TILE_M = 1.5

export interface PlasterMaps {
  map: THREE.Texture
  normalMap: THREE.Texture
  roughnessMap: THREE.Texture
  aoMap: THREE.Texture
}

let cached: PlasterMaps | null = null

function configure(tex: THREE.Texture, srgb: boolean): THREE.Texture {
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  tex.anisotropy = 8
  return tex
}

/** Load (once) and return the shared plaster texture set. */
export function getPlasterMaps(): PlasterMaps {
  if (cached) return cached
  const loader = new THREE.TextureLoader()
  const map = configure(loader.load(`${BASE}/diff.jpg`), true)
  const normalMap = configure(loader.load(`${BASE}/nor_gl.jpg`), false)
  const roughnessMap = configure(loader.load(`${BASE}/rough.jpg`), false)
  const aoMap = configure(loader.load(`${BASE}/ao.jpg`), false)
  // Sample AO from the primary uv set — wall planes have no uv2 (three r152+:
  // aoMap reads channel 1 by default, channel 0 is the regular uv attribute).
  aoMap.channel = 0
  cached = { map, normalMap, roughnessMap, aoMap }
  return cached
}

/**
 * Clone the shared maps with repeat/offset for one wall segment so the
 * pattern is world-anchored: it continues seamlessly across the cuts that
 * doors/windows make in a wall.
 *
 * @param widthM   segment width in metres
 * @param heightM  segment height in metres
 * @param startXm  segment's horizontal start within the whole wall (metres)
 * @param startYm  segment's bottom edge height (metres)
 */
export function clonePlasterMapsFor(
  widthM: number,
  heightM: number,
  startXm: number,
  startYm: number,
): PlasterMaps {
  const shared = getPlasterMaps()
  const uRepeat = widthM / PLASTER_TILE_M
  const vRepeat = heightM / PLASTER_TILE_M
  const uOffset = (((startXm / PLASTER_TILE_M) % 1) + 1) % 1
  const vOffset = (((startYm / PLASTER_TILE_M) % 1) + 1) % 1

  const cloneOne = (tex: THREE.Texture): THREE.Texture => {
    const t = tex.clone()
    t.repeat.set(uRepeat, vRepeat)
    t.offset.set(uOffset, vOffset)
    t.needsUpdate = true
    return t
  }

  return {
    map: cloneOne(shared.map),
    normalMap: cloneOne(shared.normalMap),
    roughnessMap: cloneOne(shared.roughnessMap),
    aoMap: cloneOne(shared.aoMap),
  }
}

/** Shared, immutable normal scale — avoids allocating a Vector2 per render. */
export const PLASTER_NORMAL_SCALE = new THREE.Vector2(1, 1)
