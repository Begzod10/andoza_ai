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

/**
 * Clones made via `tex.clone()` before `tex.image` exists (the network
 * request — or its 404 fallback — hasn't resolved yet) capture an empty
 * image and never hear about it later: `clone()` takes a one-time snapshot,
 * it does not stay linked to its source. Left unhandled, such a clone keeps
 * `needsUpdate` set with no image behind it, which is exactly what
 * "THREE.WebGLRenderer: Texture marked for update but no image data found"
 * flags — and the wall it's on renders with no map data, permanently.
 * Every wall mounted before the singleton maps finish loading hit this on a
 * fresh page load, since `cached` starts null on every reload and wall
 * meshes clone synchronously on mount, well before the async load settles.
 *
 * Clones made while a source isn't ready yet register themselves here and
 * get patched with the real image the moment that source resolves
 * (success or fallback) instead of staying blank forever.
 */
const pendingClones = new Map<THREE.Texture, Set<THREE.Texture>>()

function resolveSource(source: THREE.Texture): void {
  const waiters = pendingClones.get(source)
  if (!waiters) return
  for (const clone of waiters) {
    clone.image = source.image
    clone.needsUpdate = true
  }
  pendingClones.delete(source)
}

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
    () => resolveSource(tex),
    undefined,
    () => {
      console.warn(
        `[plaster] ${BASE}/${name}.jpg topilmadi — tekis rangga o'tildi. ` +
        `Haqiqiy teksturani shu nom bilan public/textures/plaster/ ichiga qo'ying.`,
      )
      tex.image = solidTexture(FALLBACK_FILL[name])
      tex.needsUpdate = true
      resolveSource(tex)
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
    if (tex.image) {
      // Source already resolved (this session's cache, or a slow-mounting
      // wall that lost the race) — safe to upload right away.
      t.needsUpdate = true
    } else {
      // Source still in flight: flagging needsUpdate now would just be the
      // "no image data found" warning, and this clone would never get a
      // second chance to pick up the real pixels. Wait for resolveSource().
      let waiters = pendingClones.get(tex)
      if (!waiters) pendingClones.set(tex, (waiters = new Set()))
      waiters.add(t)
    }
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
