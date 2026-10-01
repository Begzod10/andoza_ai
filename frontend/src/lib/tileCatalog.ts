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
  /** Names this face's baked wall images — see `wallTileUrl`. */
  slug: string
}

export const TILE_FACES: TileFace[] = [
  { label: 'Oddiy', url: null, slug: 'plain' },
  { label: 'Marmar oq', url: '/floor/tile/marble-white.jpg', slug: 'marble-white' },
  { label: 'Marmar qora', url: '/floor/tile/marble-black.jpg', slug: 'marble-black' },
  { label: 'Marmar kulrang', url: '/floor/tile/marble-grey.jpg', slug: 'marble-grey' },
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
    // reads as a bad print. These are the user's, per tile type: a fine
    // rectified joint, a 1.5 mm eased edge, and barely any tone variation,
    // because one tile does look much like the next.
    gapMm: 0.5,
    bevelMm: 1.5,
    colorVariation: 0.12,
  }
}

/**
 * The same tiles, up a wall.
 *
 * A tiled floor is real geometry — a slab per tile, with the grout showing in
 * the gaps between them. A wall is a plane with an image on it, so a wall
 * tile's joint has to be in the image: `scripts/wallTileImages.py` bakes one
 * tile per file with half a joint along each edge, and repeating it lays the
 * other half against it. That is also why there is a file per size: 2 mm is a
 * different fraction of a 1200 mm tile than of a 300 mm one, and one image
 * shared between them would stretch the joint along with the tile.
 */
export function wallTileUrl(size: TileSize, face: TileFace): string {
  return `/wall/tile/${face.slug}-${size.lengthCm * 10}x${size.widthCm * 10}.jpg`
}

/**
 * The wall covering for one tile: the picture, and how many of it fit.
 *
 * `repeatX` is tiles per metre across the wall, so a 600 tile is 1/0.6 of
 * them. `repeatY` is a stretch ON TOP of the image's own aspect — and the
 * image is cut to the tile's proportions — so it is 1: the tile is already
 * the right shape, and anything else would squash it.
 */
export function wallTileCovering(size: TileSize, face: TileFace) {
  return {
    kind: 'texture' as const,
    url: wallTileUrl(size, face),
    // The face keeps its own colours; multiplied by the tile grey a white
    // marble comes out grey.
    color: '#ffffff',
    repeatX: 100 / size.lengthCm,
    repeatY: 1,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    // Glazed porcelain, not paper — what tells the wall to wear tile's gloss
    // rather than a wallpaper's.
    finish: 'tile' as const,
  }
}
