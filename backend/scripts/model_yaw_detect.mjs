// Which way a furniture model faces, for the model_yaw backfill (scripts/model_yaw_backfill.py).
//
//   node model_yaw_detect.mjs <file.glb>...      one JSON line per file: {file, yaw, detected, size: [x, y, z]}
//                                                 (or {file, error}; the exit code is then 1)
//   node model_yaw_detect.mjs --points cases.json [{name, yaw, detected}] for each {name, points} case
//
// yawFromPoints mirrors frontend/src/lib/modelYaw.ts, so the backfill and the upload form agree: keep
// the two in step (tests/test_model_yaw_backfill.py checks both against the same fixture). GLB mode
// needs the global gltf-transform CLI of the api/converter image; --points needs plain node only.
import fs from 'node:fs'
import { createRequire } from 'node:module'

/** The top share of the model's height read as its back (a headboard, a sofa's back). */
const BACK_SHARE = 0.25
/** A back shifted less than this share of the size on both axes is no back at all: the model is symmetric. */
const MIN_OFFSET = 0.1
/** Vertices read per mesh: plenty for a mean, and a 500k-vertex scan stays quick. */
const MAX_SAMPLES = 5000

const NOT_DETECTED = { yaw: 0, detected: false }

export function yawFromPoints(points) {
  if (points.length === 0) return NOT_DETECTED
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const p of points) {
    for (let i = 0; i < 3; i++) {
      if (p[i] < min[i]) min[i] = p[i]
      if (p[i] > max[i]) max[i] = p[i]
    }
  }
  const [sizeX, sizeY, sizeZ] = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
  if (!(sizeY > 0)) return NOT_DETECTED

  const top = max[1] - BACK_SHARE * sizeY
  let sumX = 0, sumZ = 0, n = 0
  for (const p of points) {
    if (p[1] < top) continue
    sumX += p[0]; sumZ += p[2]; n++
  }
  const dx = sizeX > 0 ? (sumX / n - (min[0] + max[0]) / 2) / sizeX : 0
  const dz = sizeZ > 0 ? (sumZ / n - (min[2] + max[2]) / 2) / sizeZ : 0
  if (Math.abs(dx) < MIN_OFFSET && Math.abs(dz) < MIN_OFFSET) return NOT_DETECTED

  if (Math.abs(dx) > Math.abs(dz)) return { yaw: dx > 0 ? 90 : 270, detected: true }
  return { yaw: dz < 0 ? 0 : 180, detected: true }
}

function boxSize(points) {
  if (points.length === 0) return [0, 0, 0]
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const p of points) {
    for (let i = 0; i < 3; i++) {
      if (p[i] < min[i]) min[i] = p[i]
      if (p[i] > max[i]) max[i] = p[i]
    }
  }
  return max.map((v, i) => v - min[i])
}

/** Applies a column-major 4x4 matrix (glTF / gl-matrix layout) to a point. */
function transform(m, [x, y, z]) {
  const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
  ]
}

/** Loaded only for GLB files, so --points runs where gltf-transform is not installed. */
async function openIO() {
  const require = createRequire('/usr/local/lib/node_modules/@gltf-transform/cli/package.json')
  const { NodeIO } = require('@gltf-transform/core')
  const { ALL_EXTENSIONS } = require('@gltf-transform/extensions')
  const { MeshoptDecoder } = require('meshoptimizer')
  await MeshoptDecoder.ready
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
}

/**
 * The points of the scene three.js would show, in the model's own frame: each node's world matrix
 * with the scene root as identity, at most MAX_SAMPLES per primitive (GLTFLoader makes one Mesh per
 * primitive, and the studio caps each Mesh).
 */
function scenePoints(doc) {
  const root = doc.getRoot()
  const scene = root.getDefaultScene() || root.listScenes()[0]
  const points = []
  if (!scene) return points
  scene.traverse((node) => {
    const mesh = node.getMesh()
    if (!mesh) return
    const m = node.getWorldMatrix()
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')
      if (!pos) continue
      const count = pos.getCount()
      const step = Math.max(1, Math.ceil(count / MAX_SAMPLES))
      const el = [0, 0, 0]
      for (let i = 0; i < count; i += step) points.push(transform(m, pos.getElement(i, el)))
    }
  })
  return points
}

async function main(args) {
  if (args[0] === '--points') {
    const cases = JSON.parse(fs.readFileSync(args[1], 'utf8'))
    console.log(JSON.stringify(cases.map((c) => ({ name: c.name, ...yawFromPoints(c.points) }))))
    return 0
  }
  if (args.length === 0) {
    console.error('usage: node model_yaw_detect.mjs <file.glb>... | --points <cases.json>')
    return 2
  }
  let failed = false
  let io = null
  for (const file of args) {
    try {
      io ??= await openIO()
      const points = scenePoints(await io.read(file))
      const { yaw, detected } = yawFromPoints(points)
      console.log(JSON.stringify({ file, yaw, detected, size: boxSize(points) }))
    } catch (err) {
      failed = true
      console.log(JSON.stringify({ file, error: String(err?.message ?? err) }))
    }
  }
  return failed ? 1 : 0
}

process.exitCode = await main(process.argv.slice(2))
