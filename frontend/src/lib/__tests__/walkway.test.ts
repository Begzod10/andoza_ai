import { describe, it, expect } from 'vitest'
import type { RoomGeometry, WallElement } from '@/store/roomStore'
import { roomModel, type Rect } from '../aiDesignLayout'
import { doorEntries, walkable } from '../walkway'

const door = (position: number): WallElement =>
  ({ id: 'door', type: 'eshik', width: 900, height: 2100, sill_height: 0, position, positionAuto: false }) as WallElement

/** 4 m (walls A, C) x 3 m (walls B, D); optional door on wall A. */
const room = (withDoor = true): RoomGeometry => ({
  walls: [
    { id: 'A', length: 4000, elements: withDoor ? [door(500)] : [] }, { id: 'B', length: 3000, elements: [] },
    { id: 'C', length: 4000, elements: [] }, { id: 'D', length: 3000, elements: [] },
  ],
}) as RoomGeometry

const rect = (x: number, z: number, w: number, d: number): Rect => ({ x, z, w, d, rotation: 0 })

describe('walkway', () => {
  it('reaches a point in an empty room from the door', () => {
    const m = roomModel(room())
    expect(walkable(m, [], doorEntries(m), [[1, 1]])).toBe(true)
  })

  it('is cut off by a wall-to-wall bar between door and target', () => {
    const m = roomModel(room())
    const [e] = doorEntries(m)
    const target: [number, number] = [e[0], -e[1]]
    const bar = rect(0, 0, 4.2, 0.3)
    expect(walkable(m, [bar], [e], [target])).toBe(false)
  })

  it('needs a gap of the path width', () => {
    const m = roomModel(room())
    const [e] = doorEntries(m)
    // Two bars leaving a 0.6 m gap at x = 0 (from -0.3 to 0.3).
    const bars = [rect(-1.15, 0, 1.7, 0.3), rect(1.15, 0, 1.7, 0.3)]
    const through: [number, number] = [0, e[1]]
    expect(walkable(m, bars, [through], [[0, -e[1]]], 0.7)).toBe(false)
    expect(walkable(m, bars, [through], [[0, -e[1]]], 0.5)).toBe(true)
  })

  it('is true for a room with no doors', () => {
    const m = roomModel(room(false))
    expect(walkable(m, [], doorEntries(m), [[1, 1]])).toBe(true)
  })

  it('puts the door entry 0.40 m inside, on the door centreline', () => {
    const m = roomModel(room())
    const pts = doorEntries(m)
    expect(pts).toHaveLength(1)
    const o = m.openings.find((x) => x.kind === 'door')!
    const w = m.walls.find((x) => x.id === o.wallId)!
    const c = (o.from + o.to) / 2
    expect(pts[0][0]).toBeCloseTo(w.midX + w.dirX * c + w.nx * 0.4, 2)
    expect(pts[0][1]).toBeCloseTo(w.midZ + w.dirZ * c + w.nz * 0.4, 2)
  })

  it('does not count a strip between furniture and a wall narrower than the path', () => {
    const m = roomModel(room())
    // Rect from x -2 to 1, z 0.5 to 1.1: 0.40 m from wall C (z = 1.5), open to the right of x = 1.
    const sofa = rect(-0.5, 0.8, 3, 0.6)
    expect(walkable(m, [sofa], [[1.5, 0]], [[-1, 1.3]], 0.7)).toBe(false)
    expect(walkable(m, [sofa], [[1.5, 0]], [[-1, 1.3]], 0.3)).toBe(true)
  })

  it('blocks along a rotated rect, not its bounding box', () => {
    const m = roomModel(room())
    const diagonal: Rect = { x: 0, z: 0, w: 6, d: 0.2, rotation: Math.PI / 4 }
    expect(walkable(m, [diagonal], [[1.8, 0]], [[-1.8, 0]])).toBe(false)
    const short: Rect = { ...diagonal, w: 1 }
    expect(walkable(m, [short], [[1.8, 0]], [[-1.8, 0]])).toBe(true)
    // Inside the short bar's bounding box but clear of the bar itself.
    expect(walkable(m, [short], [[1.8, 0]], [[0.4, 0.4]])).toBe(true)
  })

  it('snaps a target inside furniture to free floor within 0.4 m', () => {
    const m = roomModel(room())
    expect(walkable(m, [rect(1, 0.5, 0.2, 0.2)], [[-1, 0]], [[1, 0.5]], 0.5)).toBe(true)
  })

  it('counts a target deep inside large furniture as unreachable', () => {
    const m = roomModel(room())
    expect(walkable(m, [rect(0.5, 0, 2, 1)], [[-1.5, 0]], [[0.5, 0]])).toBe(false)
  })

  it('puts the door entry inside the room', () => {
    const m = roomModel(room())
    const [e] = doorEntries(m)
    expect(m.inside({ x: e[0], z: e[1], w: 0.1, d: 0.1, rotation: 0 })).toBe(true)
  })
})
