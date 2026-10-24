/**
 * "I am creating a 2nd room but my first room is disappearing."
 *
 * Reported three times. Nothing was ever deleted — the apartment's other rooms
 * were simply never drawn, because ThreeDPage's apartment-rooms query was
 * gated on `topView` and the top-down preset had been removed from the page,
 * so `topView` was a constant false and `aptRooms` was permanently undefined.
 * `{aptRooms && <SiblingRooms …>}` therefore never rendered anything.
 *
 * That gate is fixed elsewhere. These tests cover the half of the bug that
 * lives in the layout math, which that fix exposed for the first time: with a
 * real room list finally reaching the scene, every room has to end up
 * somewhere the camera can actually be pointed from the active room.
 *
 * The data is this user's apartment (aaa1448a-af0f-446f-a91f-1866018235d3):
 * six rooms whose stored `layoutPos` marches along x at a shared z = 4.55, and
 * nine rooms — the "Mening xonam" ones — with `layoutPos: null`.
 */
import { describe, it, expect } from 'vitest'
import { computeAbsolutePositions, roomFootprint } from '../helpers'
import { flatBounds, type RoomBox } from '@/lib/flatBoxes'
import { fitRoomDistance } from '@/lib/orbitZoom'
import type { Room } from '@/lib/api'

/** An apartment room as the API returns it: wall lengths in METRES, with the
 *  stored layout position (when there is one) inside the `state` blob. */
function apiRoom(
  id: string,
  widthM: number,
  depthM: number,
  layoutPos?: { x: number; z: number },
): Room {
  return {
    id,
    name: id,
    ceiling_h: 2.7,
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

// The real stored positions, metres, read off `room.state.layoutPos`.
const STORED_X = [0, 3.52, 7.04, 10.64, 14.29, 17.89]
const STORED_Z = 4.55
const ROOM_W = 3.5
const ROOM_D = 4

/** The apartment exactly as it is on the server: six positioned "Xona"s and
 *  nine unpositioned "Mening xonam"s. */
function realApartment(): Room[] {
  return [
    ...STORED_X.map((x, i) => apiRoom(`xona${i}`, ROOM_W, ROOM_D, { x, z: STORED_Z })),
    ...Array.from({ length: 9 }, (_, i) => apiRoom(`mening${i}`, ROOM_W, ROOM_D)),
  ]
}

const H = 2.7
const FOV = 68
/** A laptop-ish 3D canvas. Also checked upright-phone, where the horizontal
 *  half-angle is the binding one. */
const ASPECT = 1.8

/** Every room's footprint in the flat, absolute. */
function boxesOf(rooms: Room[], activeId: string, aw: number, ad: number): RoomBox[] {
  const abs = computeAbsolutePositions(rooms, activeId, aw, ad)
  return rooms.map((r) => {
    const p = abs.get(r.id)!
    const { w, d } = roomFootprint(r, activeId, aw, ad)
    return { id: r.id, cx: p.x, cz: p.z, w, d }
  })
}

/**
 * Is `room` inside the frame when the camera is pulled back as far as the
 * studio's zoom-out limit allows?
 *
 * With nothing focused the camera orbits the CENTRE of the box round the
 * whole flat (lib/focusFraming), and the limit fits that box
 * (`flatBounds` → `fitRoomDistance`) — so "visible" means the room's
 * footprint lies inside the frustum at that distance from that centre, from
 * every orbit angle.
 */
function visibleAtMaxZoomOut(
  rooms: Room[], activeId: string, roomId: string, aspect = ASPECT,
  aw = ROOM_W, ad = ROOM_D,
): boolean {
  const boxes = boxesOf(rooms, activeId, aw, ad)
  const span = flatBounds(boxes)
  const cx = (Math.min(...boxes.map((b) => b.cx - b.w / 2)) + Math.max(...boxes.map((b) => b.cx + b.w / 2))) / 2
  const cz = (Math.min(...boxes.map((b) => b.cz - b.d / 2)) + Math.max(...boxes.map((b) => b.cz + b.d / 2))) / 2
  const dist = fitRoomDistance({ W: span.W, D: span.D, H }, FOV, aspect)
  const vHalf = (FOV * Math.PI) / 360
  const hHalf = Math.atan(Math.tan(vHalf) * aspect)
  // Half the frame, in metres, at the orbit distance — the plane through the
  // target, which is the plane the floors sit nearest to.
  const halfFrameX = dist * Math.tan(hHalf)
  const halfFrameZ = dist * Math.tan(vHalf)
  const b = boxes.find((x) => x.id === roomId)!
  return (
    Math.abs(b.cx - cx) + b.w / 2 <= halfFrameX &&
    Math.abs(b.cz - cz) + b.d / 2 <= halfFrameZ
  )
}

describe('computeAbsolutePositions — unpositioned rooms', () => {
  it('still keeps the legacy block clear of every stored footprint', () => {
    // The rule that this whole fallback exists for: a legacy row that started
    // back at x = 0 landed on top of a sibling already parked there, which is
    // the "two rooms merged into one" bug. Must not regress.
    const rooms = realApartment()
    const abs = computeAbsolutePositions(rooms, 'mening0', ROOM_W, ROOM_D)
    const storedRight = Math.max(...STORED_X) + ROOM_W / 2
    for (let i = 0; i < 9; i++) {
      expect(abs.get(`mening${i}`)!.x - ROOM_W / 2).toBeGreaterThanOrEqual(storedRight)
    }
  })

  it('never overlaps two rooms', () => {
    const rooms = realApartment()
    const abs = computeAbsolutePositions(rooms, 'mening0', ROOM_W, ROOM_D)
    const boxes = rooms.map((r) => {
      const p = abs.get(r.id)!
      return { id: r.id, x0: p.x - ROOM_W / 2, x1: p.x + ROOM_W / 2, z0: p.z - ROOM_D / 2, z1: p.z + ROOM_D / 2 }
    })
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j]
        const overlapX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
        const overlapZ = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0)
        // 1 mm of slack: adjacent rooms are meant to touch.
        expect(overlapX > 0.001 && overlapZ > 0.001).toBe(false)
      }
    }
  })

  it('continues the flat\'s own band instead of starting a second one at z = 0', () => {
    // Every stored room sits at z = 4.55. A fallback row pinned to z = 0 put
    // the nine legacy rooms in a parallel band 4.55 m away with a dead strip
    // between — two flats, not one — and it inflated the vertical span the
    // zoom-out limit has to cover.
    const abs = computeAbsolutePositions(realApartment(), 'mening0', ROOM_W, ROOM_D)
    expect(abs.get('mening0')!.z).toBeCloseTo(STORED_Z, 9)
  })

  it('grows as a block, not a conga line to the horizon', () => {
    // Nine 3.5 m rooms in one unbounded row reached x ≈ 49.6, making the flat
    // 53 m long and 8.6 m deep — a corridor, not a flat, and the zoom-out
    // limit fitted to it was 98 m. The grid brings it to 32 x 12.
    const rooms = realApartment()
    const abs = computeAbsolutePositions(rooms, 'mening0', ROOM_W, ROOM_D)
    const xs = rooms.map((r) => abs.get(r.id)!.x)
    const zs = rooms.map((r) => abs.get(r.id)!.z)
    const spanX = Math.max(...xs) - Math.min(...xs) + ROOM_W
    const spanZ = Math.max(...zs) - Math.min(...zs) + ROOM_D
    expect(spanX / spanZ).toBeLessThan(4)
  })

  it('leaves a lone unpositioned room at the origin', () => {
    // A flat whose only room has never been saved with a position: the shared
    // layout frame assumes the origin for it, and the "+ add room" anchor
    // math reads this answer back.
    const abs = computeAbsolutePositions([apiRoom('solo', 5, 4)], 'solo', 5, 4)
    expect(abs.get('solo')).toEqual({ x: 0, z: 0 })
  })
})

describe('every room is reachable by the camera from the active room', () => {
  // The actual promise behind the bug report: open any room in the flat and
  // the others are somewhere the user can pull back to and see.
  const rooms = realApartment()
  const ids = rooms.map((r) => r.id)

  for (const activeId of ['xona0', 'xona5', 'mening0', 'mening8']) {
    it(`from ${activeId}`, () => {
      for (const other of ids) {
        expect(visibleAtMaxZoomOut(rooms, activeId, other)).toBe(true)
      }
    })
  }

  it('also on an upright phone, where the frame is narrowest across', () => {
    for (const other of ids) {
      expect(visibleAtMaxZoomOut(rooms, 'mening8', other, 0.46)).toBe(true)
    }
  })

  it('does not waste the screen on empty sky', () => {
    // The complaint this limit was introduced for ran the other way round: a
    // 5.7 m room seen from 29 m is a postage stamp in an empty sky. So the
    // limit has to be far enough to show the flat and not much further.
    //
    // `fitRoomDistance` fits the sphere around the flat into the NARROWER
    // half-angle, which is the vertical one on a landscape canvas. Seen from
    // every orbit angle the flat needs its diagonal on screen, so the frame
    // is measured against that — and must not be far past it.
    const span = flatBounds(boxesOf(rooms, 'mening8', ROOM_W, ROOM_D))
    const dist = fitRoomDistance({ W: span.W, D: span.D, H }, FOV, ASPECT)
    const frameZ = 2 * dist * Math.tan((FOV * Math.PI) / 360)
    expect(frameZ).toBeLessThan(Math.hypot(span.W, span.D) * 1.5)
  })
})

describe('the zoom-out limit fits the flat, not twice its reach', () => {
  it('is the room itself when the flat has no other room', () => {
    expect(flatBounds(boxesOf([apiRoom('solo', 5, 4)], 'solo', 5, 4))).toEqual({ W: 5, D: 4 })
  })

  it('shows a neighbour created through a wall, from either room', () => {
    // What the "+ add room through this wall" flow actually produces: both
    // rooms positioned, touching along x.
    const first = apiRoom('first', 4, 3, { x: 0, z: 0 })
    const second = apiRoom('second', 3.5, 3, { x: 4 / 2 + 0.1 + 3.5 / 2, z: 0 })
    const rooms = [first, second]
    const span = flatBounds(boxesOf(rooms, 'second', 3.5, 3))
    expect(span.W).toBeCloseTo(4 + 0.1 + 3.5)
    expect(visibleAtMaxZoomOut(rooms, 'second', 'first', ASPECT, 3.5, 3)).toBe(true)
    expect(visibleAtMaxZoomOut(rooms, 'first', 'second', ASPECT, 4, 3)).toBe(true)
  })

  it("is no bigger for a room at the flat's edge than for one in its middle", () => {
    // The old span was measured about the OPEN room: open the end room of a
    // six-room row and the limit nearly doubled, leaving the flat tiny in
    // the sky ("max zoom is very far").
    const rooms = realApartment()
    const end = flatBounds(boxesOf(rooms, 'xona0', ROOM_W, ROOM_D))
    const mid = flatBounds(boxesOf(rooms, 'xona3', ROOM_W, ROOM_D))
    expect(end).toEqual(mid)
  })
})
