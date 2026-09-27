/**
 * A freshly-placed furniture item or light must not land exactly on top of
 * the last one of its kind — that's what turned "add two items" into
 * "add one item, silently lose the second" on the mobile add-object sheet
 * (the desktop panels already staggered; the mobile sheet didn't).
 */
import { describe, it, expect } from 'vitest'
import { nextFurnitureOffsetMm, nextLightPositionMm } from '../placement'
import type { RoomGeometry } from '@/store/roomStore'

function abcd(a: number, b: number): RoomGeometry {
  return {
    walls: [
      { id: 'A', length: a, elements: [] },
      { id: 'B', length: b, elements: [] },
      { id: 'C', length: a, elements: [] },
      { id: 'D', length: b, elements: [] },
    ],
  }
}

describe('nextFurnitureOffsetMm', () => {
  it('places the first instance at the origin', () => {
    expect(nextFurnitureOffsetMm(0)).toEqual({ x: 0, y: 0 })
  })

  it('staggers each subsequent instance', () => {
    expect(nextFurnitureOffsetMm(1)).toEqual({ x: 300, y: 300 })
    expect(nextFurnitureOffsetMm(2)).toEqual({ x: 600, y: 600 })
  })

  it('two different counts never produce the same offset within one cycle', () => {
    const a = nextFurnitureOffsetMm(1)
    const b = nextFurnitureOffsetMm(2)
    expect(a).not.toEqual(b)
  })

  it('wraps rather than walking off the floor indefinitely', () => {
    // (4 * 300) % 1000 = 200 — back near the start of the range, not 1200mm out
    expect(nextFurnitureOffsetMm(4)).toEqual({ x: 200, y: 200 })
  })
})

describe('nextLightPositionMm', () => {
  it('centres the first light in the room', () => {
    const geometry = abcd(4000, 3000)
    const pos = nextLightPositionMm(geometry, 0)
    // W=4m,D=3m → centre (2000,1500), jitter/offset both 0 for the 0th light
    expect(pos).toEqual({ xMm: 1625, zMm: 1250 })
  })

  it('nudges each subsequent light off the last one', () => {
    const geometry = abcd(4000, 3000)
    const first = nextLightPositionMm(geometry, 0)
    const second = nextLightPositionMm(geometry, 1)
    const third = nextLightPositionMm(geometry, 2)
    expect(second).not.toEqual(first)
    expect(third).not.toEqual(first)
    expect(third).not.toEqual(second)
  })

  it('scales with actual room size instead of a fixed point', () => {
    // A fixed (2000, 1500) point — the mobile sheet's old hardcoded value —
    // would land outside a small room; the shared helper must not do that.
    const tiny = abcd(1800, 1800)
    const pos = nextLightPositionMm(tiny, 0)
    expect(pos.xMm).toBeGreaterThan(0)
    expect(pos.xMm).toBeLessThan(1800)
    expect(pos.zMm).toBeGreaterThan(0)
    expect(pos.zMm).toBeLessThan(1800)
  })
})
