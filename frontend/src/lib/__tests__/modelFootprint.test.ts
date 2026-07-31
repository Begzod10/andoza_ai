/**
 * The plan symbol has to land exactly where the 3D viewport puts the model,
 * so these tests check the placement maths against real THREE transforms
 * rather than against a hand-written expectation of the same formula.
 */
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { hullBounds, rectHull } from '../modelFootprint'

/** Where THREE actually puts a model-space point for a placed item. */
function threePlacement(p: [number, number], rotation: number, scale: number) {
  const obj = new THREE.Object3D()
  obj.rotation.set(0, rotation, 0)
  obj.scale.setScalar(scale)
  obj.updateMatrixWorld(true)
  const v = new THREE.Vector3(p[0], 0, p[1]).applyMatrix4(obj.matrixWorld)
  return [v.x, v.z] as [number, number]
}

describe('rectHull', () => {
  it('is centred on the origin and closes a rectangle', () => {
    expect(rectHull(2, 1)).toEqual([
      [-1, -0.5],
      [1, -0.5],
      [1, 0.5],
      [-1, 0.5],
    ])
  })
})

describe('hullBounds', () => {
  it('matches THREE for the unrotated case', () => {
    const b = hullBounds(rectHull(2, 1), 0, 1000)
    expect([b.minX, b.maxX, b.minZ, b.maxZ]).toEqual([-1000, 1000, -500, 500])
  })

  it('matches THREE for arbitrary yaw and scale', () => {
    const hull = rectHull(2, 1)
    for (const rot of [0.3, Math.PI / 2, 2.1, -1.4]) {
      const scale = 0.5
      const placed = hull.map((p) => threePlacement(p, rot, scale))
      const b = hullBounds(hull, rot, scale)
      expect(b.minX).toBeCloseTo(Math.min(...placed.map(([x]) => x)))
      expect(b.maxX).toBeCloseTo(Math.max(...placed.map(([x]) => x)))
      expect(b.minZ).toBeCloseTo(Math.min(...placed.map(([, z]) => z)))
      expect(b.maxZ).toBeCloseTo(Math.max(...placed.map(([, z]) => z)))
    }
  })

  it('swaps the extents of a long model turned 90°', () => {
    const b = hullBounds(rectHull(2, 1), Math.PI / 2, 1)
    expect(b.maxX).toBeCloseTo(0.5)
    expect(b.maxZ).toBeCloseTo(1)
  })
})
