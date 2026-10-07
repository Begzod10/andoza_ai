import { describe, it, expect } from 'vitest'
import type { RoomGeometry } from '@/store/roomStore'
import { furnitureSpot, lightSpot, parseZone, rectBounds, roomModel, type Rect } from '../aiDesignLayout'

// 4.0 m (walls A, C) x 3.0 m (walls B, D); lengths are millimetres in the store.
const room = (): RoomGeometry => ({
  walls: [
    { id: 'A', length: 4000, elements: [] }, { id: 'B', length: 3000, elements: [] },
    { id: 'C', length: 4000, elements: [] }, { id: 'D', length: 3000, elements: [] },
  ],
}) as RoomGeometry
const W = 4, D = 3
const sofa = { w: 2.0, d: 0.9 }

/** An L-shaped drawn room, walls W1..W6 (millimetres): 5 x 4.5 m, with a 2.5 x 2 m notch cut out. */
const LROOM = (): RoomGeometry => ({
  walls: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6'].map((id) => ({ id, length: 3000, elements: [] })),
  vertices: [[0, 0], [5000, 0], [5000, 2500], [2500, 2500], [2500, 4500], [0, 4500]],
}) as RoomGeometry

const inside = (r: Rect) => { const b = rectBounds(r); return b.minX >= -W / 2 - 1e-6 && b.maxX <= W / 2 + 1e-6 && b.minZ >= -D / 2 - 1e-6 && b.maxZ <= D / 2 + 1e-6 }
const overlap = (a: Rect, b: Rect) => { const p = rectBounds(a), q = rectBounds(b); return p.minX < q.maxX && q.minX < p.maxX && p.minZ < q.maxZ && q.minZ < p.maxZ }
const four = () => roomModel(room())

describe('furnitureSpot in a four-wall room', () => {
  it('puts a piece against wall A with its back to it, front into the room', () => {
    const s = furnitureSpot('wall_A', sofa, four(), [])
    expect(s.z).toBeCloseTo(-D / 2 + sofa.d / 2 + 0.04, 5) // A is the back wall, z = -D/2
    expect(s.x).toBeCloseTo(0, 5) // centred along it
    expect(s.rotation).toBeCloseTo(0, 5)
  })

  it('faces each wall into the room: C turns round, B and D a quarter turn, and their footprint swaps', () => {
    const c = furnitureSpot('wall_C', sofa, four(), [])
    expect(c.z).toBeGreaterThan(D / 2 - 1)
    expect(Math.abs(c.rotation)).toBeCloseTo(Math.PI, 5)
    const d = furnitureSpot('wall_D', sofa, four(), [])
    expect(d.x).toBeCloseTo(-W / 2 + sofa.d / 2 + 0.04, 5)
    const bd = rectBounds(d.rect) // turned: its depth now runs along x
    expect(bd.maxX - bd.minX).toBeCloseTo(sofa.d, 5)
    expect(bd.maxZ - bd.minZ).toBeCloseTo(sofa.w, 5)
    expect(furnitureSpot('wall_B', sofa, four(), []).x).toBeGreaterThan(0)
  })

  it('keeps every spot inside the room', () => {
    for (const zone of ['center', 'wall_A', 'wall_B', 'wall_C', 'wall_D', 'corner_A_B', 'corner_B_C', 'corner_C_D', 'corner_D_A']) {
      expect(inside(furnitureSpot(zone, sofa, four(), []).rect)).toBe(true)
    }
  })

  it('puts a corner piece in the corner it was asked for, in either spelling', () => {
    for (const zone of ['corner_A_B', 'corner_AB']) {
      const ab = furnitureSpot(zone, { w: 0.5, d: 0.5 }, four(), [])
      expect(ab.x).toBeGreaterThan(W / 2 - 0.6) && expect(ab.z).toBeLessThan(-D / 2 + 0.6) // +x end of wall A
    }
    const cd = furnitureSpot('corner_C_D', { w: 0.5, d: 0.5 }, four(), [])
    expect(cd.x).toBeLessThan(-W / 2 + 0.6) && expect(cd.z).toBeGreaterThan(D / 2 - 0.6)
  })

  it('does not stack two pieces on the same wall: the second slides along', () => {
    const first = furnitureSpot('wall_A', { w: 1.2, d: 0.5 }, four(), [])
    const second = furnitureSpot('wall_A', { w: 1.2, d: 0.5 }, four(), [first.rect])
    expect(overlap(first.rect, second.rect)).toBe(false)
    expect(second.rect.z).toBeCloseTo(first.rect.z, 5) // still against the same wall
  })

  it('moves a piece off a full wall to the nearest free place instead of piling it on', () => {
    const wall = furnitureSpot('wall_A', { w: 3.8, d: 0.6 }, four(), []) // fills wall A
    const next = furnitureSpot('wall_A', { w: 1.0, d: 0.6 }, four(), [wall.rect])
    expect(overlap(wall.rect, next.rect)).toBe(false)
    expect(inside(next.rect)).toBe(true)
  })

  it('still places a piece when the whole room is full, rather than losing it', () => {
    const s = furnitureSpot('center', sofa, four(), [{ x: 0, z: 0, w: 2 * W, d: 2 * D, rotation: 0 }])
    expect(Number.isFinite(s.x) && Number.isFinite(s.z)).toBe(true)
  })

  it('the middle zone goes to the middle; a zone naming no wall of this room does too', () => {
    const s = furnitureSpot('center', { w: 1, d: 0.6 }, four(), [])
    expect([s.x, s.z]).toEqual([0, 0])
    expect(furnitureSpot('wall_Z9', { w: 1, d: 0.6 }, four(), []).rotation).toBe(0)
  })
})

describe('a drawn L-shaped room (walls W1..W6)', () => {
  const m = () => roomModel(LROOM())

  it('knows its walls by their own ids, and refuses the four-wall names', () => {
    expect(m().walls.map((w) => w.id)).toEqual(['W1', 'W2', 'W3', 'W4', 'W5', 'W6'])
    expect(parseZone('wall_W3', m())?.kind).toBe('wall')
    expect(parseZone('corner_W2_W3', m())?.kind).toBe('corner')
    expect(parseZone('wall_A', m())).toBeNull()
  })

  it('stands a piece against the named wall, front toward the room', () => {
    const model = m()
    for (const wall of model.walls) {
      const s = furnitureSpot(`wall_${wall.id}`, { w: 1.0, d: 0.5 }, model, [])
      // The piece faces the wall's inward normal, and sits on that side of the wall.
      expect(Math.sin(s.rotation)).toBeCloseTo(wall.nx, 5)
      expect(Math.cos(s.rotation)).toBeCloseTo(wall.nz, 5)
      expect((s.x - wall.midX) * wall.nx + (s.z - wall.midZ) * wall.nz).toBeGreaterThan(0)
    }
  })

  it('keeps every piece inside the outline and off the others, wall after wall', () => {
    const model = m()
    const taken: Rect[] = []
    for (const zone of ['wall_W1', 'wall_W1', 'wall_W2', 'wall_W5', 'corner_W3_W4', 'center', 'center']) {
      const s = furnitureSpot(zone, { w: 1.4, d: 0.7 }, model, taken)
      expect(model.inside(s.rect)).toBe(true)
      expect(taken.some((t) => overlap(s.rect, t))).toBe(false)
      taken.push(s.rect)
    }
  })

  it('does not put the middle zone in the notch: the middle of an L can be outside it', () => {
    const model = m()
    const s = furnitureSpot('center', { w: 1, d: 1 }, model, [])
    expect(model.inside(s.rect)).toBe(true)
  })

  it('places lights over the floor, a wall lamp on its wall', () => {
    const model = m()
    const lamp = lightSpot('wall_W2', 'wall', model, 0)
    expect(lamp.wallId).toBe('W2')
    const centre = lightSpot('center', 'ceiling', model, 0)
    const world = { x: (centre.xMm - model.offsetMm.x) / 1000, z: (centre.zMm - model.offsetMm.z) / 1000, w: 0.2, d: 0.2, rotation: 0 }
    expect(model.inside(world)).toBe(true)
  })
})

describe('lightSpot in a four-wall room', () => {
  const mm = (xMm: number, zMm: number) => [xMm / 1000 - W / 2, zMm / 1000 - D / 2]

  it('hangs a ceiling light in the middle of the room', () => {
    expect(lightSpot('center', 'ceiling', four(), 0)).toEqual({ xMm: 2000, zMm: 1500 })
  })

  it('does not stack several lights of one zone on one point', () => {
    const spots = [0, 1, 2].map((n) => lightSpot('center', 'ceiling', four(), n))
    expect(new Set(spots.map((s) => `${s.xMm}|${s.zMm}`)).size).toBe(3)
  })

  it('fixes a wall lamp to its wall and keeps a ceiling light near the wall off it', () => {
    const lamp = lightSpot('wall_B', 'wall', four(), 0)
    expect(lamp.wallId).toBe('B')
    expect(mm(lamp.xMm, lamp.zMm)[0]).toBeCloseTo(W / 2 - 0.12, 1)
    const pendant = lightSpot('wall_B', 'ceiling', four(), 0)
    expect(pendant.wallId).toBeUndefined()
    expect(mm(pendant.xMm, pendant.zMm)[0]).toBeLessThan(W / 2 - 0.5)
  })

  it('places a corner light inside its corner and the room', () => {
    const s = lightSpot('corner_C_D', 'floor', four(), 0)
    const [x, z] = mm(s.xMm, s.zMm)
    expect(x).toBeLessThan(0) && expect(z).toBeGreaterThan(0)
    expect(Math.abs(x)).toBeLessThanOrEqual(W / 2) && expect(Math.abs(z)).toBeLessThanOrEqual(D / 2)
  })
})
