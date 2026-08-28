import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

/*
 * Part-level editing of placed GLB models.
 *
 * A "part" is a sub-node of a model's scene graph the user can select,
 * detach into a standalone object, or delete. Parts are addressed by a
 * stable KEY derived from the child-index path in the ORIGINAL (unpruned)
 * scene graph — node names in GLBs are frequently empty or duplicated, so
 * an index path is the only reliable identity. Keys must therefore always
 * be resolved against a fresh clone BEFORE any hidden parts are removed.
 *
 * Key format: "0/2/1:NodeName" (name suffix is cosmetic/defensive only).
 */

export function partKeyFor(root: THREE.Object3D, node: THREE.Object3D): string {
  const indices: number[] = []
  let cur = node
  while (cur !== root) {
    const parent: THREE.Object3D | null = cur.parent
    if (!parent) return '' // node is not under root
    indices.unshift(parent.children.indexOf(cur))
    cur = parent
  }
  return `${indices.join('/')}:${node.name}`
}

export function resolvePartKey(root: THREE.Object3D, key: string): THREE.Object3D | null {
  const path = key.split(':')[0]
  if (path === '') return null
  let cur: THREE.Object3D = root
  for (const seg of path.split('/')) {
    const idx = Number(seg)
    const next = cur.children[idx]
    if (!next) return null
    cur = next
  }
  return cur
}

/**
 * Map a clicked mesh to the node the user perceives as a "component".
 * GLBs usually wrap everything in 1–2 single-child wrapper nodes
 * (Scene → RootNode → …); the meaningful component boundary is the child
 * of the first BRANCHING node that contains the clicked mesh. If the
 * graph never branches the mesh itself is the part.
 */
export function resolvePartFromMesh(root: THREE.Object3D, mesh: THREE.Object3D): THREE.Object3D {
  let branch: THREE.Object3D = root
  while (branch.children.length === 1) branch = branch.children[0]
  // Walk up from the mesh until the parent is the branching node
  let cur: THREE.Object3D = mesh
  while (cur.parent && cur !== branch && cur.parent !== branch) cur = cur.parent
  return cur === branch ? mesh : cur
}

/** Human-readable label for a part (first named node down the chain). */
export function partLabel(node: THREE.Object3D): string {
  if (node.name) return node.name.replace(/[_.]/g, ' ')
  let found = ''
  node.traverse((c) => { if (!found && c.name) found = c.name.replace(/[_.]/g, ' ') })
  return found || 'Qism'
}

/**
 * Remove hidden parts from a freshly cloned scene graph.
 * Resolves ALL keys first, then detaches — removal shifts child indices,
 * so resolving lazily would corrupt subsequent keys.
 */
export function applyHiddenParts(root: THREE.Object3D, hiddenParts: string[] | undefined): void {
  if (!hiddenParts || hiddenParts.length === 0) return
  const nodes = hiddenParts
    .map((k) => resolvePartKey(root, k))
    .filter((n): n is THREE.Object3D => n !== null && n !== root)
  for (const n of nodes) n.removeFromParent()
}

/** True when the model would still contain at least one visible mesh after also hiding `extraKey`. */
export function hasMeshesOutsidePart(root: THREE.Object3D, part: THREE.Object3D): boolean {
  let found = false
  root.traverse((c) => {
    if (found || !(c as THREE.Mesh).isMesh) return
    let cur: THREE.Object3D | null = c
    while (cur) {
      if (cur === part) return // inside the part being removed
      cur = cur.parent
    }
    found = true
  })
  return found
}

/** Set/unset a selection tint on every mesh material in a subtree. */
export function setPartHighlight(node: THREE.Object3D, on: boolean): void {
  node.traverse((c) => {
    if (!(c instanceof THREE.Mesh)) return
    const mats = Array.isArray(c.material) ? c.material : [c.material]
    for (const m of mats) {
      if (!(m instanceof THREE.MeshStandardMaterial)) continue
      m.emissive.set(on ? '#2563EB' : '#000000')
      m.emissiveIntensity = on ? 0.4 : 0
    }
  })
}

/**
 * Export a live part subtree to a standalone GLB.
 * The part's WORLD rotation and scale are baked into the export root (its
 * translation is zeroed), so rendering the GLB at scale 1 reproduces the
 * part exactly as it appeared in the room. Returns the binary plus the
 * world-space bounding box needed to place and size the new object.
 */
export async function exportPartToGlb(part: THREE.Object3D): Promise<{
  buffer: ArrayBuffer
  sizeM: { w: number; d: number; h: number }
  worldCenter: THREE.Vector3
}> {
  part.updateWorldMatrix(true, true)

  const worldBox = new THREE.Box3().setFromObject(part)
  const worldCenter = worldBox.getCenter(new THREE.Vector3())
  const size = worldBox.getSize(new THREE.Vector3())

  const clone = part.clone(true)
  clone.matrix.copy(part.matrixWorld)
  clone.matrix.decompose(clone.position, clone.quaternion, clone.scale)
  clone.position.set(0, 0, 0)
  clone.matrixWorldNeedsUpdate = true

  const holder = new THREE.Group()
  holder.add(clone)

  const gltf = await new GLTFExporter().parseAsync(holder, { binary: true })
  if (!(gltf instanceof ArrayBuffer)) throw new Error('GLB eksport qilinmadi')

  return {
    buffer: gltf,
    sizeM: {
      w: Math.max(size.x, 0.01),
      d: Math.max(size.z, 0.01),
      h: Math.max(size.y, 0.01),
    },
    worldCenter,
  }
}
