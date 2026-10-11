/**
 * One convention, asserted once: a wall position is measured from
 * `vertices[i]` toward `vertices[i + 1]`.
 *
 * That is what the server writes — `convert_captured_room`
 * (backend/app/services/room_scan_converter.py) stores `WallElement.position`
 * as a 0..1 fraction from `corners[i]`, and the auto electrical placer
 * documents the same direction — and, for a long time, NOT what the studio
 * read: both edge models picked whichever endpoint was smaller on the edge's
 * dominant axis. A closed simple polygon has to traverse each axis in both
 * directions, so some edge of EVERY room runs the other way and the two
 * readings are mirrored (frontend = length − backend). The interesting cases
 * below are therefore the decreasing-direction edges; an increasing one passes
 * either way, which is why this went unnoticed.
 *
 * The 2D plan (`planPolygon`) and the 3D opening layer
 * (`wallDefsFromVertices`) are checked against the SAME reference so they
 * cannot drift apart from each other either.
 */
import { describe, it, expect } from 'vitest'
import { planPolygon, wallPositionAt, pointAtWallPosition } from '../planPolygon'
import { wallDefsFromVertices } from '../wallDefsFromVertices'
import { roomExtents } from '../roomDims'
import type { RoomGeometry } from '@/store/roomStore'

/** The shared scan fixture's room (backend/tests/fixtures/captured_room_sample.json
 *  → corners 4 × 3 m, CCW). Edges 2 and 3 run the decreasing way. */
const RECT: [number, number][] = [
  [0, 0],
  [4000, 0],
  [4000, 3000],
  [0, 3000],
]

/** backend/tests/fixtures/captured_room_real_scan2.json, converted (metres →
 *  mm). A real 5-wall LiDAR scan: no edge is axis-aligned, and edges 0, 1 and
 *  2 all run in the decreasing direction on their dominant axis. */
const SCAN: [number, number][] = [
  [8669, 4926],
  [3620, 7788],
  [2429, 7580],
  [0, 3316],
  [5817, 0],
]

function polygonRoom(vertices: [number, number][]): RoomGeometry {
  const n = vertices.length
  return {
    walls: vertices.map((_, i) => ({
      id: String(i),
      length: Math.round(
        Math.hypot(
          vertices[(i + 1) % n][0] - vertices[i][0],
          vertices[(i + 1) % n][1] - vertices[i][1],
        ),
      ),
      elements: [],
    })),
    vertices,
  }
}

/**
 * The server's reading of `position`, in the raw `geometry.vertices` frame:
 * the physical point a 0..1 fraction of the way from `vertices[i]` to
 * `vertices[i + 1]`. This is the reference both frontend models must agree
 * with — deliberately written out rather than imported, so it states the
 * contract instead of re-deriving it from the code under test.
 */
function serverPoint(
  vertices: [number, number][],
  wall: number,
  fraction: number,
): [number, number] {
  const n = vertices.length
  const [x1, z1] = vertices[wall]
  const [x2, z2] = vertices[(wall + 1) % n]
  return [x1 + (x2 - x1) * fraction, z1 + (z2 - z1) * fraction]
}

/** Raw `geometry.vertices` mm → the plan frame `planPolygon` works in. */
function toPlan(geometry: RoomGeometry, [x, z]: [number, number]): [number, number] {
  const verts = geometry.vertices!
  const n = verts.length
  const cx = verts.reduce((s, [vx]) => s + vx, 0) / n
  const cz = verts.reduce((s, [, vz]) => s + vz, 0) / n
  const ext = roomExtents(geometry)
  return [x - cx + (ext.W * 1000) / 2, z - cz + (ext.D * 1000) / 2]
}

describe('wall position convention — 2D plan', () => {
  for (const [name, verts] of [
    ['axis-aligned 4×3 room', RECT],
    ['real 5-wall LiDAR scan', SCAN],
  ] as const) {
    it(`round-trips every edge of the ${name} against the server's reading`, () => {
      const geometry = polygonRoom(verts as [number, number][])
      const poly = planPolygon(geometry)!
      expect(poly.edges).toHaveLength(verts.length)

      for (const [i, edge] of poly.edges.entries()) {
        // A few fractions per edge, including the asymmetric ones that a
        // mirrored convention would get wrong (0.5 passes either way).
        for (const fraction of [0, 0.1, 0.375, 0.5, 0.9, 1]) {
          const [px, pz] = toPlan(geometry, serverPoint(verts as [number, number][], i, fraction))
          // …plan point → position, and position → plan point, both directions.
          expect(wallPositionAt(edge, px, pz)).toBeCloseTo(edge.len * fraction, 6)
          const back = pointAtWallPosition(edge, edge.len * fraction)
          expect(back.x).toBeCloseTo(px, 6)
          expect(back.z).toBeCloseTo(pz, 6)
        }
      }
    })
  }
})

describe('wall position convention — 3D opening layer', () => {
  it('puts position 0 at vertices[i] on a decreasing-direction edge', () => {
    // Centroid-centred metres, the frame wallDefsFromVertices returns.
    const defs = wallDefsFromVertices(RECT, ['0', '1', '2', '3'])

    // Edge 0: (0,0) → (4000,0). Increasing on X — position 0 at x = −2.
    expect(defs['0'].axis).toBe('X')
    expect(defs['0'].alongSign).toBe(1)
    expect(defs['0'].originAlong).toBeCloseTo(-2, 6)

    // Edge 2: (4000,3000) → (0,3000). DECREASING on X — position 0 at x = +2,
    // growing toward −X. The old `Math.min` reading put it at −2, which is
    // where a scanned door on that wall used to land: the far end.
    expect(defs['2'].axis).toBe('X')
    expect(defs['2'].alongSign).toBe(-1)
    expect(defs['2'].originAlong).toBeCloseTo(2, 6)

    // Edge 3: (0,3000) → (0,0). Decreasing on Z.
    expect(defs['3'].axis).toBe('Z')
    expect(defs['3'].alongSign).toBe(-1)
    expect(defs['3'].originAlong).toBeCloseTo(1.5, 6)
  })

  it('agrees with the 2D plan on the same physical point', () => {
    const geometry = polygonRoom(RECT)
    const poly = planPolygon(geometry)!
    const defs = wallDefsFromVertices(RECT, ['0', '1', '2', '3'])
    const n = RECT.length
    const cx = RECT.reduce((s, [x]) => s + x, 0) / n / 1000
    const cz = RECT.reduce((s, [, z]) => s + z, 0) / n / 1000

    for (const [i, edge] of poly.edges.entries()) {
      const def = defs[String(i)]
      for (const fraction of [0, 0.375, 0.9]) {
        const [rx, rz] = serverPoint(RECT, i, fraction)
        const alongM = (edge.len * fraction) / 1000
        // Where the 3D layer draws that position, on the wall's own axis…
        const world = def.originAlong + def.alongSign * alongM
        // …vs the centroid-centred metres of the server's physical point.
        expect(world).toBeCloseTo(def.axis === 'X' ? rx / 1000 - cx : rz / 1000 - cz, 6)
      }
    }
  })

  it('leaves the legacy ABCD rectangle on its own older convention', () => {
    // The server auto-fills `vertices` for any 4-wall room, so a saved wizard
    // rectangle reaches this function too — but its stored openings, its
    // RoomScene branch and WallOpenings' hardcoded fallback all measure from
    // the along-axis MINIMUM end. Flipping walls C and D here would move every
    // opening in every rectangle room ever saved.
    const defs = wallDefsFromVertices(RECT, ['A', 'B', 'C', 'D'])
    for (const id of ['A', 'B', 'C', 'D']) expect(defs[id].alongSign).toBe(1)
    expect(defs.A.originAlong).toBeCloseTo(-2, 6) // −W/2
    expect(defs.C.originAlong).toBeCloseTo(-2, 6) // −W/2, not +2
    expect(defs.B.originAlong).toBeCloseTo(-1.5, 6) // −D/2
    expect(defs.D.originAlong).toBeCloseTo(-1.5, 6) // −D/2
  })
})

/**
 * The legacy ABCD rectangle's `dirX`/`dirZ`, which is the OTHER half of the
 * same exception and the half that was missing.
 *
 * `legacyAbcd` kept `originAlong`/`alongSign` on the rectangle's own older
 * convention (above) but left `dirX`/`dirZ` as the raw traversal direction of
 * the server's auto-filled CCW loop, where edges C and D run the decreasing
 * way. The two halves of one wall def therefore disagreed, and because the
 * door's CASING, its REVEAL and the HOLE cut in the wall are placed from
 * `originAlong`/`alongSign` (`buildFrameWallDefs`/`frameGroupOrigin` in
 * pages/studio/three-d/WallComponents.tsx, and the legacy `Wall`'s own
 * segmentation) while the door LEAF is placed from `midX`/`midZ` + `dirX`/
 * `dirZ` (`wallFramesFromVertices`/`openingCentre` in
 * components/studio/DoorLeaves.tsx), the leaf came out mirrored about the
 * wall's midpoint on walls C and D: "door itself is not on the place" — a
 * correctly cut and lined doorway with the white slab standing beside it,
 * flat against the wall.
 *
 * The numbers below are the room it was reported from: three 3.5 × 3 m rooms
 * in a row, with a 900 mm door 1401 mm along the middle room's wall D. Its
 * hole sits 351 mm past that wall's midpoint and its leaf was drawn 351 mm
 * short of it — 702 mm away, most of a door width.
 */
const REPORTED: [number, number][] = [
  [0, 0],
  [3500, 0],
  [3500, 3000],
  [0, 3000],
]

/** Every wall of a legacy rectangle, as both halves of its def read it. */
function readings(
  vertices: [number, number][],
  wallId: string,
  el: { position: number; width: number },
) {
  const def = wallDefsFromVertices(vertices, ['A', 'B', 'C', 'D'])[wallId]
  const alongM = (el.position + el.width / 2) / 1000
  const t = alongM - def.length / 2
  return {
    def,
    /** Where DoorLeaves hangs the leaf (world metres, centroid-centred). */
    leaf: { x: def.midX + def.dirX * t, z: def.midZ + def.dirZ * t },
    /** Where the casing, the reveal and the hole go, on the wall's own axis. */
    holeAlong: def.originAlong + def.alongSign * alongM,
  }
}

describe('legacy ABCD rectangle — leaf vs hole', () => {
  it('points dirX/dirZ the way element position grows, not the way the loop is wound', () => {
    const defs = wallDefsFromVertices(REPORTED, ['A', 'B', 'C', 'D'])
    // A and B run the increasing way in the auto-filled loop, so they were
    // always right; C and D are the two the loop runs backwards along.
    expect(defs.A.dirX).toBeCloseTo(1, 6)
    expect(defs.A.dirZ).toBeCloseTo(0, 6)
    expect(defs.C.dirX).toBeCloseTo(1, 6) // was −1: mirrored every C-wall leaf
    expect(defs.C.dirZ).toBeCloseTo(0, 6)
    expect(defs.B.dirX).toBeCloseTo(0, 6)
    expect(defs.B.dirZ).toBeCloseTo(1, 6)
    expect(defs.D.dirX).toBeCloseTo(0, 6)
    expect(defs.D.dirZ).toBeCloseTo(1, 6) // was −1: mirrored every D-wall leaf
  })

  it('hangs the reported door leaf in its own doorway', () => {
    const { def, leaf, holeAlong } = readings(REPORTED, 'D', { position: 1401, width: 900 })
    // Wall D of a 3.5 × 3 m room: 3 m long, at x = −1.75, position growing
    // with +z. The door's centre is 1851 mm along it — 351 mm past the
    // midpoint, which is where the hole and the casing are.
    expect(def.axis).toBe('Z')
    expect(holeAlong).toBeCloseTo(0.351, 6)
    expect(leaf.x).toBeCloseTo(-1.75, 6)
    expect(leaf.z).toBeCloseTo(0.351, 6) // was −0.351 — 702 mm from its hole
  })

  it('agrees on every wall, at every position along it', () => {
    for (const wallId of ['A', 'B', 'C', 'D']) {
      // Hard against either corner and three places in between; a door at the
      // exact midpoint passes under a mirrored reading too, which is why this
      // went unnoticed on centred doors.
      for (const position of [0, 300, 1050, 1401, 2100]) {
        const { def, leaf, holeAlong } = readings(REPORTED, wallId, { position, width: 900 })
        if (position + 900 > def.length * 1000) continue // past this wall's end
        const leafAlong = def.axis === 'X' ? leaf.x : leaf.z
        const leafAcross = def.axis === 'X' ? leaf.z : leaf.x
        expect(leafAlong).toBeCloseTo(holeAlong, 6)
        expect(leafAcross).toBeCloseTo(def.face, 6)
      }
    }
  })
})
