/**
 * A socket must not end up on a door. The interesting part is that it is
 * allowed to be under a window — the rule is about the two overlapping both
 * across the wall and up it, not about openings in general.
 */
import { describe, it, expect } from 'vitest'
import {
  blockedCentreSpans, clearOfOpenings, OPENING_CLEARANCE_MM,
  type DeviceBand, type OpeningLike,
} from '../electricalClearance'

// A 4 m wall with a 900 mm door from 1000 to 1900.
const DOOR: OpeningLike = { position: 1000, width: 900, sill_height: 0, height: 2100 }
// ...and a window from 2500 to 3700, sill at 900.
const WINDOW: OpeningLike = { position: 2500, width: 1200, sill_height: 900, height: 1400 }
const WALL_MM = 4000

/** A socket: 80 mm across, 300 mm off the floor. */
const socket: DeviceBand = { widthMm: 80, bottomMm: 300, topMm: 380 }
/** A switch at handle height. */
const sw: DeviceBand = { widthMm: 80, bottomMm: 900, topMm: 980 }

describe('what blocks a device', () => {
  it('blocks the door, widened by half the device and the clearance', () => {
    const pad = 40 + OPENING_CLEARANCE_MM
    expect(blockedCentreSpans([DOOR], socket)).toEqual([[1000 - pad, 1900 + pad]])
  })

  it('lets a socket sit under a window — the sill is above it', () => {
    expect(blockedCentreSpans([WINDOW], socket)).toEqual([])
  })

  it('blocks that same window for a switch at handle height', () => {
    expect(blockedCentreSpans([WINDOW], sw)).toHaveLength(1)
  })

  it('treats a device that ends exactly at the sill as beside it, not on it', () => {
    const upTo900: DeviceBand = { widthMm: 80, bottomMm: 700, topMm: 900 }
    expect(blockedCentreSpans([WINDOW], upTo900)).toEqual([])
  })

  it('merges a door and window that would otherwise overlap', () => {
    const near: OpeningLike = { position: 1950, width: 400, sill_height: 0, height: 2100 }
    expect(blockedCentreSpans([DOOR, near], socket)).toHaveLength(1)
  })

  it('ignores an opening of no width', () => {
    expect(blockedCentreSpans([{ ...DOOR, width: 0 }], socket)).toEqual([])
  })
})

describe('where the device ends up', () => {
  it('leaves a position that is already clear alone', () => {
    expect(clearOfOpenings(500, socket, [DOOR], WALL_MM)).toBe(500)
  })

  it('pushes a socket dropped on the door off its nearer jamb', () => {
    const pos = clearOfOpenings(1100, socket, [DOOR], WALL_MM)
    expect(pos).toBe(1000 - (40 + OPENING_CLEARANCE_MM))
  })

  it('pushes out the far side when the drag went past the middle', () => {
    const pos = clearOfOpenings(1800, socket, [DOOR], WALL_MM)
    expect(pos).toBe(1900 + (40 + OPENING_CLEARANCE_MM))
    // ...which is the point of choosing the nearer edge: dragging across the
    // door comes out the other side instead of sticking where it went in.
  })

  it('still keeps a socket under the window', () => {
    expect(clearOfOpenings(3000, socket, [DOOR, WINDOW], WALL_MM)).toBe(3000)
  })

  it('keeps the switch off the window it would cross', () => {
    const pos = clearOfOpenings(3000, sw, [WINDOW], WALL_MM)
    expect(pos === 2500 - 70 || pos === 3700 + 70).toBe(true)
  })

  it('still clamps to the wall itself', () => {
    expect(clearOfOpenings(-500, socket, [], WALL_MM)).toBe(100)
    expect(clearOfOpenings(9999, socket, [], WALL_MM)).toBe(3900)
  })

  it('does not park a device outside the wall to escape an opening', () => {
    // A door hard against the left end: the only way out is to the right.
    const corner: OpeningLike = { position: 0, width: 900, sill_height: 0, height: 2100 }
    const pos = clearOfOpenings(200, socket, [corner], WALL_MM)
    expect(pos).toBeGreaterThanOrEqual(100)
    expect(pos).toBe(900 + 70)
  })

  it('gives up gracefully on a wall that is opening end to end', () => {
    const glazed: OpeningLike = { position: -100, width: WALL_MM + 200, sill_height: 0, height: 2100 }
    expect(clearOfOpenings(1500, socket, [glazed], WALL_MM)).toBe(1500)
  })
})
