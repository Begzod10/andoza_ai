/**
 * The shell has one job: leave the sun no way in that the room does not have.
 *
 * These check the two properties the leak came from — that the shell is a
 * closed solid around the room with real thickness, and that its pieces
 * actually overlap rather than meeting along a line — plus the one property
 * that would make it useless the other way, that openings still let light
 * through.
 */
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildShellGeometry, SHELL_T } from '../shadowShell'
import type { ResolvedElMm } from '../shadowShell'

const W = 5
const D = 4
const H = 3

function bare() {
  return buildShellGeometry({ W, D, H, elementsA: [], elementsB: [], elementsC: [], elementsD: [] })!
}

/** Does any triangle-bearing box in the merged geometry contain this point? */
function solidAt(geo: THREE.BufferGeometry, p: THREE.Vector3): boolean {
  // The merge is a soup of boxes, so test against each 24-vertex box in turn.
  const pos = geo.getAttribute('position')
  const box = new THREE.Box3()
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i += 24) {
    box.makeEmpty()
    for (let j = i; j < i + 24 && j < pos.count; j++) {
      box.expandByPoint(v.fromBufferAttribute(pos, j))
    }
    if (box.containsPoint(p)) return true
  }
  return false
}

describe('shadow shell', () => {
  it('wraps the room without intruding into it', () => {
    const geo = bare()
    geo.computeBoundingBox()
    const b = geo.boundingBox!
    // Reaches past every interior face…
    expect(b.min.x).toBeLessThanOrEqual(-W / 2 - SHELL_T + 1e-6)
    expect(b.max.x).toBeGreaterThanOrEqual(W / 2 + SHELL_T - 1e-6)
    expect(b.min.z).toBeLessThanOrEqual(-D / 2 - SHELL_T + 1e-6)
    expect(b.max.z).toBeGreaterThanOrEqual(D / 2 + SHELL_T - 1e-6)
    // …and over the ceiling, without hanging below the floor
    expect(b.max.y).toBeGreaterThanOrEqual(H + SHELL_T - 1e-6)
    expect(b.min.y).toBeCloseTo(0)
  })

  it('leaves the middle of the room empty', () => {
    expect(solidAt(bare(), new THREE.Vector3(0, H / 2, 0))).toBe(false)
  })

  it('is solid through the full thickness of every wall', () => {
    const geo = bare()
    const mid = SHELL_T / 2
    expect(solidAt(geo, new THREE.Vector3(0, H / 2, -(D / 2 + mid)))).toBe(true)  // A
    expect(solidAt(geo, new THREE.Vector3(0, H / 2, D / 2 + mid))).toBe(true)     // C
    expect(solidAt(geo, new THREE.Vector3(W / 2 + mid, H / 2, 0))).toBe(true)     // B
    expect(solidAt(geo, new THREE.Vector3(-(W / 2 + mid), H / 2, 0))).toBe(true)  // D
  })

  it('fills every corner — the seam the light used to come down', () => {
    const geo = bare()
    const mid = SHELL_T / 2
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const p = new THREE.Vector3(sx * (W / 2 + mid), H / 2, sz * (D / 2 + mid))
        expect(solidAt(geo, p)).toBe(true)
      }
    }
  })

  it('laps the roof over the wall tops instead of butting against them', () => {
    const geo = bare()
    // A point inside the top of a wall slab must also be inside the roof slab,
    // which is only true if the two overlap.
    const p = new THREE.Vector3(0, H + SHELL_T / 2, -(D / 2 + SHELL_T / 2))
    expect(solidAt(geo, p)).toBe(true)
    // And directly over the middle of the room, the roof alone is solid.
    expect(solidAt(geo, new THREE.Vector3(0, H + SHELL_T / 2, 0))).toBe(true)
  })

  it('cuts openings so daylight still comes through a window', () => {
    // A 1.2 m window, 1 m sill, 1.4 m tall, centred on wall A's 5 m span
    const window_: ResolvedElMm = { position: 1900, width: 1200, height: 1400, sill_height: 1000 }
    const geo = buildShellGeometry({
      W, D, H, elementsA: [window_], elementsB: [], elementsC: [], elementsD: [],
    })!
    const z = -(D / 2 + SHELL_T / 2)
    // Middle of the glass: open
    expect(solidAt(geo, new THREE.Vector3(0, 1.7, z))).toBe(false)
    // Spandrel below it and lintel above it: still solid
    expect(solidAt(geo, new THREE.Vector3(0, 0.5, z))).toBe(true)
    expect(solidAt(geo, new THREE.Vector3(0, 2.7, z))).toBe(true)
    // And the pier beside it
    expect(solidAt(geo, new THREE.Vector3(-2.0, 1.7, z))).toBe(true)
  })

  it('keeps a doorway open all the way to the floor', () => {
    const door: ResolvedElMm = { position: 2000, width: 900, height: 2100, sill_height: 0 }
    const geo = buildShellGeometry({
      W, D, H, elementsA: [door], elementsB: [], elementsC: [], elementsD: [],
    })!
    const z = -(D / 2 + SHELL_T / 2)
    expect(solidAt(geo, new THREE.Vector3(-0.05, 0.2, z))).toBe(false)
    expect(solidAt(geo, new THREE.Vector3(-0.05, 1.5, z))).toBe(false)
    // Lintel above the door remains
    expect(solidAt(geo, new THREE.Vector3(-0.05, 2.6, z))).toBe(true)
  })
})
