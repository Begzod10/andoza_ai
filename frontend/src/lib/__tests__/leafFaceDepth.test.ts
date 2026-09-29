/**
 * Where an opening's overlay belongs.
 *
 * The selection border and the hit plane were drawn 20 mm off the WALL face
 * while the leaf hangs at the back of a 200 mm niche — so they floated the
 * better part of a foot in front of the door, which is what "the selected area
 * and the door are in different positions" was.
 */
import { describe, it, expect } from 'vitest'
import { LEAF_FACE_DEPTH } from '@/components/studio/DoorLeaves'
import { OPENING_REVEAL_D } from '@/pages/studio/three-d/constants'

describe('LEAF_FACE_DEPTH', () => {
  it('puts both leaves inside the reveal, not on the wall face', () => {
    for (const d of [LEAF_FACE_DEPTH.door, LEAF_FACE_DEPTH.window]) {
      expect(d).toBeGreaterThan(0.1)
      expect(d).toBeLessThanOrEqual(OPENING_REVEAL_D)
    }
  })

  it('has the door standing a little proud of the sash, as it does in 3D', () => {
    // The leaf is a 40 mm slab hung mid-reveal; the sash sits further back.
    expect(LEAF_FACE_DEPTH.door).toBeLessThan(LEAF_FACE_DEPTH.window)
  })

  it('leaves room for the overlay to sit in front of the leaf', () => {
    // The overlay is drawn at 20 mm in front of these; it must still be
    // inside the niche rather than back out at the wall.
    for (const d of [LEAF_FACE_DEPTH.door, LEAF_FACE_DEPTH.window]) {
      expect(d - 0.02).toBeGreaterThan(0)
    }
  })
})
