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
import { addRoomAnchor, occupantOfNewRoomSlot } from '../useAddRoomNavigation'
import { computeAbsolutePositions } from '../helpers'
import { wallAnchorOf, newRoomCentreFromWall, roomsOverlap } from '@/lib/newRoomFromWall'
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

/**
 * Two rooms in one place.
 *
 * Tapping a wall says where the new room goes; nothing asked whether anything
 * was already there. The flat this came from has two such pairs — 080dd2e5 and
 * adf63c5a both stored at x = 14.29, and 8bdfc0ef and 35acd0e5 50 mm apart —
 * each of them one room added east of a room that already had an east
 * neighbour. On screen that is not two rooms side by side: it is one room with
 * another room's walls, skirting and door casings standing inside it, which is
 * where the "brown frame against a solid wall" in the bug report came from.
 */
describe('occupantOfNewRoomSlot', () => {
  /** Where `newRoomCentreFromWall` puts a 3.5 x 3 room added east of a
   *  3.5 x 3 room at x, through a 100 mm partition. */
  const eastOf = (x: number) => x + 1.75 + 0.1 + 1.75
  const slot = (x: number) => ({ x, z: 4.55, widthM: 3.5, depthM: 3 })

  it('finds the room already standing in the slot', () => {
    const rooms = [
      apiRoom('me', 3.5, 3, { x: 10.64, z: 4.55 }),
      apiRoom('taken', 3.5, 3, { x: 14.29, z: 4.55 }),
    ];
    const found = occupantOfNewRoomSlot(slot(eastOf(10.64)), rooms, 'me', 3.5, 3);
    expect(found?.id).toBe('taken');
  })

  it('allows the slot when the nearest room only abuts it', () => {
    // A room one partition away is not in the way — the gap between them IS
    // the wall. Testing distances instead of areas is how this kind of check
    // ends up refusing every placement in a row of rooms.
    const rooms = [
      apiRoom('me', 3.5, 3, { x: 10.64, z: 4.55 }),
      apiRoom('further', 3.5, 3, { x: eastOf(eastOf(10.64)), z: 4.55 }),
    ];
    expect(occupantOfNewRoomSlot(slot(eastOf(10.64)), rooms, 'me', 3.5, 3)).toBeNull();
  })

  it('ignores a room that is merely alongside', () => {
    const rooms = [
      apiRoom('me', 3.5, 3, { x: 10.64, z: 4.55 }),
      apiRoom('nextrow', 3.5, 3, { x: eastOf(10.64), z: 4.55 + 3.1 }),
    ];
    expect(occupantOfNewRoomSlot(slot(eastOf(10.64)), rooms, 'me', 3.5, 3)).toBeNull();
  })

  it('never reports the active room itself', () => {
    // A drawn room's bounding box reaches past a tapped wall that sits inside
    // its outline, so the room being added to must not be a candidate or a
    // perfectly good placement gets refused.
    const rooms = [apiRoom('me', 3.5, 3, { x: 10.64, z: 4.55 })];
    expect(occupantOfNewRoomSlot(slot(10.64), rooms, 'me', 3.5, 3)).toBeNull();
  })

  it('counts a room with no stored position, where the flat draws it', () => {
    // An unpositioned room is laid out in the fallback block beside the
    // positioned ones, and that is where the user sees it — so that is where
    // it blocks.
    const rooms = [
      apiRoom('me', 3.5, 3, { x: 10.64, z: 4.55 }),
      apiRoom('legacy', 3.5, 3),
    ];
    const laidOut = computeAbsolutePositions(rooms, 'me', 3.5, 3).get('legacy')!;
    expect(occupantOfNewRoomSlot(
      { ...slot(laidOut.x), z: laidOut.z }, rooms, 'me', 3.5, 3,
    )?.id).toBe('legacy');
  })

  it('says the slot is free when the room list could not be fetched', () => {
    // Offline: better to place the room than to refuse every placement.
    expect(occupantOfNewRoomSlot(slot(14.29), null, 'me', 3.5, 3)).toBeNull();
    expect(occupantOfNewRoomSlot(slot(14.29), [], 'me', 3.5, 3)).toBeNull();
  })
})

describe('roomsOverlap', () => {
  it('is false for rooms a partition apart, and for rooms that touch', () => {
    const a = { x: 0, z: 0, widthM: 3.5, depthM: 3 };
    expect(roomsOverlap(a, { x: 3.6, z: 0, widthM: 3.5, depthM: 3 })).toBe(false);
    expect(roomsOverlap(a, { x: 3.5, z: 0, widthM: 3.5, depthM: 3 })).toBe(false);
  })

  it('is true once they share any real floor', () => {
    const a = { x: 0, z: 0, widthM: 3.5, depthM: 3 };
    expect(roomsOverlap(a, { x: 3.4, z: 0, widthM: 3.5, depthM: 3 })).toBe(true);
    expect(roomsOverlap(a, a)).toBe(true);
  })

  it('needs an overlap on BOTH axes', () => {
    const a = { x: 0, z: 0, widthM: 3.5, depthM: 3 };
    // Same x band, a row further south — two rooms, not one.
    expect(roomsOverlap(a, { x: 0, z: 3.1, widthM: 3.5, depthM: 3 })).toBe(false);
  })
})
