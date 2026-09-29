/**
 * How each named material behaves in light.
 *
 * The scene used one set of numbers for every floor and another for every
 * wall, so a polished tile and an oiled parquet reflected the room exactly
 * alike. A material is named — kafel, parket, oboy — and the name says how
 * glossy it is; these are those names' finishes, in one place, so the flat
 * floor, the laid pattern and the patch in a doorway cannot disagree.
 *
 * Gloss and roughness are the same number from opposite ends: a 70%-glossy
 * tile is roughness 0.30. The catalogue below is written in gloss, the way a
 * tile is sold, and converted once.
 */

export type SurfaceKind =
  | 'tile'
  | 'parquet'
  | 'laminate'
  | 'concrete'
  | 'wallpaper'
  | 'paint'
  | 'plaster'

export interface SurfaceFinish {
  /** 0 = mirror, 1 = chalk. */
  roughness: number
  metalness: number
  /** How much of the room's environment the surface picks up. */
  envMapIntensity: number
  /**
   * Height relief read from the diffuse image, when the surface has one.
   *
   * A bump map, not a displacement map: displacement moves real vertices, and
   * a floor plank is two triangles and a tile is one quad — there is nothing
   * there to move. Bump perturbs the normal instead, which at these depths
   * (a grout line, a plank chamfer, the weave of a paper) is the same picture
   * for a fraction of the cost. 0 leaves the surface flat.
   */
  bumpScale: number
}

/** Glossiness, in the percentages a material is described by. */
const GLOSS: Record<SurfaceKind, number> = {
  // Glazed porcelain: the user's floor, and the shiniest thing in a flat.
  tile: 75,
  // Lacquered parquet — some sheen, well short of a tile.
  parquet: 55,
  laminate: 60,
  // Bare screed reflects nothing.
  concrete: 12,
  // Paper has a slight sheen; vinyl more, but this is the safe middle.
  wallpaper: 18,
  paint: 12,
  // Plaster carries its own roughness map, so this is only the fallback.
  plaster: 0,
}

const FINISH: Record<SurfaceKind, Omit<SurfaceFinish, 'roughness'>> = {
  tile: { metalness: 0.06, envMapIntensity: 0.65, bumpScale: 0.012 },
  parquet: { metalness: 0.02, envMapIntensity: 0.4, bumpScale: 0.03 },
  laminate: { metalness: 0.02, envMapIntensity: 0.45, bumpScale: 0.02 },
  concrete: { metalness: 0, envMapIntensity: 0.15, bumpScale: 0.04 },
  wallpaper: { metalness: 0, envMapIntensity: 0.25, bumpScale: 0.035 },
  paint: { metalness: 0, envMapIntensity: 0.3, bumpScale: 0 },
  plaster: { metalness: 0, envMapIntensity: 0.3, bumpScale: 0 },
}

export function surfaceFinish(kind: SurfaceKind): SurfaceFinish {
  return { roughness: 1 - GLOSS[kind] / 100, ...FINISH[kind] }
}

/** The floor types the store stores, as finishes. Anything unknown is treated
 *  as parquet, which is the schema's own default. */
export function floorFinish(floorType: string | undefined): SurfaceFinish {
  return surfaceFinish(
    floorType === 'tile' || floorType === 'laminate' || floorType === 'concrete'
      ? floorType
      : 'parquet',
  )
}
