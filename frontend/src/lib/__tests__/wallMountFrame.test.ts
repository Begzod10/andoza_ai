/**
 * A socket has to render ON the wall it was put on, in any room shape. The
 * bug these cover: the world position came from a switch on 'A'|'B'|'C'|'D'
 * whose default returned the origin, so in a drawn room — walls W1..Wn —
 * every device appeared standing in the middle of the floor.
 */
import { describe, it, expect } from 'vitest'
import { wallMountFrame, wallMountPoint, alongWallM } from '../wallMountFrame'
import { wallDefsFromVertices } from '../wallDefsFromVertices'

const W = 4
const D = 3
/** Half the faceplate's depth — how far it stands proud of the wall. */
const OFF = 0.013

describe('the legacy rectangle', () => {
  it('puts a device on each wall, facing into the room', () => {
    // Wall A is the back wall at z = -D/2; its faceplate must sit just inside.
    const a = wallMountFrame('A', W, D)!
    const pa = wallMountPoint(a, 1, OFF)
    expect(pa.x).toBeCloseTo(1 - W / 2, 9)
    expect(pa.z).toBeCloseTo(-D / 2 + OFF, 9)
    expect(a.ry).toBeCloseTo(0, 9)

    const c = wallMountFrame('C', W, D)!
    const pc = wallMountPoint(c, 1, OFF)
    expect(pc.x).toBeCloseTo(1 - W / 2, 9)
    expect(pc.z).toBeCloseTo(D / 2 - OFF, 9)

    const d = wallMountFrame('D', W, D)!
    const pd = wallMountPoint(d, 1, OFF)
    expect(pd.x).toBeCloseTo(-W / 2 + OFF, 9)
    expect(pd.z).toBeCloseTo(1 - D / 2, 9)

    const b = wallMountFrame('B', W, D)!
    const pb = wallMountPoint(b, 1, OFF)
    expect(pb.x).toBeCloseTo(W / 2 - OFF, 9)
    expect(pb.z).toBeCloseTo(1 - D / 2, 9)
  })

  it('never puts one at the room centre', () => {
    for (const id of ['A', 'B', 'C', 'D']) {
      const f = wallMountFrame(id, W, D)!
      const p = wallMountPoint(f, f.length / 2, OFF)
      expect(Math.hypot(p.x, p.z)).toBeGreaterThan(0.5)
    }
  })

  it('round-trips a position along the wall', () => {
    for (const id of ['A', 'B', 'C', 'D']) {
      const f = wallMountFrame(id, W, D)!
      for (const along of [0, 0.7, f.length / 2, f.length]) {
        const p = wallMountPoint(f, along, 0)
        expect(alongWallM(f, p)).toBeCloseTo(along, 9)
      }
    }
  })
})

describe('a drawn room', () => {
  // The same 4x3 rectangle, but expressed as a polygon with W1..W4 — the
  // server auto-fills vertices like this, so this is the shape a saved room
  // actually has. Millimetres, counter-clockwise.
  const RECT_VERTS: [number, number][] = [[0, 0], [4000, 0], [4000, 3000], [0, 3000]]
  const RECT_IDS = ['W1', 'W2', 'W3', 'W4']

  it('puts a device on the wall, not in the middle of the floor', () => {
    const defs = wallDefsFromVertices(RECT_VERTS, RECT_IDS)
    for (const id of RECT_IDS) {
      const f = wallMountFrame(id, W, D, defs)
      expect(f).not.toBeNull()
      const p = wallMountPoint(f!, f!.length / 2, OFF)
      // Dead centre is exactly the old broken answer.
      expect(Math.hypot(p.x, p.z)).toBeGreaterThan(0.5)
    }
  })

  it('faces the device into the room', () => {
    const defs = wallDefsFromVertices(RECT_VERTS, RECT_IDS)
    for (const id of RECT_IDS) {
      const f = wallMountFrame(id, W, D, defs)!
      // On the wall itself, then one step along the normal: that step must
      // move toward the room's middle, never out through the wall.
      const onWall = wallMountPoint(f, f.length / 2, 0)
      const inset = wallMountPoint(f, f.length / 2, 0.2)
      expect(Math.hypot(inset.x, inset.z)).toBeLessThan(Math.hypot(onWall.x, onWall.z))
    }
  })

  it('round-trips a position along a diagonal wall', () => {
    // An L-shape has edges that are not axis-aligned in general; this one at
    // least exercises non-A..D ids across several orientations.
    const L: [number, number][] = [[0, 0], [5000, 0], [5000, 2000], [2500, 2000], [2500, 4000], [0, 4000]]
    const ids = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6']
    const defs = wallDefsFromVertices(L, ids)
    for (const id of ids) {
      const f = wallMountFrame(id, 5, 4, defs)
      if (!f) continue
      for (const along of [0.2, f.length / 2, f.length - 0.2]) {
        const p = wallMountPoint(f, along, 0)
        expect(alongWallM(f, p)).toBeCloseTo(along, 9)
      }
    }
  })

  it('agrees with the rectangle it is really describing', () => {
    // W1..W4 trace the same four walls as A..D. A device the same distance
    // along the matching wall must land in the same place, or a room would
    // shift its sockets just by being saved and reloaded as a polygon.
    const defs = wallDefsFromVertices(RECT_VERTS, RECT_IDS)
    const pairs: [string, string][] = [['W1', 'A'], ['W3', 'C']]
    for (const [polyId, rectId] of pairs) {
      const fp = wallMountFrame(polyId, W, D, defs)!
      const fr = wallMountFrame(rectId, W, D)!
      expect(fp.length).toBeCloseTo(fr.length, 9)
      // Same normal, so the faceplate faces the same way.
      expect(fp.nx).toBeCloseTo(fr.nx, 9)
      expect(fp.nz).toBeCloseTo(fr.nz, 9)
    }
  })

  it('has no frame for a wall that does not exist', () => {
    expect(wallMountFrame('W9', W, D, {})).toBeNull()
    expect(wallMountFrame('nonsense', W, D)).toBeNull()
  })
})
