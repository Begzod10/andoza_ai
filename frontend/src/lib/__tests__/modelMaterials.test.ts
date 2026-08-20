/**
 * The diffuse-only pass, checked on the failure it exists for: a model that
 * arrives claiming to be metal and renders as a mirror of the sky instead of
 * as a chair.
 */
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { toDiffuseOnly, applyDiffuseOnly } from '../modelMaterials'

function tex(): THREE.Texture {
  return new THREE.Texture()
}

describe('toDiffuseOnly', () => {
  it('keeps the colour map and drops every other one', () => {
    const m = new THREE.MeshStandardMaterial({
      map: tex(),
      normalMap: tex(),
      roughnessMap: tex(),
      metalnessMap: tex(),
      displacementMap: tex(),
      aoMap: tex(),
      lightMap: tex(),
      envMap: tex(),
      bumpMap: tex(),
    })
    const out = toDiffuseOnly(m) as THREE.MeshStandardMaterial

    expect(out.map).toBe(m.map)
    for (const slot of [
      'normalMap', 'roughnessMap', 'metalnessMap', 'displacementMap',
      'aoMap', 'lightMap', 'envMap', 'bumpMap',
    ] as const) {
      expect(out[slot]).toBeNull()
    }
  })

  it('kills the metalness that turns an HDRI into white paint', () => {
    // glTF's metallicFactor defaults to 1, so an exporter that writes no PBR
    // block at all hands us a full mirror.
    const out = toDiffuseOnly(new THREE.MeshStandardMaterial({ metalness: 1, roughness: 1 }))
    expect((out as THREE.MeshStandardMaterial).metalness).toBe(0)
  })

  it('holds a mirror-smooth surface back from reflecting the sky', () => {
    const out = toDiffuseOnly(
      new THREE.MeshStandardMaterial({ roughness: 0 }),
    ) as THREE.MeshStandardMaterial
    expect(out.roughness).toBeGreaterThanOrEqual(0.35)
  })

  it('leaves an already-matte roughness alone', () => {
    const out = toDiffuseOnly(
      new THREE.MeshStandardMaterial({ roughness: 0.8 }),
    ) as THREE.MeshStandardMaterial
    expect(out.roughness).toBeCloseTo(0.8, 6)
  })

  it('keeps alpha, so a curtain does not come back as a wall', () => {
    const alphaMap = tex()
    const out = toDiffuseOnly(
      new THREE.MeshStandardMaterial({ alphaMap, transparent: true, opacity: 0.5 }),
    ) as THREE.MeshStandardMaterial
    expect(out.alphaMap).toBe(alphaMap)
    expect(out.transparent).toBe(true)
    expect(out.opacity).toBeCloseTo(0.5, 6)
  })

  it('carries refraction across as plain alpha instead of a solid slab', () => {
    const m = new THREE.MeshPhysicalMaterial({ transmission: 0.9, opacity: 1 })
    const out = toDiffuseOnly(m) as THREE.MeshPhysicalMaterial
    expect(out.transmission).toBe(0)
    expect(out.transparent).toBe(true)
    expect(out.opacity).toBeLessThan(1)
    expect(out.opacity).toBeGreaterThan(0)
  })

  it('clears the physical extras that add their own sheen', () => {
    const out = toDiffuseOnly(
      new THREE.MeshPhysicalMaterial({ clearcoat: 1, sheen: 1, iridescence: 1 }),
    ) as THREE.MeshPhysicalMaterial
    expect(out.clearcoat).toBe(0)
    expect(out.sheen).toBe(0)
    expect(out.iridescence).toBe(0)
  })

  it('forces the colour map to sRGB — linear decoding looks like no texture', () => {
    const m = new THREE.MeshStandardMaterial({ map: tex() })
    m.map!.colorSpace = THREE.LinearSRGBColorSpace
    const out = toDiffuseOnly(m) as THREE.MeshStandardMaterial
    expect(out.map!.colorSpace).toBe(THREE.SRGBColorSpace)
  })

  it('copies rather than edits — shared materials must not bleed', () => {
    const m = new THREE.MeshStandardMaterial({ metalness: 1, normalMap: tex() })
    const out = toDiffuseOnly(m)
    expect(out).not.toBe(m)
    expect(m.metalness).toBe(1)
    expect(m.normalMap).not.toBeNull()
  })

  it('keeps the name the colour-override lookup is keyed on', () => {
    const m = new THREE.MeshStandardMaterial({ name: 'Wood_Oak' })
    expect(toDiffuseOnly(m).name).toBe('Wood_Oak')
  })

  it('preserves colour, vertex colours and side', () => {
    const m = new THREE.MeshStandardMaterial({
      color: 0x8b5a2b,
      vertexColors: true,
      side: THREE.DoubleSide,
    })
    const out = toDiffuseOnly(m) as THREE.MeshStandardMaterial
    expect(out.color.getHex()).toBe(0x8b5a2b)
    expect(out.vertexColors).toBe(true)
    expect(out.side).toBe(THREE.DoubleSide)
  })

  it('passes materials it does not understand straight through', () => {
    const m = new THREE.MeshBasicMaterial()
    expect(toDiffuseOnly(m)).toBe(m)
  })
})

describe('applyDiffuseOnly', () => {
  it('walks the whole model', () => {
    const root = new THREE.Group()
    const child = new THREE.Group()
    const a = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ metalness: 1 }))
    const b = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ metalness: 1 }))
    child.add(b)
    root.add(a, child)

    applyDiffuseOnly(root)

    expect((a.material as THREE.MeshStandardMaterial).metalness).toBe(0)
    expect((b.material as THREE.MeshStandardMaterial).metalness).toBe(0)
  })

  it('keeps a multi-material mesh as an array, aligned with its groups', () => {
    const mats = [
      new THREE.MeshStandardMaterial({ name: 'a', metalness: 1 }),
      new THREE.MeshStandardMaterial({ name: 'b', metalness: 1 }),
    ]
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), mats)
    applyDiffuseOnly(mesh)

    const out = mesh.material as THREE.MeshStandardMaterial[]
    expect(Array.isArray(out)).toBe(true)
    expect(out.map((m) => m.name)).toEqual(['a', 'b'])
    expect(out.every((m) => m.metalness === 0)).toBe(true)
  })
})
