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

  // Auto-detect units: mm >100, cm >10, else metres
  const toM = maxDim > 100 ? 0.001 : maxDim > 10 ? 0.01 : 1

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
): Promise<{ buffer: ArrayBuffer; info: ModelInfo; mainFile: File }> {
  const mainFile = files.find((f) => MODEL_EXTS.includes(extOf(f.name)))
  if (!mainFile) {
    throw new Error("3D model fayli topilmadi (.glb, .gltf, .obj yoki .fbx tanlang)")
  }

  // filename (lowercased) → blob URL for every selected file
  const resources = new Map<string, string>()
  for (const f of files) {
    resources.set(f.name.toLowerCase(), URL.createObjectURL(f))
  }

  const manager = new THREE.LoadingManager()
  manager.setURLModifier((url) => {
    // Match by trailing filename so "textures/wood.jpg", "./wood.jpg" and
    // "wood.jpg" all resolve to the picked file with that name.
    const base = decodeURIComponent(url.split(/[\\/]/).pop() ?? '')
      .split('?')[0]
      .toLowerCase()
    return resources.get(base) ?? url
  })

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
      const buffer = stripped > 0 ? await toGlbBuffer(gltf.scene) : origBuffer
      return { buffer, info: extractSceneInfo(gltf.scene), mainFile }
    }

    if (ext === 'gltf') {
      const gltf = await new GLTFLoader(manager).loadAsync(mainUrl)
      stripBackdropPlanes(gltf.scene)
      await awaitTextures()
      const buffer = await toGlbBuffer(gltf.scene)
      return { buffer, info: extractSceneInfo(gltf.scene), mainFile }
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
      await awaitTextures()
      const buffer = await toGlbBuffer(scene)
      return { buffer, info: extractSceneInfo(scene), mainFile }
    }

    if (ext === 'fbx') {
      const scene = await new FBXLoader(manager).loadAsync(mainUrl)
      stripBackdropPlanes(scene)
      await awaitTextures()
      const buffer = await toGlbBuffer(scene)
      return { buffer, info: extractSceneInfo(scene), mainFile }
    }

    throw new Error(`Qo'llab-quvvatlanmaydigan format: .${ext}`)
  } finally {
    for (const u of resources.values()) URL.revokeObjectURL(u)
  }
}

/** Single-file convenience wrapper (kept for compatibility). */
export async function convertToGlb(
  file: File,
): Promise<{ buffer: ArrayBuffer; info: ModelInfo }> {
  const { buffer, info } = await convertFilesToGlb([file])
  return { buffer, info }
}
