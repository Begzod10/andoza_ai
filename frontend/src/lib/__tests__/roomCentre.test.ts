/**
 * The 360 camera must stand in the room, not in a wall.
 *
 * It used to stand at the world origin, which is the vertex mean of the
 * outline — the middle of a rectangle and, for an L-shaped room, a point in
 * the cut-away notch. These pin the replacement: a rectangle must still give
 * exactly its centre (otherwise the fix moved the camera in every ordinary
 * room for nothing), an L must give a point provably inside the floor, and the
 * plan-to-world conversion must agree with how `NWallRoomShell` actually
 * centres the polygon — the conversion is where this would go wrong quietly.
 */
import { describe, it, expect } from 'vitest'
import {
  edgeClearance, polygonAreaCentroid, poleOfInaccessibility,
  roomCentrePlan, roomCentreWorld,
} from '../roomCentre'
import { roomBoundsFromGeometry, worldToPlan, type RoomBounds } from '../furnitureBounds'
import { planPolygon, pointInPolygon } from '../planPolygon'
import type { RoomGeometry } from '@/store/roomStore'

/** A legacy wizard rectangle: four named walls, vertices as the store writes them. */
function abcd(a: number, b: number, withVertices = true): RoomGeometry {
  return {
    walls: [
      { id: 'A', length: a, elements: [] },
      { id: 'B', length: b, elements: [] },
      { id: 'C', length: a, elements: [] },
      { id: 'D', length: b, elements: [] },
    ],
    vertices: withVertices ? [[0, 0], [a, 0], [a, b], [0, b]] : undefined,
  }
}

/**
 * The L this whole change exists for, in the geometry's own raw millimetres.
 *
 *   0                     6000
 *   +----------------------+  0
 *   |                      |
 *   |        +-------------+  2000
 *   |        |    notch
 *   |        |
 *   +--------+                6000
 *          2000
 *
 * Vertex mean (2666.67, 2666.67) and area centroid (2200, 2200) are BOTH in
 * the notch, so the shape separates all three definitions of "middle".
 */
const L_RAW: [number, number][] = [
  [0, 0], [6000, 0], [6000, 2000], [2000, 2000], [2000, 6000], [0, 6000],
]

function polygonRoom(raw: [number, number][]): RoomGeometry {
  return {
    walls: raw.map((_, i) => ({ id: `W${i}`, length: 1000, elements: [] })),
    vertices: raw,
  }
}

describe('edgeClearance', () => {
  it('is the distance to the nearest wall inside the room', () => {
    const rect: [number, number][] = [[0, 0], [4000, 0], [4000, 3000], [0, 3000]]
    expect(edgeClearance(2000, 1500, rect)).toBeCloseTo(1500, 6)
    expect(edgeClearance(100, 1500, rect)).toBeCloseTo(100, 6)
  })

  it('goes negative outside, so the search has a gradient to follow', () => {
    const rect: [number, number][] = [[0, 0], [4000, 0], [4000, 3000], [0, 3000]]
    expect(edgeClearance(-500, 1500, rect)).toBeCloseTo(-500, 6)
  })

  it('measures a concave corner as a corner, not as the line through it', () => {
    // (1000, 1000) is inside the L and the nearest boundary is the reflex
    // VERTEX (2000, 2000) only if the two edges leaving it are measured as
    // segments. Measured as infinite lines z = 2000 and x = 2000 it would come
    // out as 1000, and the pole would land in the wrong place.
    expect(edgeClearance(1000, 1000, L_RAW)).toBeCloseTo(1000, 6)
    // At (1500, 1500) the walls x = 0 and z = 0 are 1500 away, but the reflex
    // corner is only sqrt(2) * 500 = 707 away.
    expect(edgeClearance(1500, 1500, L_RAW)).toBeCloseTo(Math.SQRT2 * 500, 6)
  })
})

describe('polygonAreaCentroid', () => {
  it('is the centre of a rectangle', () => {
    const rect: [number, number][] = [[0, 0], [4000, 0], [4000, 3000], [0, 3000]]
    const c = polygonAreaCentroid(rect)
    expect(c.x).toBeCloseTo(2000, 6)
    expect(c.z).toBeCloseTo(1500, 6)
  })

  it('is unmoved by splitting a wall into two collinear halves', () => {
    const split: [number, number][] = [
      [0, 0], [2000, 0], [4000, 0], [4000, 3000], [0, 3000],
    ]
    const c = polygonAreaCentroid(split)
    expect(c.x).toBeCloseTo(2000, 6)
    expect(c.z).toBeCloseTo(1500, 6)
    // The vertex mean, by contrast, is dragged toward the split wall — which
    // is exactly why the camera cannot use it.
    expect(split.reduce((s, [x]) => s + x, 0) / split.length).toBeCloseTo(2000, 6)
    expect(split.reduce((s, [, z]) => s + z, 0) / split.length).toBeCloseTo(1200, 6)
  })

  it('lands in the notch for the L — the reason the centroid is not enough', () => {
    const c = polygonAreaCentroid(L_RAW)
    expect(c.x).toBeCloseTo(2200, 6)
    expect(c.z).toBeCloseTo(2200, 6)
    expect(pointInPolygon(c.x, c.z, L_RAW)).toBe(false)
  })
})

describe('poleOfInaccessibility', () => {
  it('finds the analytic optimum of the L', () => {
    // On the diagonal the clearance is min(c, sqrt(2) * (2000 - c)); the two
    // are equal at c = 2000 * sqrt(2) / (1 + sqrt(2)) = 1171.57 mm, and by the
    // shape's symmetry about x = z that is the pole.
    const expected = (2000 * Math.SQRT2) / (1 + Math.SQRT2)
    const p = poleOfInaccessibility(L_RAW)
    expect(p.x).toBeCloseTo(expected, 3)
    expect(p.z).toBeCloseTo(expected, 3)
    expect(edgeClearance(p.x, p.z, L_RAW)).toBeCloseTo(expected, 3)
  })

  it('beats the best the wide arm alone could offer', () => {
    // The 2000 mm-deep horizontal arm caps out at 1000 mm of clearance, so a
    // search that settled into it instead of the corner square would be
    // visibly worse. 1171 > 1000 proves the coarse pass escaped it.
    expect(edgeClearance(...centreOf(L_RAW), L_RAW)).toBeGreaterThan(1000)
  })
})

function centreOf(outline: [number, number][]): [number, number] {
  const p = poleOfInaccessibility(outline)
  return [p.x, p.z]
}

describe('roomCentrePlan', () => {
  it('gives a legacy rectangle without vertices its exact centre', () => {
    const room: RoomBounds = { W: 4000, D: 3000, inner: null, outline: null }
    expect(roomCentrePlan(room)).toEqual({ x: 2000, z: 1500 })
  })

  it('gives a rectangle WITH vertices the same point, to the last digit', () => {
    // A 4000 x 3000 room has a whole segment of equally deep points
    // (z = 1500, x in [1500, 2500]). The centroid tie-break is what makes the
    // answer the middle of that segment rather than its left end.
    const room = roomBoundsFromGeometry(abcd(4000, 3000))
    const c = roomCentrePlan(room)
    expect(c.x).toBeCloseTo(2000, 9)
    expect(c.z).toBeCloseTo(1500, 9)
  })

  it('puts the L-room camera inside the floor, not in the notch', () => {
    const room = roomBoundsFromGeometry(polygonRoom(L_RAW))
    const poly = planPolygon(polygonRoom(L_RAW))!
    const c = roomCentrePlan(room)
    expect(pointInPolygon(c.x, c.z, poly.vertices)).toBe(true)
    // And comfortably inside, not scraping a wall: more than a metre of
    // clearance in every direction, which is what a panorama needs.
    expect(edgeClearance(c.x, c.z, poly.vertices)).toBeGreaterThan(1100)
  })

  it('is not the point the camera used to take, for the L', () => {
    const room = roomBoundsFromGeometry(polygonRoom(L_RAW))
    const poly = planPolygon(polygonRoom(L_RAW))!
    // The old camera stood at world (0, 0), i.e. plan (W/2, D/2) — the vertex
    // mean. That point is outside the room: the bug, asserted.
    expect(pointInPolygon(room.W / 2, room.D / 2, poly.vertices)).toBe(false)
    const c = roomCentrePlan(room)
    expect(Math.hypot(c.x - room.W / 2, c.z - room.D / 2)).toBeGreaterThan(1000)
  })

  it('stands in the middle of a long thin corridor', () => {
    const corridor: [number, number][] = [[0, 0], [8000, 0], [8000, 1200], [0, 1200]]
    const room = roomBoundsFromGeometry(polygonRoom(corridor))
    const poly = planPolygon(polygonRoom(corridor))!
    const c = roomCentrePlan(room)
    // Dead centre: halfway along and halfway across. Every point on the spine
    // z = 600, x in [600, 7400] is 600 mm from a wall, and the tie-break picks
    // the centroid out of that run rather than one of its ends.
    expect(c.x).toBeCloseTo((poly.minX + poly.maxX) / 2, 6)
    expect(c.z).toBeCloseTo((poly.minZ + poly.maxZ) / 2, 6)
    expect(edgeClearance(c.x, c.z, poly.vertices)).toBeCloseTo(600, 6)
  })

  it('survives a U-shaped room, where the centroid is also outside', () => {
    //   0                   6000
    //   +--------------------+  0
    //   |  +----------+      |
    //   |  |  notch   |      |
    //   |  |          |      |
    //   +--+          +------+  5000
    //     1500      4000
    const u: [number, number][] = [
      [0, 0], [6000, 0], [6000, 5000], [4000, 5000], [4000, 1500],
      [1500, 1500], [1500, 5000], [0, 5000],
    ]
    const room = roomBoundsFromGeometry(polygonRoom(u))
    const poly = planPolygon(polygonRoom(u))!
    const c = roomCentrePlan(room)
    expect(pointInPolygon(c.x, c.z, poly.vertices)).toBe(true)
    expect(edgeClearance(c.x, c.z, poly.vertices)).toBeGreaterThan(700)
  })
})

describe('roomCentreWorld', () => {
  it('leaves an ordinary rectangular room at the origin', () => {
    // The whole point of the tie-break: the 360 camera in a plain room has to
    // end up exactly where it has always been.
    const c = roomCentreWorld(abcd(4000, 3000))
    expect(c.x).toBeCloseTo(0, 9)
    expect(c.z).toBeCloseTo(0, 9)
  })

  it('leaves a legacy rectangle with no vertex list at the origin too', () => {
    const c = roomCentreWorld(abcd(4000, 3000, false))
    expect(c).toEqual({ x: 0, z: 0 })
  })

  it('moves the L-room camera off the origin, in metres', () => {
    const expected = (2000 * Math.SQRT2) / (1 + Math.SQRT2)
    const c = roomCentreWorld(polygonRoom(L_RAW))
    // Raw pole 1171.57 mm; the shell centres the outline on the vertex mean
    // 16000 / 6 = 2666.67 mm, so world = (1171.57 - 2666.67) / 1000.
    const want = (expected - 16000 / 6) / 1000
    expect(c.x).toBeCloseTo(want, 6)
    expect(c.z).toBeCloseTo(want, 6)
    expect(Math.hypot(c.x, c.z)).toBeGreaterThan(2)
  })

  it('falls back to the origin for a geometry with no usable outline', () => {
    const geometry: RoomGeometry = { walls: [], vertices: [[0, 0], [1000, 0]] }
    expect(roomCentreWorld(geometry, { W: 4, D: 3 })).toEqual({ x: 0, z: 0 })
  })
})

/**
 * The frame check this change hinges on.
 *
 * Two files define the polygon's placement independently and nobody had ever
 * asserted they agree:
 *   - `NWallRoomShell` renders at  world_m = raw_mm / 1000 - vertexMean / 1000
 *   - `planPolygon` lays out at    plan_mm = raw_mm - vertexMean + (W/2, D/2)
 * so `worldToPlan` (world * 1000 + (W/2, D/2)) is the bridge only if the two
 * use the same vertex mean and the same W/D. If they ever diverge the camera
 * would be placed somewhere plausible-looking and wrong — inside a wall in the
 * worst case — with no visible symptom in any test that only looked at one
 * frame. This recomputes the shell's own arithmetic from the raw vertices and
 * requires the round trip to be exact.
 */
describe('plan and world frames agree with NWallRoomShell', () => {
  for (const raw of [L_RAW, [[0, 0], [4000, 0], [4000, 3000], [0, 3000]] as [number, number][]]) {
    it(`round-trips every vertex of the ${raw.length}-gon`, () => {
      const geometry = polygonRoom(raw)
      const room = roomBoundsFromGeometry(geometry)
      const poly = planPolygon(geometry)!
      // NWallRoomShell's own centring, copied verbatim from RoomShell.tsx.
      const cxM = raw.reduce((s, [x]) => s + x, 0) / raw.length / 1000
      const czM = raw.reduce((s, [, z]) => s + z, 0) / raw.length / 1000
      raw.forEach(([x, z], i) => {
        const world = { x: x / 1000 - cxM, z: z / 1000 - czM }
        const plan = worldToPlan(world, room)
        expect(plan.x).toBeCloseTo(poly.vertices[i][0], 6)
        expect(plan.z).toBeCloseTo(poly.vertices[i][1], 6)
      })
    })
  }

  it('does not assume the plan bounding box starts at the origin', () => {
    // The L's vertex mean is not its box centre, so its plan box is shifted —
    // 333.33 mm in on both axes. Anything that treated minX/minZ as 0 would be
    // off by that much, which is the exact size of mistake this change is about.
    const poly = planPolygon(polygonRoom(L_RAW))!
    expect(poly.minX).toBeCloseTo(3000 - 16000 / 6, 6)
    expect(poly.minZ).toBeCloseTo(3000 - 16000 / 6, 6)
    expect(poly.minX).toBeGreaterThan(1)
  })
})
