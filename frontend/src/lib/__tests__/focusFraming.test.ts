/**
 * "when there are several rooms and one is focused, camera and dragging ...
 * should focus on that room, when unfocused, it should focus on the pivot of
 * whole geometry in scene". The orbit pivot (and the framing around it) is
 * the focused room's centre, or the centre of the whole flat.
 */
import { describe, expect, it } from 'vitest'
import { focusFraming, type FlatRoomBox } from '@/lib/focusFraming'

// The open room's own corner framing, 4 x 3 m, 3 m high (getCamera 'corner').
const cam = {
  position: [-2.08, 3.15, -1.56] as [number, number, number],
  target: [0.16, 0.66, 0.12] as [number, number, number],
}
const active: FlatRoomBox = { id: 'a', cx: 0, cz: 0, w: 4, d: 3 }
const east: FlatRoomBox = { id: 'b', cx: 3.95, cz: 0, w: 3.5, d: 3 }

describe('focusFraming', () => {
  it('leaves a one-room project exactly as it was', () => {
    expect(focusFraming(cam, [active], null)).toEqual(cam)
  })

  it('leaves the open room framed as it was when it is the focused one', () => {
    expect(focusFraming(cam, [active, east], 'a')).toEqual(cam)
  })

  it('pivots on the focused neighbour, at its centre', () => {
    const f = focusFraming(cam, [active, east], 'b')
    expect(f.target[0]).toBeCloseTo(3.95 + 0.16)
    expect(f.target[2]).toBeCloseTo(0.12)
    // Looking from the same side as before.
    expect(f.position[0]).toBeLessThan(f.target[0])
  })

  it('pivots on the middle of the whole flat when nothing is focused', () => {
    const f = focusFraming(cam, [active, east], null)
    // The flat runs x −2 … 5.7, so its middle is 1.85.
    expect(f.target[0]).toBeCloseTo(1.85 + 0.16)
    // And stands further back, to take the whole flat in.
    const dist = (p: number[], t: number[]) => Math.hypot(p[0] - t[0], p[1] - t[1], p[2] - t[2])
    expect(dist(f.position, f.target)).toBeGreaterThan(dist(cam.position, cam.target))
  })

  it('falls back to the open room when the focused room is not in the flat', () => {
    expect(focusFraming(cam, [active, east], 'gone')).toEqual(cam)
  })
})
