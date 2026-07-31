/**
 * The plan symbol must be the model seen from straight above — the same thing
 * an orthographic top camera would draw. These tests build small models whose
 * top view is known by hand (a slab on legs, a chair, a cylinder, a ring) and
 * check the trace against it.
 */
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { topViewOutline, topViewPoints, type Poly } from '../modelTopView'

function bbox(polys: Poly[]) {
  const pts = polys.flat()
  const xs = pts.map(([x]) => x)
  const zs = pts.map(([, z]) => z)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  }
}

function mesh(w: number, h: number, d: number, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d))
  m.position.set(x, y, z)
  return m
}

describe('topViewOutline', () => {
  it('traces a box as its rectangle', () => {
    const root = new THREE.Group()
    root.add(mesh(2, 1, 1))

    const view = topViewOutline(root)
    expect(view.outline).toHaveLength(1)
    const b = bbox(view.outline)
    expect(b.minX).toBeCloseTo(-1, 1)
    expect(b.maxX).toBeCloseTo(1, 1)
    expect(b.minZ).toBeCloseTo(-0.5, 1)
    expect(b.maxZ).toBeCloseTo(0.5, 1)
  })

  it('shows the table top over its legs, not the legs', () => {
    const root = new THREE.Group()
    root.add(mesh(2, 0.08, 1, 0, 0.75, 0)) // top
    for (const [x, z] of [[-0.9, -0.4], [0.9, -0.4], [-0.9, 0.4], [0.9, 0.4]]) {
      root.add(mesh(0.08, 0.7, 0.08, x, 0.35, z))
    }

    const b = bbox(topViewOutline(root).outline)
    expect(b.maxX - b.minX).toBeCloseTo(2, 1)
    expect(b.maxZ - b.minZ).toBeCloseTo(1, 1)
  })

  it('draws the internal edges of a chair: seat, arms and back', () => {
    const root = new THREE.Group()
    root.add(mesh(0.9, 0.45, 0.9, 0, 0.22, 0)) // seat block
    root.add(mesh(0.9, 0.5, 0.15, 0, 0.7, -0.38)) // back
    root.add(mesh(0.12, 0.25, 0.9, -0.39, 0.57, 0)) // left arm
    root.add(mesh(0.12, 0.25, 0.9, 0.39, 0.57, 0)) // right arm

    const view = topViewOutline(root)
    // Outer border is the seat's full square
    const b = bbox(view.outline)
    expect(b.maxX - b.minX).toBeCloseTo(0.9, 1)
    expect(b.maxZ - b.minZ).toBeCloseTo(0.9, 1)
    // and the arms/back show up as line work inside it
    expect(view.details.length).toBeGreaterThan(0)
    const d = bbox(view.details)
    expect(d.maxX - d.minX).toBeLessThanOrEqual(b.maxX - b.minX + 0.05)
    expect(d.minZ).toBeGreaterThanOrEqual(b.minZ - 0.05)
  })

  it('traces a cylinder as a circle, not a polygon of the hull', () => {
    const root = new THREE.Group()
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.6, 48))
    root.add(cyl)

    const poly = topViewOutline(root).outline[0]
    const radii = poly.map(([x, z]) => Math.hypot(x, z))
    const min = Math.min(...radii)
    const max = Math.max(...radii)
    expect(min).toBeGreaterThan(0.47)
    expect(max).toBeLessThan(0.53)
  })

  it('keeps a hole in the silhouette', () => {
    const root = new THREE.Group()
    // Four bars around an empty middle
    root.add(mesh(2, 0.2, 0.3, 0, 0, -0.85))
    root.add(mesh(2, 0.2, 0.3, 0, 0, 0.85))
    root.add(mesh(0.3, 0.2, 2, -0.85, 0, 0))
    root.add(mesh(0.3, 0.2, 2, 0.85, 0, 0))

    const view = topViewOutline(root)
    expect(view.outline.length).toBe(2) // outer border + the hole
    const areas = view.outline.map((p) => Math.abs(shoelace(p)))
    expect(Math.max(...areas)).toBeCloseTo(4, 0)
    expect(Math.min(...areas)).toBeCloseTo(1.96, 0) // 1.4 × 1.4 inner void
  })

  it('keeps the model origin, so an off-centre model stays off-centre', () => {
    const root = new THREE.Group()
    root.add(mesh(1, 1, 1, 2, 0, 0))

    const b = bbox(topViewOutline(root).outline)
    expect(b.minX).toBeCloseTo(1.5, 1)
    expect(b.maxX).toBeCloseTo(2.5, 1)
  })

  it('ignores hidden meshes', () => {
    const root = new THREE.Group()
    root.add(mesh(1, 1, 1))
    const ghost = mesh(10, 1, 10)
    ghost.visible = false
    root.add(ghost)

    const b = bbox(topViewOutline(root).outline)
    expect(b.maxX).toBeCloseTo(0.5, 1)
  })

  it('returns nothing to draw for an empty object', () => {
    const view = topViewOutline(new THREE.Group())
    expect(view.outline).toEqual([])
    expect(topViewPoints(view)).toEqual([])
  })
})

function shoelace(poly: Poly): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i]
    const [x2, z2] = poly[(i + 1) % poly.length]
    a += x1 * z2 - x2 * z1
  }
  return a / 2
}
