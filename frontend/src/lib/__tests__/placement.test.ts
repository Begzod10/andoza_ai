/**
 * A freshly-placed furniture item or light must not land exactly on top of
 * the last one of its kind — that's what turned "add two items" into
 * "add one item, silently lose the second" on the mobile add-object sheet
 * (the desktop panels already staggered; the mobile sheet didn't).
 */
import { describe, it, expect } from 'vitest'
import { nextFurnitureOffsetMm, nextLightPositionMm, fitDeviceHeightMm } from '../placement'
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

describe('fitDeviceHeightMm', () => {
  /** A split unit's indoor half: 300mm tall, catalogued at 2400mm. */
  const AC_H = 300
  const AC_MOUNT = 2400

  it('leaves it at its catalogue height in a standard room', () => {
    // 2400 + 300 is exactly 2700 — it fits, so nothing moves.
    expect(fitDeviceHeightMm(AC_MOUNT, AC_H, 2700)).toBe(2400)
  })

  it('leaves it alone in a tall room too', () => {
    expect(fitDeviceHeightMm(AC_MOUNT, AC_H, 3200)).toBe(2400)
  })

  it('brings it down under a low ceiling', () => {
    expect(fitDeviceHeightMm(AC_MOUNT, AC_H, 2500)).toBe(2200)
    expect(fitDeviceHeightMm(AC_MOUNT, AC_H, 2400)).toBe(2100)
  })

  it('never lets the device poke through the ceiling', () => {
    for (const ceiling of [2000, 2200, 2400, 2500, 2700, 3000]) {
      const y = fitDeviceHeightMm(AC_MOUNT, AC_H, ceiling)
      expect(y + AC_H).toBeLessThanOrEqual(ceiling)
    }
  })

  it('never puts it below the floor', () => {
    // A ceiling lower than the unit itself: nowhere to hang it.
    expect(fitDeviceHeightMm(AC_MOUNT, AC_H, 200)).toBe(0)
    expect(fitDeviceHeightMm(AC_MOUNT, AC_H, 0)).toBe(0)
  })

  it('does not disturb the devices that sit low anyway', () => {
    // A socket at 300mm and a switch at 900mm are nowhere near any ceiling.
    expect(fitDeviceHeightMm(300, 80, 2700)).toBe(300)
    expect(fitDeviceHeightMm(900, 80, 2500)).toBe(900)
  })
})
