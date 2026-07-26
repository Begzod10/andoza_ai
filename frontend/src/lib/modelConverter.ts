import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

export interface ModelInfo {
  sizeM: { w: number; d: number; h: number }
  scale: number
  hasTextures: boolean
  materialCount: number
}

// The picker accepts the model plus its companion files (textures, .bin, .mtl)
export const SUPPORTED_FORMATS =
  '.glb,.gltf,.obj,.fbx,.bin,.mtl,.png,.jpg,.jpeg,.webp,.bmp,.tga,.ktx2'

const MODEL_EXTS = ['glb', 'gltf', 'obj', 'fbx']

function extOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

function extractSceneInfo(root: THREE.Object3D): ModelInfo {
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z) || 1

  // Auto-detect units: mm >1000, cm 10–1000 (a 220-unit bed is a 2.2m bed
  // authored in cm, NOT mm — the old >100→mm rule shrank such models 10×),
  // feet 5–10 (US asset packs), else metres.
  let toM =
    maxDim > 1000 ? 0.001 :
    maxDim > 10 ? 0.01 :
    maxDim >= 5 ? 0.3048 :
    1
  // Safety net: whatever the units, no imported furniture piece may exceed
  // 4m in its largest dimension — the user can always scale UP afterwards
  if (maxDim * toM > 4) toM = 4 / maxDim

  let materialCount = 0
  let hasTextures = false
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const mats = Array.isArray(child.material) ? child.material : [child.material]
    materialCount += mats.length
    for (const m of mats) {
      if (m instanceof THREE.MeshStandardMaterial && m.map) hasTextures = true
      if (m instanceof THREE.MeshBasicMaterial && m.map) hasTextures = true
      if (m instanceof THREE.MeshPhongMaterial && m.map) hasTextures = true
    }
  })

  return {
    sizeM: {
      w: parseFloat((size.x * toM).toFixed(2)),
      h: parseFloat((size.y * toM).toFixed(2)),
      d: parseFloat((size.z * toM).toFixed(2)),
    },
    scale: toM,
    hasTextures,
    materialCount,
  }
}

/**
 * Asset packs often ship a huge backdrop/ground plane with the model (a photo
 * studio cyclorama). Detect and remove them: trivial geometry (a few
 * triangles), essentially flat, and nearly as large as the whole scene.
 * Real furniture parts (mirrors, glass shelves) are far smaller relative to
 * the model or have real thickness/topology.
 */
function stripBackdropPlanes(root: THREE.Object3D): number {
  const rootBox = new THREE.Box3().setFromObject(root)
  const rootSize = rootBox.getSize(new THREE.Vector3())
  const rootMax = Math.max(rootSize.x, rootSize.y, rootSize.z) || 1
  const doomed: THREE.Object3D[] = []
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const box = new THREE.Box3().setFromObject(child)
    const s = box.getSize(new THREE.Vector3())
    const dims = [s.x, s.y, s.z].sort((a, b) => a - b)
    const isFlat = dims[0] < rootMax * 0.03
    const isHuge = dims[2] > rootMax * 0.7
    if (!isFlat || !isHuge) return

    const geo = child.geometry as THREE.BufferGeometry
    const idx = geo.getIndex()
    const triCount = (idx ? idx.count : geo.getAttribute('position')?.count ?? 0) / 3

    // Cloth-sim backdrops are subdivided into thousands of triangles, so a
    // low poly count alone can't be the only signal. A flat, scene-sized
    // sheet ALSO qualifies when it lies at the very bottom of the scene and
    // covers most of its footprint (a ground cloth) — real furniture parts
    // like glass tabletops sit higher and cover less.
    const touchesBottom = box.min.y <= rootBox.min.y + rootSize.y * 0.05
    const coversFootprint = s.x * s.z > rootSize.x * rootSize.z * 0.6

    if (triCount <= 4 || (touchesBottom && coversFootprint)) doomed.push(child)
  })
  for (const m of doomed) m.removeFromParent()
  return doomed.length
}

const IMG_EXT = /\.(png|jpe?g|webp|bmp)$/i
// Extensions a model may REQUEST for a texture — includes formats browsers
// can't decode (.tx/.tif/.tga/.psd are common in 3ds Max/Corona exports).
// Requests for these are texture-like even when no picked file can serve them.
const TEXTURE_REQUEST_EXT = /\.(tx|tiff?|tga|psd|png|jpe?g|webp|bmp)$/i
const DIFFUSE_HINTS = ['diffuse', 'albedo', 'basecolor', 'base_color', 'color', '_col', '_d']

/** Filename without its last extension. */
function stemOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(0, i) : name
}

/** Case/space/underscore-insensitive comparison key: keep only [a-z0-9]. */
function normStem(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Trailing filename of a URL/path, decoded, query stripped, lowercased. */
function urlBasename(url: string): string {
  const raw = url.split(/[\\/]/).pop() ?? ''
  let base = raw
  try {
    base = decodeURIComponent(raw)
  } catch {
    /* malformed escape — use the raw segment */
  }
  return base.split('?')[0].toLowerCase()
}

/**
 * Fuzzy-match a requested texture basename against the picked IMAGE files
 * when the exact basename lookup failed. Cascade, strictest first:
 *  (a) identical stem with a different (picked) image extension
 *      — foo.tx → foo.jpg / foo.png / foo.webp …
 *  (b) case/space/underscore-insensitive stem equality ("Wood Oak-2.tif" ≈
 *      "wood_oak2.jpg")
 *  (c) normalized-stem containment in either direction
 * `imageKeys` are lowercased basenames of picked image files, so image
 * requests only ever match image files.
 */
function resolveImageKey(requestedBase: string, imageKeys: string[]): string | undefined {
  const stem = stemOf(requestedBase)
  const sameStem = imageKeys.find((k) => stemOf(k) === stem)
  if (sameStem) return sameStem
  const nStem = normStem(stem)
  if (!nStem) return undefined
  const normEqual = imageKeys.find((k) => normStem(stemOf(k)) === nStem)
  if (normEqual) return normEqual
  return imageKeys.find((k) => {
    const nk = normStem(stemOf(k))
    return nk.length > 0 && (nk.includes(nStem) || nStem.includes(nk))
  })
}

/**
 * Best-effort automatic texturing: for every material that ended up WITHOUT a
 * color map, try to bind a diffuse texture from the picked files —
 * 1) an image whose filename contains the material/mesh name,
 * 2) otherwise an image with a diffuse-ish name (albedo/basecolor/diffuse…),
 * 3) otherwise, if exactly one image was picked, use it.
 * Only the diffuse/albedo map is bound (per product decision) — full PBR sets
 * still come from proper GLTF/MTL references when present.
 */
function autoAssignDiffuseMaps(
  root: THREE.Object3D,
  files: File[],
  resources: Map<string, string>,
): Promise<number> {
  const imgs = files.filter((f) => IMG_EXT.test(f.name))
  if (imgs.length === 0) return Promise.resolve(0)
  const loader = new THREE.TextureLoader()
  const texCache = new Map<string, Promise<THREE.Texture | null>>()

  const loadTex = (file: File): Promise<THREE.Texture | null> => {
    const key = file.name.toLowerCase()
    if (!texCache.has(key)) {
      texCache.set(key, new Promise((res) => {
        loader.load(
          resources.get(key)!,
          (t) => {
            t.colorSpace = THREE.SRGBColorSpace
            t.wrapS = t.wrapT = THREE.RepeatWrapping
            t.flipY = false // GLTF convention; exporter re-encodes accordingly
            res(t)
          },
          undefined,
          () => res(null),
        )
      }))
    }
    return texCache.get(key)!
  }

  const jobs: Promise<boolean>[] = []
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const mats = Array.isArray(child.material) ? child.material : [child.material]
    for (const m of mats) {
      if (!(m instanceof THREE.MeshStandardMaterial) && !(m instanceof THREE.MeshPhongMaterial)) continue
      if (m.map) continue
      const mName = normStem(m.name || child.name || '')
      // Same fuzzy cascade as texture-request resolution: normalized-stem
      // equality first, then containment in either direction.
      let cand: File | undefined
      if (mName) {
        cand = imgs.find((f) => normStem(stemOf(f.name)) === mName)
        if (!cand) {
          cand = imgs.find((f) => {
            const nf = normStem(stemOf(f.name))
            return nf.length > 0 && (nf.includes(mName) || mName.includes(nf))
          })
        }
      }
      if (!cand) cand = imgs.find((f) => DIFFUSE_HINTS.some((h) => normStem(f.name).includes(normStem(h))))
      if (!cand && imgs.length === 1) cand = imgs[0]
      if (!cand) continue
      ensureUVs(child.geometry as THREE.BufferGeometry)
      jobs.push(loadTex(cand).then((t) => {
        if (!t) return false
        m.map = t
        m.needsUpdate = true
        return true
      }))
    }
  })
  return Promise.all(jobs).then((r) => r.filter(Boolean).length)
}

function toGlbBuffer(scene: THREE.Object3D): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    new GLTFExporter().parse(
      scene,
      (result) => resolve(result as ArrayBuffer),
      reject,
      { binary: true },
    )
  })
}

/**
 * Convert a model plus its companion files (external textures, .bin buffers,
 * .mtl material libraries) into a single self-contained GLB.
 *
 * Every relative resource reference inside the model resolves against the
 * selected files by filename via a LoadingManager URL modifier — this is what
 * makes "load the textures from the model's folder" work in a browser, where
 * loaders cannot read sibling files from disk on their own.
 */
export async function convertFilesToGlb(
  files: File[],
): Promise<{ buffer: ArrayBuffer; info: ModelInfo; mainFile: File; missingTextures: string[] }> {
  const mainFile = files.find((f) => MODEL_EXTS.includes(extOf(f.name)))
  if (!mainFile) {
    throw new Error("3D model fayli topilmadi (.glb, .gltf, .obj yoki .fbx tanlang)")
  }

  // filename (lowercased) → blob URL for every selected file
  const resources = new Map<string, string>()
  // blob URL → original picked filename, to name failures on already-resolved
  // URLs (e.g. a picked .psd the browser cannot decode)
  const blobToName = new Map<string, string>()
  for (const f of files) {
    const blob = URL.createObjectURL(f)
    resources.set(f.name.toLowerCase(), blob)
    blobToName.set(blob, f.name.toLowerCase())
  }

  // Lowercased basenames of picked files that are browser-decodable images —
  // the only valid fuzzy-match targets for texture requests
  const imageKeys = files
    .filter((f) => IMG_EXT.test(f.name))
    .map((f) => f.name.toLowerCase())

  // Texture-like resources the model requested but no picked file could serve
  // (deduplicated by basename)
  const missing = new Set<string>()

  const manager = new THREE.LoadingManager()
  manager.setURLModifier((url) => {
    // Match by trailing filename so "textures/wood.jpg", "./wood.jpg",
    // "C:\maps\wood.jpg" and "wood.jpg" all resolve to the picked file.
    const base = urlBasename(url)
    const exact = resources.get(base)
    if (exact) return exact
    if (TEXTURE_REQUEST_EXT.test(base)) {
      // Exotic extension / renamed file — fuzzy-match against picked images
      const fuzzyKey = resolveImageKey(base, imageKeys)
      const fuzzy = fuzzyKey ? resources.get(fuzzyKey) : undefined
      if (fuzzy) return fuzzy
      missing.add(base)
    }
    return url
  })
  manager.onError = (url) => {
    const base = blobToName.get(url) ?? urlBasename(url)
    if (TEXTURE_REQUEST_EXT.test(base)) missing.add(base)
  }
  const missingList = () => Array.from(missing).sort()

  // loadAsync resolves when the MODEL is parsed — texture images may still be
  // downloading through the manager. Exporting before they finish produced
  // texture-less GLBs, so wait for the manager's full queue (with a cap).
  let allLoaded = false
  const managerDone = new Promise<void>((resolve) => {
    manager.onLoad = () => { allLoaded = true; resolve() }
  })
  const awaitTextures = async () => {
    if (allLoaded) return
    await Promise.race([managerDone, new Promise((r) => setTimeout(r, 8000))])
  }

  const mainUrl = resources.get(mainFile.name.toLowerCase())!
  const ext = extOf(mainFile.name)

  try {
    if (ext === 'glb') {
      // GLB embeds its textures — keep original bytes unless we had to strip
      // a bundled backdrop plane (then the scene must be re-packed)
      const [origBuffer, gltf] = await Promise.all([
        mainFile.arrayBuffer(),
        new GLTFLoader(manager).loadAsync(mainUrl),
      ])
      const stripped = stripBackdropPlanes(gltf.scene)
      const uvFixed = ensureSceneUVs(gltf.scene)
      const assigned = await autoAssignDiffuseMaps(gltf.scene, files, resources)
      const buffer = stripped + assigned + uvFixed > 0 ? await toGlbBuffer(gltf.scene) : origBuffer
      return { buffer, info: extractSceneInfo(gltf.scene), mainFile, missingTextures: missingList() }
    }

    if (ext === 'gltf') {
      const gltf = await new GLTFLoader(manager).loadAsync(mainUrl)
      stripBackdropPlanes(gltf.scene)
      ensureSceneUVs(gltf.scene)
      await awaitTextures()
      await autoAssignDiffuseMaps(gltf.scene, files, resources)
      const buffer = await toGlbBuffer(gltf.scene)
      return { buffer, info: extractSceneInfo(gltf.scene), mainFile, missingTextures: missingList() }
    }

    if (ext === 'obj') {
      const loader = new OBJLoader(manager)
      const mtlFile = files.find((f) => extOf(f.name) === 'mtl')
      if (mtlFile) {
        const mtl = await new MTLLoader(manager).loadAsync(
          resources.get(mtlFile.name.toLowerCase())!,
        )
        mtl.preload()
        loader.setMaterials(mtl)
      }
      const scene = await loader.loadAsync(mainUrl)
      stripBackdropPlanes(scene)
      ensureSceneUVs(scene)
      await awaitTextures()
      await autoAssignDiffuseMaps(scene, files, resources)
      const buffer = await toGlbBuffer(scene)
      return { buffer, info: extractSceneInfo(scene), mainFile, missingTextures: missingList() }
    }

    if (ext === 'fbx') {
      const scene = await new FBXLoader(manager).loadAsync(mainUrl)
      stripBackdropPlanes(scene)
      ensureSceneUVs(scene)
      await awaitTextures()
      await autoAssignDiffuseMaps(scene, files, resources)
      const buffer = await toGlbBuffer(scene)
      return { buffer, info: extractSceneInfo(scene), mainFile, missingTextures: missingList() }
    }

    throw new Error(`Qo'llab-quvvatlanmaydigan format: .${ext}`)
  } finally {
    for (const u of resources.values()) URL.revokeObjectURL(u)
  }
}

type SkinableMaterial = THREE.MeshStandardMaterial | THREE.MeshPhongMaterial

export interface GlbMaterialInfo {
  index: number
  name: string
  hasMap: boolean
  hasUVs: boolean
}

function parseGlb(buffer: ArrayBuffer): Promise<{ scene: THREE.Group }> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(buffer.slice(0), '', resolve as (g: unknown) => void, reject)
  })
}

interface PartRef {
  mesh: THREE.Mesh
  slot: number // material slot within the mesh (multi-material meshes)
  mat: SkinableMaterial
}

/**
 * Every skinnable PART of the model in stable traversal order. A part is one
 * mesh × material slot — finer than unique materials, because asset packs
 * often share one material across many objects (blanket + pillows + sheet),
 * and users need to texture those independently.
 */
function collectParts(root: THREE.Object3D): PartRef[] {
  const out: PartRef[] = []
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    mats.forEach((m, slot) => {
      if (m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshPhongMaterial) {
        out.push({ mesh, slot, mat: m })
      }
    })
  })
  return out
}

/** List a stored model's parts (object name + whether a diffuse is bound). */
export async function listGlbMaterials(buffer: ArrayBuffer): Promise<GlbMaterialInfo[]> {
  const gltf = await parseGlb(buffer)
  return collectParts(gltf.scene).map((p, i) => {
    const meshName = p.mesh.name?.trim()
    const matName = p.mat.name?.trim()
    const label = meshName && matName && meshName !== matName
      ? `${meshName} · ${matName}`
      : meshName || matName || `Qism ${i + 1}`
    return {
      index: i,
      name: label,
      hasMap: !!p.mat.map,
      hasUVs: hasUsableUVs(p.mesh.geometry as THREE.BufferGeometry),
    }
  })
}

/**
 * Meshes exported from Corona/V-Ray scenes often have NO UV coordinates
 * (procedural materials never needed them) — a bound texture then samples a
 * single texel and the part renders as one flat colour. Generate simple
 * box-projected UVs from the bounding box so manual textures actually show.
 */
/** Whether a geometry has UVs that can actually display a texture. */
export function hasUsableUVs(geometry: THREE.BufferGeometry): boolean {
  const existing = geometry.getAttribute('uv')
  if (!existing) return false
  // Degenerate UVs (all identical) are as useless as none — detect cheaply
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < existing.count; i++) {
    const u = existing.getX(i)
    const v = existing.getY(i)
    if (u < min) min = u
    if (v < min) min = v
    if (u > max) max = u
    if (v > max) max = v
  }
  return max - min > 1e-5
}

function ensureUVs(geometry: THREE.BufferGeometry): boolean {
  if (hasUsableUVs(geometry)) return false
  geometry.computeBoundingBox()
  const bb = geometry.boundingBox!
  const size = new THREE.Vector3().subVectors(bb.max, bb.min)
  const pos = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const uv = new Float32Array(pos.count * 2)
  const n = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    if (normal) n.set(normal.getX(i), normal.getY(i), normal.getZ(i))
    else n.set(0, 1, 0)
    const ax = Math.abs(n.x)
    const ay = Math.abs(n.y)
    const az = Math.abs(n.z)
    let u: number
    let v: number
    if (ay >= ax && ay >= az) {
      u = (x - bb.min.x) / (size.x || 1)
      v = (z - bb.min.z) / (size.z || 1)
    } else if (ax >= az) {
      u = (z - bb.min.z) / (size.z || 1)
      v = (y - bb.min.y) / (size.y || 1)
    } else {
      u = (x - bb.min.x) / (size.x || 1)
      v = (y - bb.min.y) / (size.y || 1)
    }
    uv[i * 2] = u
    uv[i * 2 + 1] = v
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return true
}

/** Generate UVs for every unwrapped mesh in a scene; returns how many were fixed. */
function ensureSceneUVs(root: THREE.Object3D): number {
  let fixed = 0
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.isMesh && mesh.geometry && ensureUVs(mesh.geometry as THREE.BufferGeometry)) fixed++
  })
  return fixed
}

function assignPartTexture(p: PartRef, tex: THREE.Texture) {
  ensureUVs(p.mesh.geometry as THREE.BufferGeometry)
  // Clone the material so a shared material doesn't texture OTHER parts too
  const cloned = p.mat.clone()
  cloned.map = tex
  cloned.color.set('#ffffff') // don't tint the texture with the old flat colour
  cloned.needsUpdate = true
  if (Array.isArray(p.mesh.material)) {
    p.mesh.material[p.slot] = cloned
  } else {
    p.mesh.material = cloned
  }
}

/**
 * Manually skin a stored GLB with an image.
 * - targetIndex given: bind ONLY that part (material cloned first, so parts
 *   sharing a material are textured independently).
 * - targetIndex omitted: bind every unmapped part, or all of them when the
 *   model is already fully mapped (so the action always has an effect).
 * Re-exports a self-contained GLB.
 */
export async function applyTextureToGlb(
  buffer: ArrayBuffer,
  imageFile: File,
  targetIndex?: number,
): Promise<ArrayBuffer> {
  const gltf = await parseGlb(buffer)
  const parts = collectParts(gltf.scene)
  const url = URL.createObjectURL(imageFile)
  try {
    const tex = await new Promise<THREE.Texture>((resolve, reject) => {
      new THREE.TextureLoader().load(url, resolve, undefined, reject)
    })
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.flipY = false

    let targets: PartRef[]
    if (targetIndex !== undefined) {
      targets = parts[targetIndex] ? [parts[targetIndex]] : []
    } else {
      const unmapped = parts.filter((p) => !p.mat.map)
      targets = unmapped.length > 0 ? unmapped : parts
    }
    if (targets.length === 0) throw new Error('Modelda mos qism topilmadi')
    for (const p of targets) assignPartTexture(p, tex)
    return await toGlbBuffer(gltf.scene)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Single-file convenience wrapper (kept for compatibility). */
export async function convertToGlb(
  file: File,
): Promise<{ buffer: ArrayBuffer; info: ModelInfo }> {
  const { buffer, info } = await convertFilesToGlb([file])
  return { buffer, info }
}
