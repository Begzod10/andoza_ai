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

/**
 * Physical size (metres) one tile covers. 1 m keeps the maths obvious and the
 * grain life-size: a 3 × 3 m wall shows exactly 3 × 3 tiles.
 */
export const PLASTER_TILE_M = 1.0

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

/** 1×1 pixel of a flat colour — the stand-in when a map file is missing. */
function solidTexture(css: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = 1
  const ctx = c.getContext('2d')!
  ctx.fillStyle = css
  ctx.fillRect(0, 0, 1, 1)
  return c
}

/**
 * Neutral value each channel falls back to, so a missing file degrades to
 * plain concrete instead of a white/undefined surface:
 * flat grey albedo, flat normal, full roughness, no occlusion.
 */
const FALLBACK_FILL: Record<string, string> = {
  diff: '#7C7E80',
  nor_gl: '#8080ff',
  rough: '#ffffff',
  ao: '#ffffff',
}

/**
 * Load one map. The texture object is returned immediately and filled in when
 * the image arrives; on failure it is filled with its neutral colour instead,
 * which needs no React state — three just re-uploads the new image.
 */
function loadMap(loader: THREE.TextureLoader, name: keyof typeof FALLBACK_FILL, srgb: boolean): THREE.Texture {
  const tex = loader.load(
    `${BASE}/${name}.jpg`,
    undefined,
    undefined,
    () => {
      console.warn(
        `[plaster] ${BASE}/${name}.jpg topilmadi — tekis rangga o'tildi. ` +
        `Haqiqiy teksturani shu nom bilan public/textures/plaster/ ichiga qo'ying.`,
      )
      tex.image = solidTexture(FALLBACK_FILL[name])
      tex.needsUpdate = true
    },
  )
  return configure(tex, srgb)
}

/** Load (once) and return the shared plaster texture set. */
export function getPlasterMaps(): PlasterMaps {
  if (cached) return cached
  const loader = new THREE.TextureLoader()
  const map = loadMap(loader, 'diff', true)
  const normalMap = loadMap(loader, 'nor_gl', false)
  const roughnessMap = loadMap(loader, 'rough', false)
  const aoMap = loadMap(loader, 'ao', false)
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
