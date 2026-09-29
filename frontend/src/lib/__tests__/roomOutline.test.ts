/**
 * The ceiling designs are axis-aligned boxes built for a W x D room. Asking
 * whether an outline is one is what keeps them out of the rooms they would
 * cut through.
 */
import { describe, it, expect } from 'vitest'
import { isAxisAlignedRectangle, outlineSpan, type Outline } from '../roomOutline'

const rect: Outline = [[-2, -1.5], [2, -1.5], [2, 1.5], [-2, 1.5]]

describe('isAxisAlignedRectangle', () => {
  it('accepts a rectangle on the axes', () => {
    expect(isAxisAlignedRectangle(rect)).toBe(true)
  })

  it('accepts one a scan measured a few millimetres out', () => {
    const wonky: Outline = [[-2, -1.5], [2, -1.496], [2.003, 1.5], [-2, 1.498]]
    expect(isAxisAlignedRectangle(wonky)).toBe(true)
  })

  it('rejects a rectangle turned off the axes', () => {
    // The parts are axis-aligned boxes; a turned room is no more usable than
    // an L-shaped one.
    const turned: Outline = [[0, 0], [2, 1], [1, 3], [-1, 2]]
    expect(isAxisAlignedRectangle(turned)).toBe(false)
  })

  it('rejects an L-shaped room', () => {
    const ell: Outline = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 3], [0, 3]]
    expect(isAxisAlignedRectangle(ell)).toBe(false)
  })

  it('rejects a degenerate outline', () => {
    expect(isAxisAlignedRectangle([[0, 0], [0, 0], [1, 1], [1, 1]])).toBe(false)
    expect(isAxisAlignedRectangle([[0, 0], [1, 0], [1, 1]])).toBe(false)
    expect(isAxisAlignedRectangle([])).toBe(false)
  })
})

describe('outlineSpan', () => {
  it('measures the outline, wherever it sits', () => {
    expect(outlineSpan(rect)).toEqual({ W: 4, D: 3 })
    const moved: Outline = rect.map(([x, z]) => [x + 10, z - 5] as [number, number])
    expect(outlineSpan(moved)).toEqual({ W: 4, D: 3 })
  })

  it('answers zero for nothing', () => {
    expect(outlineSpan([])).toEqual({ W: 0, D: 0 })
  })
})
