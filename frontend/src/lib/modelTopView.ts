/**
 * Orthographic top view of a 3D model, as line work.
 *
 * What the plan needs is what an orthographic camera looking straight down
 * would draw: the model's real border, plus the edges where its height steps —
 * a chair's arms and back inside its seat outline, a table top over its legs.
 * A convex hull cannot show any of that, so instead the model is rendered the
 * way a top camera would see it: every triangle is rasterised into a height
 * map (a Z-buffer from above), and the drawing is the set of isolines through
 * that map.
 *
 *   • `outline` — where coverage crosses ½: the silhouette, holes included.
 *   • `details` — where the height crosses a band: the visible internal edges.
 *
 * Both come out as smooth interpolated contours, so a round chair traces a
 * circle and a boxy cabinet traces a rectangle. Coordinates are model space
 * [x, z], matching how `FurnitureItem` places the model — multiply by
 * `entry.scale * scaleOverride` for metres in the room.
 */
import * as THREE from 'three'

/** Closed polyline as [x, z] pairs, model space. */
export type Poly = Array<[number, number]>

export interface TopView {
  outline: Poly[]
  details: Poly[]
}

/** Raster resolution; dropped for very heavy meshes to keep the trace quick. */
const GRID_FINE = 200
const GRID_COARSE = 128
const HEAVY_TRIS = 60000
/** Sub-samples per cell per axis when measuring coverage. */
const SUB = 2
/** Height bands traced as internal edges, as fractions of the model's height. */
const BANDS = [0.22, 0.45, 0.68, 0.9]
/** A band is skipped when it covers about as much as the last one drawn. */
const BAND_SIMILARITY = 0.04
/** Contours shorter than this (in cells) are raster noise. */
const MIN_CONTOUR_CELLS = 8

const cache = new Map<string, TopView>()

interface Raster {
  n: number
  x0: number
  z0: number
  cell: number
  /** Max height per cell; `empty` where nothing covers it. */
  height: Float32Array
  /** Covered sub-samples per cell, 0…SUB². */
  cover: Float32Array
  empty: number
  hMin: number
  hMax: number
}

/** Render the model from above into a height map. */
function rasterize(root: THREE.Object3D): Raster | null {
  root.updateWorldMatrix(true, true)
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert()

  const meshes: THREE.Mesh[] = []
  let triTotal = 0
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || !mesh.visible) return
    const pos = mesh.geometry?.getAttribute('position')
    if (!pos) return
    meshes.push(mesh)
    const idx = mesh.geometry.getIndex()
    triTotal += (idx ? idx.count : pos.count) / 3
  })
  if (meshes.length === 0) return null

  // Bounds first — the raster has to cover the whole model
  const box = new THREE.Box3()
  const v = new THREE.Vector3()
  const local = new THREE.Matrix4()
  for (const mesh of meshes) {
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    local.multiplyMatrices(toRoot, mesh.matrixWorld)
    for (let i = 0; i < pos.count; i++) {
      box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(local))
    }
  }
  const sizeX = box.max.x - box.min.x
  const sizeZ = box.max.z - box.min.z
  if (!(sizeX > 0) || !(sizeZ > 0)) return null

  const n = triTotal > HEAVY_TRIS ? GRID_COARSE : GRID_FINE
  // One cell of padding all round so every contour closes inside the field
  const cell = Math.max(sizeX, sizeZ) / (n - 4)
  const x0 = (box.min.x + box.max.x) / 2 - (n * cell) / 2
  const z0 = (box.min.z + box.max.z) / 2 - (n * cell) / 2

  const empty = box.min.y - Math.max(1e-4, (box.max.y - box.min.y) * 0.5)
  const height = new Float32Array(n * n).fill(empty)
  const cover = new Float32Array(n * n)

  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const subOff: number[] = []
  for (let s = 0; s < SUB; s++) subOff.push((s + 0.5) / SUB - 0.5)

  for (const mesh of meshes) {
    const geo = mesh.geometry
    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    const idx = geo.getIndex()
    local.multiplyMatrices(toRoot, mesh.matrixWorld)
    const triCount = (idx ? idx.count : pos.count) / 3

    for (let t = 0; t < triCount; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3
      const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1
      const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2
      a.fromBufferAttribute(pos, i0).applyMatrix4(local)
      b.fromBufferAttribute(pos, i1).applyMatrix4(local)
      c.fromBufferAttribute(pos, i2).applyMatrix4(local)

      // Edge functions of the triangle projected onto the floor
      const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z)
      if (Math.abs(d) < 1e-12) continue // edge-on: contributes no area from above

      const minI = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) - x0) / cell) - 1)
      const maxI = Math.min(n - 1, Math.ceil((Math.max(a.x, b.x, c.x) - x0) / cell) + 1)
      const minJ = Math.max(0, Math.floor((Math.min(a.z, b.z, c.z) - z0) / cell) - 1)
      const maxJ = Math.min(n - 1, Math.ceil((Math.max(a.z, b.z, c.z) - z0) / cell) + 1)

      for (let j = minJ; j <= maxJ; j++) {
        for (let i = minI; i <= maxI; i++) {
          const cx = x0 + (i + 0.5) * cell
          const cz = z0 + (j + 0.5) * cell
          let hit = 0
          let hMax = -Infinity
          for (const oz of subOff) {
            for (const ox of subOff) {
              const px = cx + ox * cell
              const pz = cz + oz * cell
              const w0 = ((b.z - c.z) * (px - c.x) + (c.x - b.x) * (pz - c.z)) / d
              if (w0 < 0 || w0 > 1) continue
              const w1 = ((c.z - a.z) * (px - c.x) + (a.x - c.x) * (pz - c.z)) / d
              if (w1 < 0 || w1 > 1) continue
              const w2 = 1 - w0 - w1
              if (w2 < 0 || w2 > 1) continue
              hit++
              const y = w0 * a.y + w1 * b.y + w2 * c.y
              if (y > hMax) hMax = y
            }
          }
          if (hit === 0) continue
          const k = j * n + i
          cover[k] += hit
          if (hMax > height[k]) height[k] = hMax
        }
      }
    }
  }

  return { n, x0, z0, cell, height, cover, empty, hMin: box.min.y, hMax: box.max.y }
}

/**
 * Marching squares with linear interpolation — the interpolation is what makes
 * a cylinder trace a circle instead of a staircase.
 */
function contour(field: Float32Array, n: number, iso: number): Array<Array<[number, number]>> {
  // Segments keyed by their endpoints so they can be linked into loops
  const segs: Array<[number, number, number, number]> = []
  const lerp = (p: number, q: number, fp: number, fq: number) =>
    fp === fq ? p : p + ((iso - fp) / (fq - fp)) * (q - p)

  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const f00 = field[j * n + i]
      const f10 = field[j * n + i + 1]
      const f11 = field[(j + 1) * n + i + 1]
      const f01 = field[(j + 1) * n + i]
      const code =
        (f00 > iso ? 1 : 0) | (f10 > iso ? 2 : 0) | (f11 > iso ? 4 : 0) | (f01 > iso ? 8 : 0)
      if (code === 0 || code === 15) continue

      // Crossing points on the four edges, in cell coordinates
      const bottom: [number, number] = [lerp(i, i + 1, f00, f10), j]
      const right: [number, number] = [i + 1, lerp(j, j + 1, f10, f11)]
      const top: [number, number] = [lerp(i, i + 1, f01, f11), j + 1]
      const left: [number, number] = [i, lerp(j, j + 1, f00, f01)]

      const push = (p: [number, number], q: [number, number]) => segs.push([p[0], p[1], q[0], q[1]])

      // Every segment is emitted with the inside (field > iso) on its left.
      // The consistent winding is what lets the segments be linked back into
      // closed loops further down — mixed directions tear a loop into chains.
      switch (code) {
        case 1: push(bottom, left); break
        case 2: push(right, bottom); break
        case 3: push(right, left); break
        case 4: push(top, right); break
        case 6: push(top, bottom); break
        case 7: push(top, left); break
        case 8: push(left, top); break
        case 9: push(bottom, top); break
        case 11: push(right, top); break
        case 12: push(left, right); break
        case 13: push(bottom, right); break
        case 14: push(left, bottom); break
        // Saddles: two corners in, two out — draw both corners' segments
        case 5: push(bottom, left); push(top, right); break
        case 10: push(right, bottom); push(left, top); break
      }
    }
  }
  return linkSegments(segs)
}

/** Join loose segments end-to-end into polylines. */
function linkSegments(segs: Array<[number, number, number, number]>): Array<Array<[number, number]>> {
  const key = (x: number, y: number) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`
  const starts = new Map<string, number[]>()
  const used = new Array(segs.length).fill(false)
  segs.forEach(([x1, y1], i) => {
    const k = key(x1, y1)
    const list = starts.get(k)
    if (list) list.push(i)
    else starts.set(k, [i])
  })

  const out: Array<Array<[number, number]>> = []
  for (let s = 0; s < segs.length; s++) {
    if (used[s]) continue
    used[s] = true
    const path: Array<[number, number]> = [
      [segs[s][0], segs[s][1]],
      [segs[s][2], segs[s][3]],
    ]
    // Walk forward while a segment starts where this one ended
    for (;;) {
      const [ex, ey] = path[path.length - 1]
      const cands = starts.get(key(ex, ey))
      const next = cands?.find((i) => !used[i])
      if (next === undefined) break
      used[next] = true
      path.push([segs[next][2], segs[next][3]])
      if (key(segs[next][2], segs[next][3]) === key(path[0][0], path[0][1])) break
    }
    out.push(path)
  }
  return out
}

/** Ramer–Douglas–Peucker. */
function simplify(pts: Array<[number, number]>, eps: number): Array<[number, number]> {
  if (pts.length < 3) return pts
  let maxD = 0
  let idx = 0
  const [ax, ay] = pts[0]
  const [bx, by] = pts[pts.length - 1]
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy) || 1
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len
    if (d > maxD) {
      maxD = d
      idx = i
    }
  }
  if (maxD <= eps) return [pts[0], pts[pts.length - 1]]
  return [
    ...simplify(pts.slice(0, idx + 1), eps).slice(0, -1),
    ...simplify(pts.slice(idx), eps),
  ]
}

/**
 * RDP on a closed loop.
 *
 * Run directly on a loop it collapses the whole thing: first and last point
 * are the same, so every point measures zero distance from the (degenerate)
 * baseline. Split the loop at its farthest point first and simplify the two
 * arcs, which is what keeps a traced circle a circle.
 */
function simplifyClosed(loop: Array<[number, number]>, eps: number): Array<[number, number]> {
  const pts = loop.slice(0, -1) // drop the repeated closing point
  if (pts.length < 4) return pts
  let far = 1
  let farD = -1
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1])
    if (d > farD) {
      farD = d
      far = i
    }
  }
  const first = simplify(pts.slice(0, far + 1), eps)
  const second = simplify([...pts.slice(far), pts[0]], eps)
  return [...first.slice(0, -1), ...second.slice(0, -1)]
}

/** Contours in cell coordinates → model space, simplified and de-noised. */
function toModel(paths: Array<Array<[number, number]>>, r: Raster): Poly[] {
  const eps = 0.45 // cells
  const out: Poly[] = []
  for (const path of paths) {
    if (path.length < 4) continue
    let perim = 0
    for (let i = 1; i < path.length; i++) {
      perim += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1])
    }
    if (perim < MIN_CONTOUR_CELLS) continue
    const closed =
      Math.abs(path[0][0] - path[path.length - 1][0]) < 1e-6 &&
      Math.abs(path[0][1] - path[path.length - 1][1]) < 1e-6
    const simple = closed ? simplifyClosed(path, eps) : simplify(path, eps)
    if (simple.length < 3) continue
    out.push(
      simple.map(([i, j]) => [r.x0 + (i + 0.5) * r.cell, r.z0 + (j + 0.5) * r.cell] as [number, number]),
    )
  }
  return out
}

/** Cells above an iso value — used to skip bands that repeat the previous one. */
function areaAbove(field: Float32Array, iso: number): number {
  let n = 0
  for (let i = 0; i < field.length; i++) if (field[i] > iso) n++
  return n
}

/**
 * Trace a model as it looks from straight above.
 *
 * @param cacheKey stable id (the model URL) — every placed copy shares one
 *                 trace, so this runs once per model.
 */
export function topViewOutline(root: THREE.Object3D, cacheKey?: string): TopView {
  if (cacheKey) {
    const hit = cache.get(cacheKey)
    if (hit) return hit
  }

  const r = rasterize(root)
  if (!r) return { outline: [], details: [] }

  const half = (SUB * SUB) / 2
  const outline = toModel(contour(r.cover, r.n, half), r)

  const details: Poly[] = []
  const span = r.hMax - r.hMin
  if (span > 1e-6) {
    let lastArea = areaAbove(r.cover, half) // the silhouette itself
    for (const band of BANDS) {
      const iso = r.hMin + span * band
      const area = areaAbove(r.height, iso)
      if (area === 0) continue
      // Nearly the same shape as the last one drawn (a table top over its
      // legs, say) — one line is the honest drawing, not four stacked.
      if (Math.abs(area - lastArea) / Math.max(1, lastArea) < BAND_SIMILARITY) continue
      lastArea = area
      details.push(...toModel(contour(r.height, r.n, iso), r))
    }
  }

  const view = { outline, details }
  if (cacheKey && outline.length > 0) cache.set(cacheKey, view)
  return view
}

/** Every point of a top view, for bounds and hit-testing. */
export function topViewPoints(view: TopView): Poly {
  return view.outline.flat()
}
