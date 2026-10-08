/**
 * The point a new room is measured from.
 *
 * `newRoomCentreFromWall` is exact, and was still putting rooms in the wrong
 * place, because it was being handed the wrong origin: a room with no stored
 * `layoutPos` was assumed to be at (0, 0). That is true only in an empty flat.
 * This user's apartment is the other case — six rooms carry stored positions
 * marching along x while the older rooms carry none — so the room the user was
 * standing in was being treated as sitting on top of a different room, and the
 * "new room behind this wall" was measured from there.
 */
import { describe, it, expect } from 'vitest'
import { addRoomAnchor } from '../useAddRoomNavigation'
import { computeAbsolutePositions } from '../helpers'
import { wallAnchorOf, newRoomCentreFromWall } from '@/lib/newRoomFromWall'
import type { Room } from '@/lib/api'
import type { RoomGeometry } from '@/store/roomStore'

/** An apartment room as the API returns it: wall lengths in METRES, and the
 *  stored layout position (if any) inside the `state` blob. */
function apiRoom(
  id: string,
  widthM: number,
  depthM: number,
  layoutPos?: { x: number; z: number },
): Room {
  return {
    id,
    geometry: {
      walls: [
        { id: 'A', length: widthM, elements: [] },
        { id: 'B', length: depthM, elements: [] },
        { id: 'C', length: widthM, elements: [] },
        { id: 'D', length: depthM, elements: [] },
      ],
    },
    state: layoutPos ? { layoutPos } : {},
  } as unknown as Room
}

/** The same room in the STORE's units — millimetres. */
function storeGeometry(widthMm: number, depthMm: number): RoomGeometry {
  return {
    walls: [
      { id: 'A', length: widthMm, elements: [] },
      { id: 'B', length: depthMm, elements: [] },
      { id: 'C', length: widthMm, elements: [] },
      { id: 'D', length: depthMm, elements: [] },
    ],
  } as unknown as RoomGeometry
}

const ACTIVE_W = 5
const ACTIVE_D = 4

describe('addRoomAnchor', () => {
  it('uses a stored position verbatim', () => {
    const stored = { x: 7.04, z: 4.55 }
    expect(addRoomAnchor(stored, [apiRoom('me', 5, 4)], 'me', ACTIVE_W, ACTIVE_D)).toBe(stored)
  })

  it('falls back to the origin only when there is no room list at all', () => {
    // Offline, or the fetch failed: nothing is known to be standing at the
    // origin, and the origin is what the layout frame assumes for a first room.
    expect(addRoomAnchor(null, null, 'me', ACTIVE_W, ACTIVE_D)).toEqual({ x: 0, z: 0 })
    expect(addRoomAnchor(null, [], 'me', ACTIVE_W, ACTIVE_D)).toEqual({ x: 0, z: 0 })
  })

  it('does not put an unpositioned room on top of a sibling that owns the origin', () => {
    const sibling = apiRoom('sib', 3.5, 4, { x: 0, z: 0 })
    const active = apiRoom('me', ACTIVE_W, ACTIVE_D)
    const anchor = addRoomAnchor(null, [sibling, active], 'me', ACTIVE_W, ACTIVE_D)
    expect(anchor).not.toEqual({ x: 0, z: 0 })
    // Clear of the sibling's footprint along x, which is what the layout pass
    // guarantees and the origin fallback threw away.
    expect(anchor.x - ACTIVE_W / 2).toBeGreaterThanOrEqual(0 + 3.5 / 2)
  })

  it('agrees with where the room is actually rendered', () => {
    // Not "somewhere free" — the SAME answer the sibling rendering uses, or
    // the new room is placed beside a room the user cannot see there.
    const rooms = [apiRoom('sib', 3.5, 4, { x: 0, z: 0 }), apiRoom('me', ACTIVE_W, ACTIVE_D)]
    const rendered = computeAbsolutePositions(rooms, 'me', ACTIVE_W, ACTIVE_D).get('me')!
    expect(addRoomAnchor(null, rooms, 'me', ACTIVE_W, ACTIVE_D)).toEqual(rendered)
  })

  it("handles this user's flat: six positioned rooms, the active one unpositioned", () => {
    const positioned = [0, 3.52, 7.04, 10.64, 14.29, 17.89].map((x, i) =>
      apiRoom(`p${i}`, 3.5, 4, { x, z: 4.55 }),
    )
    const active = apiRoom('me', ACTIVE_W, ACTIVE_D)
    const anchor = addRoomAnchor(null, [...positioned, active], 'me', ACTIVE_W, ACTIVE_D)
    // Past the far end of the stored row, not back at its start.
    expect(anchor.x - ACTIVE_W / 2).toBeGreaterThanOrEqual(17.89 + 3.5 / 2)
  })
})

describe('the room that then goes through the wall', () => {
  const SIB = apiRoom('sib', 3.5, 4, { x: 0, z: 0 })
  const ME = apiRoom('me', ACTIVE_W, ACTIVE_D)
  const ROOMS = [SIB, ME]
  const ADDED = { widthM: 3.5, depthM: 3 }
  const THICKNESS_M = 0.1

  it('lands one wall thickness beyond the wall the user tapped', () => {
    const anchor = addRoomAnchor(null, ROOMS, 'me', ACTIVE_W, ACTIVE_D)
    const east = wallAnchorOf(storeGeometry(ACTIVE_W * 1000, ACTIVE_D * 1000), 'B')!
    const centre = newRoomCentreFromWall(anchor, east, ADDED, THICKNESS_M)
    // The new room's west face sits exactly one partition out from this room's
    // east face, measured where this room really is.
    expect(centre.x - ADDED.widthM / 2).toBeCloseTo(anchor.x + ACTIVE_W / 2 + THICKNESS_M, 9)
  })

  it('is not created inside the room the user is standing in', () => {
    // The old origin fallback's actual failure: the active room renders at
    // x ≈ 4.27 spanning [1.77, 6.77], so measuring from (0, 0) produced a
    // centre of 4.35 — inside that very room.
    const anchor = addRoomAnchor(null, ROOMS, 'me', ACTIVE_W, ACTIVE_D)
    const east = wallAnchorOf(storeGeometry(ACTIVE_W * 1000, ACTIVE_D * 1000), 'B')!
    const good = newRoomCentreFromWall(anchor, east, ADDED, THICKNESS_M)
    const bad = newRoomCentreFromWall({ x: 0, z: 0 }, east, ADDED, THICKNESS_M)

    const insideActive = (x: number) =>
      x > anchor.x - ACTIVE_W / 2 && x < anchor.x + ACTIVE_W / 2
    expect(insideActive(bad.x)).toBe(true)
    expect(insideActive(good.x)).toBe(false)
  })

  it('does not overlap the sibling it was never measured from', () => {
    const anchor = addRoomAnchor(null, ROOMS, 'me', ACTIVE_W, ACTIVE_D)
    const east = wallAnchorOf(storeGeometry(ACTIVE_W * 1000, ACTIVE_D * 1000), 'B')!
    const centre = newRoomCentreFromWall(anchor, east, ADDED, THICKNESS_M)
    expect(centre.x - ADDED.widthM / 2).toBeGreaterThan(0 + 3.5 / 2)
  })
})
