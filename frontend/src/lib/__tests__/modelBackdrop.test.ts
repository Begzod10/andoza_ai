/**
 * The backdrop stripper deletes the studio cyclorama that asset packs bundle
 * with a model. A backdrop is only meaningful relative to something it sits
 * behind, so these tests pin the boundary: it may never consume the model
 * itself — a rug or any other flat, floor-hugging piece IS the model.
 */
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { stripBackdropPlanes } from '../modelConverter'

/** A box mesh of the given size, centred at `at`. */
function box(w: number, h: number, d: number, at: [number, number, number] = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial())
  mesh.position.set(...at)
  return mesh
}

/** A subdivided flat sheet — the topology a cloth-sim backdrop ships with. */
function sheet(w: number, d: number, at: [number, number, number] = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d, 40, 40), new THREE.MeshStandardMaterial())
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(...at)
  return mesh
}

function meshCount(root: THREE.Object3D) {
  let n = 0
  root.traverse((c) => { if ((c as THREE.Mesh).isMesh) n++ })
  return n
}

describe('stripBackdropPlanes', () => {
  it('keeps a lone rug — a flat, floor-level model is not a backdrop', () => {
    const root = new THREE.Group()
    root.add(sheet(2, 3)) // 2×3 m rug, no thickness
    root.updateMatrixWorld(true)

    expect(stripBackdropPlanes(root)).toBe(0)
    expect(meshCount(root)).toBe(1)
  })

  it('keeps every mesh when they are all flat and floor-level', () => {
    const root = new THREE.Group()
    root.add(sheet(2, 3))
    root.add(sheet(1.8, 2.8, [0, 0.01, 0])) // a rug's backing layer
    root.updateMatrixWorld(true)

    expect(stripBackdropPlanes(root)).toBe(0)
    expect(meshCount(root)).toBe(2)
  })

  it('still strips a ground cloth sitting under real furniture', () => {
    const root = new THREE.Group()
    root.add(sheet(6, 6)) // scene-sized ground cloth
    root.add(box(1, 0.8, 1, [0, 0.4, 0])) // the actual piece
    root.updateMatrixWorld(true)

    expect(stripBackdropPlanes(root)).toBe(1)
    expect(meshCount(root)).toBe(1)
  })
})
