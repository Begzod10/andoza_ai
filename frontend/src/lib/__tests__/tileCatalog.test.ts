/**
 * Two menus offer these tiles, and they have to offer the same ones — a size
 * in one and not the other is a tile the user can reach from one place and
 * not another.
 */
import { describe, it, expect } from 'vitest'
import { TILE_SIZES, TILE_FACES, TILE_PATTERN_ID, tileSettings } from '../tileCatalog'

describe('the tile catalogue', () => {
  it('leads with 600x600, the one most floors are laid in', () => {
    expect(TILE_SIZES[0].label).toBe('600×600')
    expect(TILE_SIZES[0]).toMatchObject({ lengthCm: 60, widthCm: 60 })
  })

  it('offers a plain tile as well as the marbles', () => {
    expect(TILE_FACES[0].url).toBeNull()
    expect(TILE_FACES.filter((f) => f.url).length).toBe(3)
  })
})

describe('tileSettings', () => {
  const square = TILE_SIZES[0]
  const oblong = TILE_SIZES.find((t) => t.label === '1200×600')!
  const marble = TILE_FACES.find((f) => f.label === 'Marmar oq')!
  const plain = TILE_FACES[0]

  it('lays the tile at the size that was picked', () => {
    expect(tileSettings(oblong, plain)).toMatchObject({ plankLengthCm: 120, plankWidthCm: 60 })
  })

  it('lets the marble keep its own colours', () => {
    // Multiplied by the tile grey, a white marble comes out grey.
    expect(tileSettings(square, marble).baseColor).toBe('#ffffff')
    expect(tileSettings(square, marble).textureUrl).toBe(marble.url)
  })

  it('leaves a plain tile its own tone and no image', () => {
    expect(tileSettings(square, plain).textureUrl).toBeNull()
    expect(tileSettings(square, plain).baseColor).toBeUndefined()
  })

  it('runs the veining down an oblong tile, not across it', () => {
    expect(tileSettings(oblong, marble).textureRotation).toBe(90)
    expect(tileSettings(square, marble).textureRotation).toBe(0)
  })

  it('is always the same bond — the size and the face are the choices', () => {
    expect(TILE_PATTERN_ID).toBe('stake_bond')
  })
})
