/**
 * Where an opening's leaf sits in its own hole, and so where anything drawn
 * "on" it — a selection border, a hit plane — belongs.
 *
 * Two bugs met here. The overlay was drawn at the WALL face while the leaf
 * hung at the back of a 200 mm reveal, so the highlight floated the better
 * part of a foot in front of the door. And the door had no business being back
 * there at all: a door is hung at the room end of its opening, just inside the
 * architrave, which is what left a shaft of jamb between the casing and the
 * leaf and read as the two being in different places.
 */
import { describe, it, expect } from 'vitest'
import { LEAF_FACE_DEPTH } from '@/components/studio/DoorLeaves'
import { OPENING_REVEAL_D } from '@/pages/studio/three-d/constants'

/** The architrave stands this far proud of the wall — see WallComponents. */
const ARCHITRAVE_T = 0.01

describe('LEAF_FACE_DEPTH', () => {
  it('keeps both leaves within the thickness of the wall', () => {
    for (const d of [LEAF_FACE_DEPTH.door, LEAF_FACE_DEPTH.window]) {
      expect(d).toBeGreaterThan(0)
      expect(d).toBeLessThanOrEqual(OPENING_REVEAL_D)
    }
  })

  it('hangs the door at the room end, just inside its casing', () => {
    // Not down the far end of the niche: the casing is on the wall face, and
    // a door fitted 200 mm behind it reads as a separate object.
    expect(LEAF_FACE_DEPTH.door).toBeLessThan(0.05)
  })

  it('keeps the window sash deep in its reveal, where a sash belongs', () => {
    expect(LEAF_FACE_DEPTH.window).toBeGreaterThan(OPENING_REVEAL_D * 0.8)
    expect(LEAF_FACE_DEPTH.window).toBeGreaterThan(LEAF_FACE_DEPTH.door)
  })

  it('leaves the door overlay tucked under the architrave', () => {
    // The overlay sits 20 mm in front of the leaf's face. With the leaf at the
    // room end that lands slightly proud of the wall — which is fine, as long
    // as it stays behind the casing rather than floating in the room.
    const proud = 0.02 - LEAF_FACE_DEPTH.door
    expect(proud).toBeLessThan(ARCHITRAVE_T)
  })

  it('leaves the window overlay inside the reveal', () => {
    expect(LEAF_FACE_DEPTH.window - 0.02).toBeGreaterThan(0)
  })
})
