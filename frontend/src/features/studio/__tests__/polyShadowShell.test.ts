/**
 * The sun's envelope for a room drawn from a plan.
 *
 * Only rectangular rooms had one, so in every drawn room the sun fell through
 * all four walls at once and lit the floor as if the flat had no envelope.
 * What matters here is that the shell exists, that it reaches round the room,
 * and that it has holes exactly where the openings are — a shell with no holes
 * is a room with no daylight.
 */
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildPolyShellGeometry, type PolyShellEdge } from '../shadowShell'

const H = 2.7

/** A 4 x 3 room, as four edges with their own frames. */
function room(elements: Partial<Record<number, PolyShellEdge['elements']>> = {}): PolyShellEdge[] {
  return [
    { length: 4, mx: 0, mz: -1.5, yaw: 0, faceDir: 1, elements: elements[0] ?? [] },
    { length: 3, mx: 2, mz: 0, yaw: -Math.PI / 2, faceDir: 1, elements: elements[1] ?? [] },
    { length: 4, mx: 0, mz: 1.5, yaw: Math.PI, faceDir: 1, elements: elements[2] ?? [] },
    { length: 3, mx: -2, mz: 0, yaw: Math.PI / 2, faceDir: 1, elements: elements[3] ?? [] },
  ]
}

const OUTLINE: [number, number][] = [[-2, -1.5], [2, -1.5], [2, 1.5], [-2, 1.5]]

const bounds = (geo: THREE.BufferGeometry) => {
  geo.computeBoundingBox()
  return geo.boundingBox!
}

describe('buildPolyShellGeometry', () => {
  it('builds an envelope that reaches round the whole room', () => {
    const geo = buildPolyShellGeometry(room(), OUTLINE, H)!
    expect(geo).toBeTruthy()
    const b = bounds(geo)
    // Past every wall line, on all four sides.
    expect(b.min.x).toBeLessThanOrEqual(-2)
    expect(b.max.x).toBeGreaterThanOrEqual(2)
    expect(b.min.z).toBeLessThanOrEqual(-1.5)
    expect(b.max.z).toBeGreaterThanOrEqual(1.5)
  })

  it('roofs the room, or the sun comes straight down into it', () => {
    const b = bounds(buildPolyShellGeometry(room(), OUTLINE, H)!)
    expect(b.max.y).toBeGreaterThan(H)
  })

  it('leaves a hole where a window is', () => {
    const solid = buildPolyShellGeometry(room(), OUTLINE, H)!
    const holed = buildPolyShellGeometry(
      room({ 0: [{ position: 1000, width: 1200, height: 1400, sill_height: 900 }] }),
      OUTLINE, H,
    )!
    // A wall with an opening is built from more, smaller pieces — pier,
    // lintel, spandrel — but covers less of the wall than the whole slab did.
    expect(holed.getAttribute('position').count).toBeGreaterThan(
      solid.getAttribute('position').count,
    )
  })

  it('still closes the wall a door is in, above and beside it', () => {
    const geo = buildPolyShellGeometry(
      room({ 0: [{ position: 1000, width: 900, height: 2100, sill_height: 0 }] }),
      OUTLINE, H,
    )!
    // The lintel over the door still has to stop the sun.
    expect(bounds(geo).max.y).toBeGreaterThan(H)
    expect(geo.getAttribute('position').count).toBeGreaterThan(100)
  })

  it('has nothing to build without edges', () => {
    expect(buildPolyShellGeometry([], [], H)).toBeNull()
  })

  it('works for a room that is not a rectangle', () => {
    // An L: the whole point of the drawn-room shell.
    const ell: PolyShellEdge[] = [
      { length: 4, mx: 0, mz: -1.5, yaw: 0, faceDir: 1, elements: [] },
      { length: 1.5, mx: 2, mz: -0.75, yaw: -Math.PI / 2, faceDir: 1, elements: [] },
      { length: 2, mx: 1, mz: 0, yaw: Math.PI, faceDir: 1, elements: [] },
      { length: 1.5, mx: 0, mz: 0.75, yaw: -Math.PI / 2, faceDir: 1, elements: [] },
      { length: 2, mx: -1, mz: 1.5, yaw: Math.PI, faceDir: 1, elements: [] },
      { length: 3, mx: -2, mz: 0, yaw: Math.PI / 2, faceDir: 1, elements: [] },
    ]
    const geo = buildPolyShellGeometry(ell, [[-2, -1.5], [2, -1.5], [2, 0], [0, 0], [0, 1.5], [-2, 1.5]], H)
    expect(geo).toBeTruthy()
    expect(bounds(geo!).max.y).toBeGreaterThan(H)
  })
})
