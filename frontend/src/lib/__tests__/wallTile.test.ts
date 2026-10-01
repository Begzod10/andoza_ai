/**
 * Tiling a wall.
 *
 * The numbers here are the whole difference between a tiled wall and a smear:
 * `repeatX` is tiles per METRE (not per wall — an older writer got that wrong
 * and rooms saved by it still have to be repaired on the way in), and the
 * image is one tile cut to that tile's proportions, so the vertical stretch
 * that would otherwise correct the aspect has nothing to correct.
 */
import { describe, it, expect } from 'vitest'
import { TILE_SIZES, TILE_FACES, wallTileUrl, wallTileCovering } from '../tileCatalog'

const SQUARE = TILE_SIZES.find((t) => t.label === '600×600')!
const OBLONG = TILE_SIZES.find((t) => t.label === '1200×600')!
const WHITE = TILE_FACES.find((f) => f.slug === 'marble-white')!
const PLAIN = TILE_FACES.find((f) => f.slug === 'plain')!

describe('wallTileUrl', () => {
  it('names the file by the face and the tile, in millimetres', () => {
    expect(wallTileUrl(SQUARE, WHITE)).toBe('/wall/tile/marble-white-600x600.jpg')
    expect(wallTileUrl(OBLONG, PLAIN)).toBe('/wall/tile/plain-1200x600.jpg')
  })

  it('has a file for every tile the ring offers', () => {
    // A face with no image on the FLOOR still needs one on a wall: the floor
    // draws a plain tile out of geometry, and a wall has none to draw with.
    const urls = TILE_SIZES.flatMap((t) => TILE_FACES.map((f) => wallTileUrl(t, f)))
    expect(new Set(urls).size).toBe(TILE_SIZES.length * TILE_FACES.length)
    expect(urls.every((u) => /^\/wall\/tile\/[a-z-]+-\d+x\d+\.jpg$/.test(u))).toBe(true)
  })
})

describe('wallTileCovering', () => {
  it('fits a metre of wall with one and two thirds of a 600 tile', () => {
    expect(wallTileCovering(SQUARE, WHITE).repeatX).toBeCloseTo(1 / 0.6)
  })

  it('fits fewer of a bigger tile, in proportion', () => {
    const big = wallTileCovering(OBLONG, WHITE).repeatX
    expect(big).toBeCloseTo(1 / 1.2)
    expect(big * 2).toBeCloseTo(wallTileCovering(SQUARE, WHITE).repeatX)
  })

  it('never stretches the tile vertically — the image is already its shape', () => {
    for (const size of TILE_SIZES) {
      expect(wallTileCovering(size, WHITE).repeatY).toBe(1)
    }
  })

  it('stays inside the bounds the UV repair treats as sane', () => {
    // repairDesignState resets anything outside 0.02..60, taking it for the
    // old tiles-per-wall bug. A tile that tripped it would silently become a
    // 2.4 m sheet.
    for (const size of TILE_SIZES) {
      const c = wallTileCovering(size, WHITE)
      expect(c.repeatX).toBeGreaterThanOrEqual(0.02)
      expect(c.repeatX).toBeLessThanOrEqual(60)
    }
  })

  it('marks itself tile, so the wall wears porcelain rather than paper', () => {
    expect(wallTileCovering(SQUARE, PLAIN).finish).toBe('tile')
    expect(wallTileCovering(SQUARE, PLAIN).color).toBe('#ffffff')
  })
})
