import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

/** GLTFLoader with the meshopt decoder attached — our admin uploads are stored
 *  meshopt-compressed (EXT_meshopt_compression), so any GLB that flows through
 *  the import pipeline must be able to decode it. (The studio's catalog render
 *  path uses drei useGLTF, which wires the decoder itself.) */
function makeGLTFLoader(manager?: THREE.LoadingManager): GLTFLoader {
  const loader = manager ? new GLTFLoader(manager) : new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  return loader
}

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

/** Any material that can carry a diffuse map — the loaders emit several. */
type MappableMaterial = THREE.Material & { map?: THREE.Texture | null }

/** True when the material exposes a diffuse map slot AND has one bound. */
function hasDiffuseMap(m: THREE.Material): boolean {
  return !!(m as MappableMaterial).map
}

/**
 * FBXLoader emits Lambert/Phong and OBJ-without-MTL emits Phong, but every
 * texture helper here — and GLTFExporter — speaks MeshStandardMaterial.
 *
 * This matters twice over. Skipping the conversion used to mean (a) the
 * auto-texturer silently ignored the whole model, and (b) GLTFExporter, which
 * has no Phong/Lambert→PBR path, wrote a hardcoded `metallicFactor: 0.5`. Under
 * a studio HDRI, a half-metallic surface mirrors the white softboxes and washes
 * out to near-white even when a perfectly good texture is bound.
 *
 * Converting once, here, fixes both. Returns how many materials were replaced.
 */
function toStandardMaterials(root: THREE.Object3D): number {
  const converted = new Map<THREE.Material, THREE.MeshStandardMaterial>()

  const convert = (m: THREE.Material): THREE.Material => {
    if (m instanceof THREE.MeshStandardMaterial) return m
    const existing = converted.get(m)
    if (existing) return existing
    const src = m as THREE.MeshPhongMaterial & THREE.MeshLambertMaterial
    const std = new THREE.MeshStandardMaterial({
      name: m.name,
      color: src.color?.clone() ?? new THREE.Color(0xffffff),
      map: src.map ?? null,
      normalMap: src.normalMap ?? null,
      aoMap: src.aoMap ?? null,
      alphaMap: src.alphaMap ?? null,
      emissive: src.emissive?.clone() ?? new THREE.Color(0x000000),
      emissiveMap: src.emissiveMap ?? null,
      // Furniture is non-metal; matte-ish. Anything else re-creates the very
      // blowout this conversion exists to prevent.
      metalness: 0,
      roughness: 0.8,
      transparent: m.transparent,
      opacity: m.opacity,
      alphaTest: m.alphaTest,
      side: m.side,
      vertexColors: m.vertexColors,
      flatShading: !!src.flatShading,
    })
    converted.set(m, std)
    return std
  }

  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map(convert)
    } else if (mesh.material) {
      mesh.material = convert(mesh.material as THREE.Material)
    }
  })
  return converted.size
}

/** Every texture slot MeshStandardMaterial (and glTF-sourced materials)
 *  carries — used by stripUnloadedTextures to catch broken bindings. */
const TEXTURE_SLOTS = [
  'map', 'normalMap', 'bumpMap', 'displacementMap', 'roughnessMap',
  'metalnessMap', 'alphaMap', 'aoMap', 'emissiveMap', 'envMap',
  'lightMap', 'specularMap', 'gradientMap',
] as const

type TexturedMaterial = THREE.Material &
  Partial<Record<(typeof TEXTURE_SLOTS)[number], THREE.Texture | null>>

/**
 * Some FBX/OBJ material channels — an external texture the manager's
 * onError already flagged as missing, or an exotic map type (e.g.
 * ShininessExponent, VectorDisplacementColor) the loader partially wires up
 * before giving up on — leave a THREE.Texture bound to a material slot with
 * no decoded `.image`. GLTFExporter throws outright on such a texture ("No
 * valid image data found"), which used to abort the whole import over one
 * bad slot in an otherwise-good model.
 *
 * Strip any texture missing image data before export. A material minus a
 * broken map still renders (flat color); a failed export renders nothing.
 * Returns how many texture slots were cleared.
 */
function stripUnloadedTextures(root: THREE.Object3D): number {
  let cleared = 0
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const raw of mats) {
      if (!raw) continue
      const m = raw as TexturedMaterial
      let touched = false
      for (const slot of TEXTURE_SLOTS) {
        const tex = m[slot]
        if (tex && !tex.image) {
          tex.dispose()
          m[slot] = null
          cleared++
          touched = true
        }
      }
      if (touched) m.needsUpdate = true
    }
  })
  return cleared
}

/**
 * Auto-detect a model's real-world scale purely from its own geometry —
 * no target size needed. Used both right after import (modelConverter's own
 * pipeline) and for shop-catalog models loaded straight from a URL in the
 * studio, which arrive with no pre-computed scale at all.
 */
export function extractSceneInfo(root: THREE.Object3D): ModelInfo {
  const box = new THREE.Box3().setFromObject(root)
  // An empty scene would sail through as a 0×0 m entry with no materials and
  // nothing to render. Fail loudly instead — the import is not usable.
  if (box.isEmpty()) {
    throw new Error(
      "Model bo'sh — hech qanday geometriya topilmadi. Faylni boshqa formatda (GLB) eksport qilib ko'ring.",
    )
  }
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
      if (hasDiffuseMap(m)) hasTextures = true
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
 *
 * A backdrop is only a backdrop relative to the thing standing in front of it,
 * so the pass never removes every mesh: a rug, a doormat or a wall panel on
 * its own matches every "flat sheet on the floor" signal while BEING the
 * model, and stripping it left an empty scene (0 materials, 0×0 m).
 */
export function stripBackdropPlanes(root: THREE.Object3D): number {
  const rootBox = new THREE.Box3().setFromObject(root)
  const rootSize = rootBox.getSize(new THREE.Vector3())
  const rootMax = Math.max(rootSize.x, rootSize.y, rootSize.z) || 1
  const kept: THREE.Mesh[] = []
  const doomed: THREE.Mesh[] = []
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    kept.push(child)
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
  if (!doomed.length) return 0

  // A backdrop needs something standing on it. Measure what would survive:
  // if the rest of the scene has no real height, nothing is being backdropped
  // and these sheets ARE the model (a rug, a doormat, a rug split into pile
  // and backing). Stripping then left an empty scene — 0 materials, 0×0 m.
  const survivors = kept.filter((m) => !doomed.includes(m))
  const standing = new THREE.Box3()
  for (const m of survivors) standing.union(new THREE.Box3().setFromObject(m))
  if (standing.isEmpty() || standing.getSize(new THREE.Vector3()).y < rootMax * 0.05) return 0

  for (const m of doomed) m.removeFromParent()
  return doomed.length
}

const IMG_EXT = /\.(png|jpe?g|webp|bmp)$/i
// Extensions a model may REQUEST for a texture — includes formats browsers
// can't decode (.tx/.tif/.tga/.psd are common in 3ds Max/Corona exports).
// Requests for these are texture-like even when no picked file can serve them.
const TEXTURE_REQUEST_EXT = /\.(tx|tiff?|tga|psd|png|jpe?g|webp|bmp)$/i
// Filename markers for a colour/albedo map. The short markers (`_col`, `_dif`,
// `_d`) must be matched between delimiters — as bare substrings they hit
// almost any filename ("_d" alone matched every name containing the letter
// d). `dif` (e.g. "dif_wood.jpg", a common 3ds Max/Corona export convention)
// used to fall through every branch here — it isn't "diffuse" in full, and
// isn't the bare "d" token — leaving the material with no map at all and
// whatever flat placeholder color the exporter baked in.
const DIFFUSE_HINT_RE =
  /(diffuse|albedo|base[_-]?colou?r|colou?r|(^|[_-])col($|[_-])|(^|[_-])dif($|[_-])|(^|[_-])d($|[_-]))/i
// Maps that are NOT colour. Binding one of these as the diffuse yields a valid,
// decodable, near-white texture — the model then renders flat white while every
// "has a texture?" check happily reports yes.
const NON_COLOR_MAP =
  /(normal|_nrm|_nor\b|bump|height|displace|disp|(^|[_-])ao($|[_-])|occlusion|rough|gloss|spec|metal|mask|opacity|alpha|emissi)/i

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
  const allImgs = files.filter((f) => IMG_EXT.test(f.name))
  // Prefer colour maps; fall back to the unfiltered set only if excluding the
  // non-colour ones would leave us with nothing to bind at all.
  const colorImgs = allImgs.filter((f) => !NON_COLOR_MAP.test(f.name))
  const imgs = colorImgs.length > 0 ? colorImgs : allImgs
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
      // A map that's merely BOUND isn't necessarily usable: some FBX/Corona
      // material graphs wire a diffuse slot through an internal node (seen in
      // the wild as e.g. "Texmap_Level", a color-correction wrapper) that
      // FBXLoader can't trace to an actual bitmap — it creates a Texture with
      // no `.image` that will never load. Skipping only on a genuinely loaded
      // map lets filename matching still rescue those.
      if (m.map && m.map.image) continue
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
      if (!cand) cand = imgs.find((f) => DIFFUSE_HINT_RE.test(stemOf(f.name)))
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

const THUMBNAIL_SIZE = 256

/**
 * Render a 3/4-angle preview of *root* to a JPEG data URL, for the catalog
 * card thumbnail — so an uploaded model shows an actual picture of itself
 * instead of a generic box icon. Best-effort: any WebGL failure (or an
 * environment with no GPU context) returns null rather than failing the
 * import — a missing thumbnail just falls back to the emoji placeholder.
 *
 * Must run AFTER materials/textures are finalized (toStandardMaterials,
 * autoAssignDiffuseMaps) and BEFORE toGlbBuffer, while *root* still has no
 * parent — it's reparented into a throwaway scene for the render and put
 * back exactly as found, so the export right after this sees an unchanged
 * scene graph.
 */
function renderThumbnail(root: THREE.Object3D): string | null {
  let renderer: THREE.WebGLRenderer | null = null
  try {
    const box = new THREE.Box3().setFromObject(root)
    if (box.isEmpty()) return null
    const center = box.getCenter(new THREE.Vector3())
    const sphere = box.getBoundingSphere(new THREE.Sphere())
    const radius = sphere.radius || 1

    const canvas = document.createElement('canvas')
    canvas.width = THUMBNAIL_SIZE
    canvas.height = THUMBNAIL_SIZE
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
    renderer.setSize(THUMBNAIL_SIZE, THUMBNAIL_SIZE)
    renderer.setPixelRatio(1)

    const originalParent = root.parent
    const stage = new THREE.Scene()
    stage.add(root)
    stage.add(new THREE.AmbientLight(0xffffff, 1.1))
    const key = new THREE.DirectionalLight(0xffffff, 1.6)
    key.position.set(1, 1.4, 1.6)
    stage.add(key)
    const fill = new THREE.DirectionalLight(0xffffff, 0.6)
    fill.position.set(-1.4, 0.6, -1)
    stage.add(fill)

    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, radius * 20)
    const dist = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.35
    camera.position.set(center.x + dist * 0.6, center.y + dist * 0.45, center.z + dist * 0.6)
    camera.lookAt(center)

    renderer.setClearColor(0xf3f4f6, 1)
    renderer.render(stage, camera)
    const url = canvas.toDataURL('image/jpeg', 0.72)

    if (originalParent) originalParent.add(root)
    else stage.remove(root)

    return url
  } catch {
    return null
  } finally {
    renderer?.dispose()
  }
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
): Promise<{
  buffer: ArrayBuffer
  info: ModelInfo
  mainFile: File
  missingTextures: string[]
  parts: { textured: number; total: number }
  thumbnailUrl: string | null
}> {
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

  /** Textured-vs-total part counts, so the UI can say "2 of 8 textured"
   *  instead of a blanket ✓ that hides the parts nothing matched. */
  const countTextured = (root: THREE.Object3D) => {
    let textured = 0
    let total = 0
    root.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of mats) {
        if (!m) continue
        total++
        if (hasDiffuseMap(m) && hasUsableUVs(mesh.geometry as THREE.BufferGeometry)) textured++
      }
    })
    return { textured, total }
  }

  try {
    if (ext === 'glb') {
      // GLB embeds its textures — keep original bytes unless we had to strip
      // a bundled backdrop plane (then the scene must be re-packed)
      const [origBuffer, gltf] = await Promise.all([
        mainFile.arrayBuffer(),
        makeGLTFLoader(manager).loadAsync(mainUrl),
      ])
      const stripped = stripBackdropPlanes(gltf.scene)
      const uvFixed = ensureSceneUVs(gltf.scene)
      const assigned = await autoAssignDiffuseMaps(gltf.scene, files, resources)
      const texturesCleared = stripUnloadedTextures(gltf.scene)
      const buffer =
        stripped + assigned + uvFixed + texturesCleared > 0
          ? await toGlbBuffer(gltf.scene)
          : origBuffer
      const thumbnailUrl = renderThumbnail(gltf.scene)
      return { buffer, info: extractSceneInfo(gltf.scene), mainFile, missingTextures: missingList(), parts: countTextured(gltf.scene), thumbnailUrl }
    }

    if (ext === 'gltf') {
      const gltf = await makeGLTFLoader(manager).loadAsync(mainUrl)
      stripBackdropPlanes(gltf.scene)
      ensureSceneUVs(gltf.scene)
      await awaitTextures()
      await autoAssignDiffuseMaps(gltf.scene, files, resources)
      stripUnloadedTextures(gltf.scene)
      const thumbnailUrl = renderThumbnail(gltf.scene)
      const buffer = await toGlbBuffer(gltf.scene)
      return { buffer, info: extractSceneInfo(gltf.scene), mainFile, missingTextures: missingList(), parts: countTextured(gltf.scene), thumbnailUrl }
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
      toStandardMaterials(scene)
      ensureSceneUVs(scene)
      await awaitTextures()
      await autoAssignDiffuseMaps(scene, files, resources)
      stripUnloadedTextures(scene)
      const thumbnailUrl = renderThumbnail(scene)
      const buffer = await toGlbBuffer(scene)
      return { buffer, info: extractSceneInfo(scene), mainFile, missingTextures: missingList(), parts: countTextured(scene), thumbnailUrl }
    }

    if (ext === 'fbx') {
      const scene = await new FBXLoader(manager).loadAsync(mainUrl)
      stripBackdropPlanes(scene)
      toStandardMaterials(scene)
      ensureSceneUVs(scene)
      await awaitTextures()
      await autoAssignDiffuseMaps(scene, files, resources)
      stripUnloadedTextures(scene)
      const thumbnailUrl = renderThumbnail(scene)
      const buffer = await toGlbBuffer(scene)
      return { buffer, info: extractSceneInfo(scene), mainFile, missingTextures: missingList(), parts: countTextured(scene), thumbnailUrl }
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
  /** A bound map only shows if its image decoded AND the part has usable UVs.
   *  Reporting `hasMap` alone claimed "textured ✓" on parts rendering blank. */
  textured: boolean
}

function parseGlb(buffer: ArrayBuffer): Promise<{ scene: THREE.Group }> {
  return new Promise((resolve, reject) => {
    makeGLTFLoader().parse(buffer.slice(0), '', resolve as (g: unknown) => void, reject)
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
    const hasMap = !!p.mat.map
    const hasUVs = hasUsableUVs(p.mesh.geometry as THREE.BufferGeometry)
    const decoded = (p.mat.map?.image?.width ?? 0) > 0
    return {
      index: i,
      name: label,
      hasMap,
      hasUVs,
      textured: hasMap && hasUVs && decoded,
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
  // Degenerate UVs are as useless as none. Track the axes SEPARATELY: a shared
  // min/max lets geometry with a constant U (or constant V) pass as usable,
  // which then samples a single texel strip and renders as one flat colour.
  let uMin = Infinity
  let uMax = -Infinity
  let vMin = Infinity
  let vMax = -Infinity
  for (let i = 0; i < existing.count; i++) {
    const u = existing.getX(i)
    const v = existing.getY(i)
    if (u < uMin) uMin = u
    if (u > uMax) uMax = u
    if (v < vMin) vMin = v
    if (v > vMax) vMax = v
  }
  return uMax - uMin > 1e-5 && vMax - vMin > 1e-5
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

/** PBR channels a dropped image can be bound to. */
export type MapChannel = 'map' | 'normalMap' | 'roughnessMap' | 'aoMap' | 'metalnessMap'

/**
 * Guess a PBR channel from a texture filename. Asset packs are wildly
 * inconsistent, so match the widest common spellings and fall back to the
 * diffuse channel — an unrecognised name is far more likely to be the colour
 * map (albedo/basecolor/diffuse/"wood.jpg") than anything else.
 */
export function guessMapChannel(fileName: string): MapChannel {
  const n = fileName.toLowerCase()
  if (/normal|_nor[_.-]|nor_gl|_nrm|_norm/.test(n)) return 'normalMap'
  if (/rough|_rgh|glossiness/.test(n)) return 'roughnessMap'
  if (/occlusion|ambientocclusion|[_-]ao[_.-]|[_-]ao$/.test(n)) return 'aoMap'
  if (/metal|_mtl[_.-]/.test(n)) return 'metalnessMap'
  return 'map'
}

/** Colour maps are sRGB; every data map must stay linear or lighting breaks. */
function channelColorSpace(ch: MapChannel): string {
  return ch === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace
}

/**
 * Bind one or more channels to a single part. The material is cloned first so
 * parts sharing a material (common in asset packs) stay independent.
 */
function assignPartMaps(p: PartRef, maps: Partial<Record<MapChannel, THREE.Texture>>) {
  ensureUVs(p.mesh.geometry as THREE.BufferGeometry)
  const cloned = p.mat.clone()

  if (maps.map) {
    cloned.map = maps.map
    cloned.color.set('#ffffff') // don't tint the texture with the old flat colour
  }
  if (maps.normalMap) cloned.normalMap = maps.normalMap
  if (maps.aoMap) {
    // three r152+ reads aoMap from uv channel 1; these meshes only have uv0.
    maps.aoMap.channel = 0
    cloned.aoMap = maps.aoMap
  }
  // Roughness/metalness only exist on the standard (PBR) material.
  if (cloned instanceof THREE.MeshStandardMaterial) {
    if (maps.roughnessMap) {
      cloned.roughnessMap = maps.roughnessMap
      cloned.roughness = 1 // the map modulates this scalar — 1 = use it as-is
    }
    if (maps.metalnessMap) {
      cloned.metalnessMap = maps.metalnessMap
      cloned.metalness = 1
    }
  }

  cloned.needsUpdate = true
  if (Array.isArray(p.mesh.material)) {
    p.mesh.material[p.slot] = cloned
  } else {
    p.mesh.material = cloned
  }
}

function loadTexture(file: File, channel: MapChannel): Promise<THREE.Texture> {
  const url = URL.createObjectURL(file)
  return new Promise<THREE.Texture>((resolve, reject) => {
    new THREE.TextureLoader().load(url, resolve, undefined, reject)
  })
    .then((tex) => {
      tex.colorSpace = channelColorSpace(channel) as THREE.ColorSpace
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping
      tex.flipY = false
      return tex
    })
    .finally(() => URL.revokeObjectURL(url))
}

/**
 * Skin a stored GLB with a whole material — one image per PBR channel,
 * classified by filename (diffuse / normal / roughness / AO / metalness).
 * Dropping a single image is just the one-file case of this.
 *
 * - targetIndex given: bind ONLY that part.
 * - targetIndex omitted: bind every unmapped part, or all of them when the
 *   model is already fully mapped (so the action always has an effect).
 */
export async function applyMaterialToGlb(
  buffer: ArrayBuffer,
  imageFiles: File[],
  targetIndex?: number,
): Promise<ArrayBuffer> {
  if (imageFiles.length === 0) throw new Error('Rasm tanlanmadi')
  const gltf = await parseGlb(buffer)
  const parts = collectParts(gltf.scene)

  const targets =
    targetIndex !== undefined
      ? (parts[targetIndex] ? [parts[targetIndex]] : [])
      : (parts.filter((p) => !p.mat.map).length > 0 ? parts.filter((p) => !p.mat.map) : parts)
  if (targets.length === 0) throw new Error('Modelda mos qism topilmadi')

  // Last file wins per channel — dropping two diffuse images is a user slip,
  // not a reason to fail.
  const maps: Partial<Record<MapChannel, THREE.Texture>> = {}
  for (const file of imageFiles) {
    const channel = guessMapChannel(file.name)
    maps[channel] = await loadTexture(file, channel)
  }

  for (const p of targets) {
    // Each part needs its own texture instances — sharing one Texture object
    // across materials is fine in three, but cloning keeps per-part edits safe.
    assignPartMaps(p, maps)
  }
  return await toGlbBuffer(gltf.scene)
}

