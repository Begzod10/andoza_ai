/**
 * The numbers the user dialled in per pattern, which are now what each one is
 * laid with. They were set from the design panel's own sliders, so the way to
 * check them is through the resolver the floor is built from.
 */
import { describe, it, expect } from 'vitest'
import {
  FLOOR_PATTERN_DEFS, floorPatternDef, resolveFloorPattern, floorSlabColorFor,
} from '../floorGeometry'
import { TILE_SIZES, TILE_FACES, tileSettings } from '../tileCatalog'

const laid = (id: string) => {
  const def = floorPatternDef(id)!
  const r = resolveFloorPattern(def, undefined, '#C9AB7E')
  return {
    lengthCm: Math.round(r.lM * 100),
    widthCm: Math.round(r.wM * 100),
    gapMm: r.gapM * 1000,
    bevelMm: r.bevelM * 1000,
    variation: r.variation,
  }
}

describe('what each pattern is laid with, by default', () => {
  it('herringbone: 49 x 7, 1 mm arris, 65%', () => {
    expect(laid('herringbone')).toMatchObject({ lengthCm: 49, widthCm: 7, bevelMm: 1, variation: 0.65 })
  })

  it('double herringbone: 48 x 9, 1 mm arris, 65%', () => {
    expect(laid('double_herringbone')).toMatchObject({ lengthCm: 48, widthCm: 9, bevelMm: 1, variation: 0.65 })
  })

  it('chevron: 55 x 9, 1 mm arris, 60%', () => {
    expect(laid('chevron')).toMatchObject({ lengthCm: 55, widthCm: 9, bevelMm: 1, variation: 0.6 })
  })

  it('wood strip: 120 x 20, 1 mm arris, 60%', () => {
    expect(laid('wood_strip')).toMatchObject({ lengthCm: 120, widthCm: 20, bevelMm: 1, variation: 0.6 })
  })

  it('brick bond: 90 x 15, half-millimetre arris, 75%', () => {
    expect(laid('brick_bond')).toMatchObject({ lengthCm: 90, widthCm: 15, bevelMm: 0.5, variation: 0.75 })
  })

  it('stake bond: 120 x 20, half-millimetre arris, 75%', () => {
    expect(laid('stake_bond')).toMatchObject({ lengthCm: 120, widthCm: 20, bevelMm: 0.5, variation: 0.75 })
  })

  it('closes the joints on every parquet — these are boards, not pavers', () => {
    for (const def of FLOOR_PATTERN_DEFS) expect(laid(def.id).gapMm).toBe(0)
  })

  it('still lets a floor say otherwise', () => {
    const def = floorPatternDef('chevron')!
    const r = resolveFloorPattern(def, { bevelMm: 3, colorVariation: 0 }, '#C9AB7E')
    expect(r.bevelM * 1000).toBe(3)
    expect(r.variation).toBe(0)
  })
})

describe('tile, which shares the stack bond', () => {
  it('is laid as the user set it: 0.5 mm joint, 1.5 mm arris, 12%', () => {
    // The pattern's own numbers are a board's; a tile says its own.
    const def = floorPatternDef('stake_bond')!
    const r = resolveFloorPattern(def, tileSettings(TILE_SIZES[0], TILE_FACES[0]), '#D8D8D0')
    expect(r.gapM * 1000).toBeCloseTo(0.5, 6)
    expect(r.bevelM * 1000).toBeCloseTo(1.5, 6)
    expect(r.variation).toBeCloseTo(0.12, 6)
  })

  it('is grouted white, not shadowed black', () => {
    // What shows through the joints IS the joint. The dark slab that makes
    // plank gaps read as shadow turns a tiled floor into a grid of black
    // lines, which no bathroom has.
    const pattern = { settings: tileSettings(TILE_SIZES[0], TILE_FACES[1]) }
    const grout = floorSlabColorFor(pattern, '#D8D8D0', 'tile')
    expect(grout.toLowerCase()).not.toBe('#2a2521')
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(grout.slice(i, i + 2), 16))
    expect(Math.min(r, g, b)).toBeGreaterThan(200)
  })

  it('leaves a plank floor its shadow', () => {
    const boards = { settings: { textureUrl: '/floor/parquet/oak-01.jpg' } }
    expect(floorSlabColorFor(boards, '#C9AB7E', 'parquet').toLowerCase()).toBe('#2a2521')
  })

  it('keeps the tile size it was given', () => {
    const def = floorPatternDef('stake_bond')!
    const size = TILE_SIZES.find((t) => t.label === '300×600')!
    const r = resolveFloorPattern(def, tileSettings(size, TILE_FACES[0]), '#D8D8D0')
    expect(Math.round(r.lM * 100)).toBe(60)
    expect(Math.round(r.wM * 100)).toBe(30)
  })
})
