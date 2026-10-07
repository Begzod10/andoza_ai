import { describe, it, expect } from 'vitest'
import type { RoomGeometry } from '@/store/roomStore'
import { furnitureSpot, isFourWallRoom, isZone, lightSpot, type Rect } from '../aiDesignLayout'

// 4.0 m (walls A, C) x 3.0 m (walls B, D); lengths are millimetres in the store.
const room = (): RoomGeometry => ({
  walls: [
    { id: 'A', length: 4000, elements: [] }, { id: 'B', length: 3000, elements: [] },
    { id: 'C', length: 4000, elements: [] }, { id: 'D', length: 3000, elements: [] },
  ],
}) as RoomGeometry
const W = 4, D = 3
const sofa = { w: 2.0, d: 0.9 }

const inside = (r: Rect) => Math.abs(r.x) + r.hw <= W / 2 + 1e-6 && Math.abs(r.z) + r.hd <= D / 2 + 1e-6
const overlap = (a: Rect, b: Rect) => Math.abs(a.x - b.x) < a.hw + b.hw && Math.abs(a.z - b.z) < a.hd + b.hd

describe('furnitureSpot', () => {
  it('puts a piece against wall A with its back to it, front into the room', () => {
    const s = furnitureSpot('wall_A', sofa, room(), [])
    expect(s.z).toBeCloseTo(-D / 2 + sofa.d / 2 + 0.04, 5) // A is the back wall, z = -D/2
    expect(s.x).toBeCloseTo(0, 5) // centred along it
    expect(s.rotation).toBe(0)
  })

  it('faces each wall into the room: C turns round, B and D a quarter turn, and their footprint swaps', () => {
    const c = furnitureSpot('wall_C', sofa, room(), [])
    expect(c.z).toBeGreaterThan(D / 2 - 1) && expect(c.rotation).toBeCloseTo(Math.PI, 5)
    const d = furnitureSpot('wall_D', sofa, room(), [])
    expect(d.x).toBeCloseTo(-W / 2 + sofa.d / 2 + 0.04, 5)
    expect(d.rect.hw).toBeCloseTo(sofa.d / 2, 5) // turned: its depth now runs along x
    expect(d.rect.hd).toBeCloseTo(sofa.w / 2, 5)
    expect(furnitureSpot('wall_B', sofa, room(), []).x).toBeGreaterThan(0)
  })

  it('keeps every spot inside the room', () => {
    for (const zone of ['center', 'wall_A', 'wall_B', 'wall_C', 'wall_D', 'corner_AB', 'corner_BC', 'corner_CD', 'corner_DA'] as const) {
      expect(inside(furnitureSpot(zone, sofa, room(), []).rect)).toBe(true)
    }
  })

  it('puts a corner piece in the corner it was asked for', () => {
    const ab = furnitureSpot('corner_AB', { w: 0.5, d: 0.5 }, room(), [])
    expect(ab.x).toBeGreaterThan(W / 2 - 0.6) && expect(ab.z).toBeLessThan(-D / 2 + 0.6) // +x end of wall A
    const cd = furnitureSpot('corner_CD', { w: 0.5, d: 0.5 }, room(), [])
    expect(cd.x).toBeLessThan(-W / 2 + 0.6) && expect(cd.z).toBeGreaterThan(D / 2 - 0.6)
  })

  it('does not stack two pieces on the same wall: the second slides along', () => {
    const first = furnitureSpot('wall_A', { w: 1.2, d: 0.5 }, room(), [])
    const second = furnitureSpot('wall_A', { w: 1.2, d: 0.5 }, room(), [first.rect])
    expect(overlap(first.rect, second.rect)).toBe(false)
    expect(second.rect.z).toBeCloseTo(first.rect.z, 5) // still against the same wall
  })

  it('moves a piece off a full wall to the nearest free place instead of piling it on', () => {
    const wall = furnitureSpot('wall_A', { w: 3.8, d: 0.6 }, room(), []) // fills wall A
    const next = furnitureSpot('wall_A', { w: 1.0, d: 0.6 }, room(), [wall.rect])
    expect(overlap(wall.rect, next.rect)).toBe(false)
    expect(inside(next.rect)).toBe(true)
  })

  it('still places a piece when the whole room is full, rather than losing it', () => {
    const everything: Rect = { x: 0, z: 0, hw: W, hd: D }
    const s = furnitureSpot('center', sofa, room(), [everything])
    expect(Number.isFinite(s.x) && Number.isFinite(s.z)).toBe(true)
  })

  it('the middle zone goes to the middle', () => {
    const s = furnitureSpot('center', { w: 1, d: 0.6 }, room(), [])
    expect([s.x, s.z]).toEqual([0, 0])
  })
})

describe('lightSpot', () => {
  const mm = (xMm: number, zMm: number) => [xMm / 1000 - W / 2, zMm / 1000 - D / 2]

  it('hangs a ceiling light in the middle of the room', () => {
    const s = lightSpot('center', 'ceiling', room(), 0)
    expect(s).toEqual({ xMm: 2000, zMm: 1500 })
  })

  it('does not stack several lights of one zone on one point', () => {
    const spots = [0, 1, 2].map((n) => lightSpot('center', 'ceiling', room(), n))
    expect(new Set(spots.map((s) => `${s.xMm}|${s.zMm}`)).size).toBe(3)
  })

  it('fixes a wall lamp to its wall and keeps a ceiling light near the wall off it', () => {
    const lamp = lightSpot('wall_B', 'wall', room(), 0)
    expect(lamp.wallId).toBe('B')
    expect(mm(lamp.xMm, lamp.zMm)[0]).toBeCloseTo(W / 2 - 0.12, 1)
    const pendant = lightSpot('wall_B', 'ceiling', room(), 0)
    expect(pendant.wallId).toBeUndefined()
    expect(mm(pendant.xMm, pendant.zMm)[0]).toBeLessThan(W / 2 - 0.5)
  })

  it('places a corner light inside its corner and the room', () => {
    const [x, z] = mm(...(Object.values(lightSpot('corner_CD', 'floor', room(), 0)).slice(0, 2) as [number, number]))
    expect(x).toBeLessThan(0) && expect(z).toBeGreaterThan(0)
    expect(Math.abs(x)).toBeLessThanOrEqual(W / 2) && expect(Math.abs(z)).toBeLessThanOrEqual(D / 2)
  })
})

describe('zones', () => {
  it('knows its own names and the four-wall room', () => {
    expect(isZone('wall_A') && isZone('corner_DA') && isZone('center')).toBe(true)
    expect(isZone('wall_Z') || isZone('ceiling')).toBe(false)
    expect(isFourWallRoom(room())).toBe(true)
    expect(isFourWallRoom({ walls: [{ id: 'W1', length: 1, elements: [] }] } as unknown as RoomGeometry)).toBe(false)
  })
})
