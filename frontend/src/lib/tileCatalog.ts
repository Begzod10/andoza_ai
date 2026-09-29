/**
 * What a tiled floor is chosen by: the tile's size, and its face.
 *
 * Shared by the surface ring and the corner menu so the two offer the same
 * tiles — a size in one and not the other is a tile the user can reach from
 * one place and not another.
 */

export interface TileSize {
  /** As the user buys them, in millimetres. */
  label: string
  lengthCm: number
  widthCm: number
}

/** 600x600 first: it is the default, and the one most floors are laid in. */
export const TILE_SIZES: TileSize[] = [
  { label: '600×600', lengthCm: 60, widthCm: 60 },
  { label: '300×600', lengthCm: 60, widthCm: 30 },
  { label: '1200×600', lengthCm: 120, widthCm: 60 },
  { label: '400×400', lengthCm: 40, widthCm: 40 },
]

export interface TileFace {
  label: string
  /** `null` is the plain glazed tile the pattern draws on its own. */
  url: string | null
}

export const TILE_FACES: TileFace[] = [
  { label: 'Oddiy', url: null },
  { label: 'Marmar oq', url: '/floor/tile/marble-white.jpg' },
  { label: 'Marmar qora', url: '/floor/tile/marble-black.jpg' },
  { label: 'Marmar kulrang', url: '/floor/tile/marble-grey.jpg' },
]

/** Tile is always laid in the same stack bond; the size and the face are the
 *  choices. */
export const TILE_PATTERN_ID = 'stake_bond'

/**
 * The floor-pattern settings for one tile.
 *
 * The veining runs the long way down an oblong tile rather than across it,
 * and a photographed face keeps its own colours — multiplied by the tile grey
 * a white marble comes out grey.
 */
export function tileSettings(size: TileSize, face: TileFace) {
  return {
    plankLengthCm: size.lengthCm,
    plankWidthCm: size.widthCm,
    textureUrl: face.url,
    baseColor: face.url ? '#ffffff' : undefined,
    textureRotation: (size.lengthCm > size.widthCm ? 90 : 0) as 0 | 90,
    // Tile is laid in the stack bond, whose OWN numbers are a wide oak
    // board's — a fat arris and heavy tone variation, which on porcelain
    // reads as a bad print. A tile's joint is grout, and one tile looks much
    // like the next.
    gapMm: 3.5,
    bevelMm: 0.8,
    colorVariation: 0.12,
  }
}
