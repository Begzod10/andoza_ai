import { describe, it, expect } from 'vitest'
import { appearScale, markWaited, placeholderSize } from './FurniturePlaceholder'

describe('placeholderSize', () => {
  it('uses the catalogue size, and a 60 cm side where it is missing or nonsense', () => {
    expect(placeholderSize(2.1, 0.9, 0.85)).toEqual({ w: 2.1, d: 0.9, h: 0.85 })
    expect(placeholderSize(1.2, 0, undefined)).toEqual({ w: 1.2, d: 0.6, h: 0.6 })
    expect(placeholderSize(NaN, -1, 0.01)).toEqual({ w: 0.6, d: 0.6, h: 0.6 })
  })
})

describe('appearScale', () => {
  it('leaves a piece that never waited alone: reopening a room does not make everything bounce', () => {
    expect(appearScale('never-waited', 0, 0.1)).toBeNull()
  })

  it('grows a model that was waited for from 85% to full size, once', () => {
    markWaited('b')
    const start = appearScale('b', 0, 0)!
    expect(start).toBeCloseTo(0.85)
    expect(appearScale('b', 0, 0.1)!).toBeGreaterThan(start)
    expect(appearScale('b', 0, 0.5)).toBe(1)
    expect(appearScale('b', 0, 0.6)).toBeNull()
  })
})
