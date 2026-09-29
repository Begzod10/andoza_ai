/**
 * A material is named, and the name says how it behaves in light. These are
 * the numbers the user specified, checked from the gloss end they were given
 * in — a 70%-glossy tile is roughness 0.30, and one set of numbers for every
 * floor is what made a polished tile and an oiled parquet reflect alike.
 */
import { describe, it, expect } from 'vitest'
import { surfaceFinish, floorFinish, rimColorFor, type SurfaceKind } from '../surfaceFinish'

const gloss = (kind: SurfaceKind) => Math.round((1 - surfaceFinish(kind).roughness) * 100)

describe('the finishes', () => {
  it('makes tile at least 70% glossy', () => {
    expect(gloss('tile')).toBeGreaterThanOrEqual(70)
  })

  it('makes parquet 55% glossy — just over half matte', () => {
    expect(gloss('parquet')).toBe(55)
    expect(surfaceFinish('parquet').roughness).toBeCloseTo(0.45, 10)
  })

  it('keeps tile glossier than parquet, and parquet than concrete', () => {
    expect(gloss('tile')).toBeGreaterThan(gloss('parquet'))
    expect(gloss('parquet')).toBeGreaterThan(gloss('concrete'))
  })

  it('reflects more from the glossier surface', () => {
    // Gloss without reflection is just a pale surface.
    expect(surfaceFinish('tile').envMapIntensity)
      .toBeGreaterThan(surfaceFinish('parquet').envMapIntensity)
  })

  it('gives a bump to the surfaces whose image describes relief', () => {
    // Grout lines, plank gaps, a paper's weave.
    for (const k of ['tile', 'parquet', 'laminate', 'wallpaper'] as SurfaceKind[]) {
      expect(surfaceFinish(k).bumpScale).toBeGreaterThan(0)
    }
    // Flat paint and the plaster PBR set (which has real maps) get none.
    expect(surfaceFinish('paint').bumpScale).toBe(0)
    expect(surfaceFinish('plaster').bumpScale).toBe(0)
  })

  it('keeps a deeper relief on wood and paper than on a flat tile', () => {
    expect(surfaceFinish('parquet').bumpScale).toBeGreaterThan(surfaceFinish('tile').bumpScale)
  })

  it('stays physically sane', () => {
    for (const k of ['tile', 'parquet', 'laminate', 'concrete', 'wallpaper', 'paint', 'plaster'] as SurfaceKind[]) {
      const f = surfaceFinish(k)
      expect(f.roughness).toBeGreaterThanOrEqual(0)
      expect(f.roughness).toBeLessThanOrEqual(1)
      // None of these is a metal.
      expect(f.metalness).toBeLessThan(0.1)
    }
  })
})

describe('floorFinish', () => {
  it('reads the store\'s floor types', () => {
    expect(floorFinish('tile')).toEqual(surfaceFinish('tile'))
    expect(floorFinish('concrete')).toEqual(surfaceFinish('concrete'))
  })

  it('falls back to parquet, the schema default', () => {
    expect(floorFinish(undefined)).toEqual(surfaceFinish('parquet'))
    expect(floorFinish('marble-ish')).toEqual(surfaceFinish('parquet'))
  })
})

describe('rimColorFor', () => {
  it('gives a tile a milky arris, whatever is printed on its face', () => {
    // A black marble tile still has a pale edge; drawing the edge with the
    // marble makes the floor read as one printed sheet rather than as tiles.
    const rim = rimColorFor('tile')!
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(rim.slice(i, i + 2), 16))
    expect(Math.min(r, g, b)).toBeGreaterThan(220)
  })

  it('leaves a board alone — an oak chamfer is oak', () => {
    expect(rimColorFor('parquet')).toBeUndefined()
    expect(rimColorFor('laminate')).toBeUndefined()
    expect(rimColorFor(undefined)).toBeUndefined()
  })
})
