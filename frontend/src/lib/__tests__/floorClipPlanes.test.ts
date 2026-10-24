/**
 * A patterned floor's planks are trimmed at the walls by clipping planes,
 * which three.js applies in WORLD space. They were built about the origin,
 * where the room being edited sits — so a neighbour's floor, drawn at its
 * offset in the flat, lost every plank outside the open room's rectangle
 * ("xona qo'shganda pol o'zgarib qolyapti": a dark slab with a strip of
 * planks along the shared wall). The planes follow the floor's world matrix.
 */
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildFloorGroup } from '@/lib/floorGeometry'

const built = () => buildFloorGroup({ id: 'herringbone', settings: {} }, 4, 3, '#a0522d')

describe('a patterned floor\'s clipping planes', () => {
  it('cut at the walls of a room at the origin', () => {
    const b = built()
    const planes = b.material.clippingPlanes!
    expect(planes).toHaveLength(4)
    const keeps = (x: number, z: number) => planes.every((p) => p.distanceToPoint(new THREE.Vector3(x, 0, z)) >= 0)
    expect(keeps(0, 0)).toBe(true)
    expect(keeps(1.9, 1.4)).toBe(true)
    expect(keeps(2.5, 0)).toBe(false)
  })

  it('follow the floor when it is drawn elsewhere in the flat', () => {
    const b = built()
    b.placeClipPlanes(new THREE.Matrix4().makeTranslation(9, 0, 2))
    const planes = b.material.clippingPlanes!
    const keeps = (x: number, z: number) => planes.every((p) => p.distanceToPoint(new THREE.Vector3(x, 0, z)) >= 0)
    // The room now spans x 7 … 11, z 0.5 … 3.5.
    expect(keeps(9, 2)).toBe(true)
    expect(keeps(10.9, 3.4)).toBe(true)
    expect(keeps(0, 0)).toBe(false)
    expect(keeps(6.9, 2)).toBe(false)
    // Every material shares the same planes.
    for (const m of b.materials) expect(m.clippingPlanes).toBe(planes)
    // And placing again at the origin puts them back exactly.
    b.placeClipPlanes(new THREE.Matrix4())
    expect(keeps(0, 0)).toBe(true)
    expect(keeps(9, 2)).toBe(false)
  })
})
