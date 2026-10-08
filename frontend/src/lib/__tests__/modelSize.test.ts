import { describe, it, expect } from 'vitest'
import { describeSize, sizeFields } from '../modelSize'

describe('sizeFields', () => {
  it('turns a measured model into the fields the server stores', () => {
    expect(sizeFields({ width_cm: 210, depth_cm: 90, height_cm: 85 })).toEqual({ footprint_w: 210, footprint_d: 90, height_cm: 85 })
  })

  it('sends nothing for a model that could not be measured', () => {
    expect(sizeFields(null)).toEqual({})
  })

  it.each([
    ['zero', { width_cm: 0, depth_cm: 90, height_cm: 85 }],
    ['negative', { width_cm: 210, depth_cm: -1, height_cm: 85 }],
    ['not a number', { width_cm: NaN, depth_cm: 90, height_cm: 85 }],
    ['larger than the catalog holds', { width_cm: 210, depth_cm: 90, height_cm: 1500 }],
  ])('sends nothing for a size that is %s, rather than a number the server would refuse', (_n, size) => {
    expect(sizeFields(size)).toEqual({})
  })
})

describe('describeSize', () => {
  it('reads width × depth × height in whole centimetres', () => {
    expect(describeSize({ width_cm: 210.4, depth_cm: 89.6, height_cm: 85 })).toBe('210 × 90 × 85 sm')
  })
})
