/**
 * Texture UV repair.
 *
 * Rooms saved by an older Suvoq panel carry repeat values in the wrong units —
 * tiles-per-wall in `repeatX`, and a `repeatY` derived from a ceiling height
 * read as metres while the store holds millimetres. Those rooms render as
 * hairlines, so the numbers are repaired on the way in rather than left to
 * poison every view that reads them.
 */
import { describe, it, expect } from 'vitest'
import { repairDesignState, DEFAULT_DESIGN_STATE } from '../../store/roomStore'
import type { DesignState, WallCovering } from '../../store/roomStore'

function tex(repeatX: number, repeatY: number): WallCovering {
  return { kind: 'texture', url: 'http://x/a.jpg', color: '#ffffff', repeatX, repeatY, offsetX: 0, offsetY: 0, rotation: 0 }
}

function state(coverings: Record<string, WallCovering>): DesignState {
  return { ...DEFAULT_DESIGN_STATE, wallCoverings: { ...DEFAULT_DESIGN_STATE.wallCoverings, ...coverings } }
}

describe('repairDesignState', () => {
  it('leaves a sane covering exactly as it was', () => {
    const covering = tex(1 / 2.4, 1)
    expect(repairDesignState(state({ ALL: covering })).wallCoverings.ALL).toEqual(covering)
  })

  it('repairs the millimetre ceiling-height bug', () => {
    // 3 m room ÷ a 2 m tile, but read from 3000 mm → repeatY = 1500
    const out = repairDesignState(state({ ALL: tex(2.5, 1500) })).wallCoverings.ALL
    expect(out.kind).toBe('texture')
    if (out.kind !== 'texture') return
    expect(out.repeatY).toBe(1)
    expect(out.repeatX).toBeCloseTo(1 / 2.4)
    // The image itself is not a casualty of the repair
    expect(out.url).toBe('http://x/a.jpg')
  })

  it('repairs a zero or negative repeat rather than dividing by it', () => {
    for (const bad of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      const out = repairDesignState(state({ ALL: tex(bad, 1) })).wallCoverings.ALL
      if (out.kind !== 'texture') throw new Error('expected texture')
      expect(out.repeatX).toBeCloseTo(1 / 2.4)
    }
  })

  it('repairs per-wall overrides, not just ALL', () => {
    const out = repairDesignState(state({ ALL: tex(0.5, 1), B: tex(2.5, 1500) })).wallCoverings
    if (out.B?.kind !== 'texture') throw new Error('expected texture')
    expect(out.B.repeatY).toBe(1)
    // and the already-fine one is untouched
    if (out.ALL.kind !== 'texture') throw new Error('expected texture')
    expect(out.ALL.repeatX).toBe(0.5)
  })

  it('does not touch paint or oboy coverings', () => {
    const paint: WallCovering = { kind: 'paint', color: '#123456' }
    const oboy: WallCovering = { kind: 'oboy', patternId: 'stripes', baseColor: '#fff', accentColor: '#000' }
    const out = repairDesignState(state({ ALL: paint, C: oboy })).wallCoverings
    expect(out.ALL).toEqual(paint)
    expect(out.C).toEqual(oboy)
  })
})
