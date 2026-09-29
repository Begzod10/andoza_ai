/**
 * The oak boards a parquet floor is laid from by default.
 *
 * Twelve photographed boards, one per file, each cropped from its own sheet
 * clear of the joints either side — so a plank wears one board, not a panel of
 * six with fake seams down it. They are dealt out across the floor, because a
 * real floor is not one plank photographed a thousand times: the variation
 * between boards IS what wood looks like, and per-plank tone jitter alone
 * cannot fake a different grain.
 *
 * Boards only. A tile floor has its own faces (lib/tileCatalog), and a floor
 * the user has given an image of their own keeps that image everywhere.
 */
export const PARQUET_BOARDS: string[] = Array.from(
  { length: 12 },
  (_, i) => `/floor/parquet/oak-${String(i + 1).padStart(2, '0')}.jpg`,
)

/** Floor types laid from boards, which is what these are for. */
const BOARD_FLOORS = new Set(['parquet', 'laminate'])

/**
 * The boards to lay a floor from, or none.
 *
 * None when the floor is not boards, or when the user has chosen an image for
 * it — their pick is the whole floor then, not one board among twelve.
 */
export function parquetBoardsFor(
  floorType: string | undefined,
  chosenTextureUrl: string | null | undefined,
): string[] {
  if (chosenTextureUrl) return []
  return BOARD_FLOORS.has(floorType ?? 'parquet') ? PARQUET_BOARDS : []
}

/**
 * Which board a plank gets — by where it lies, so the floor is stable: the
 * same plank keeps its board across a re-render, a resize, and a reload, and
 * two planks side by side are as likely to differ as any other pair.
 */
export function boardIndexAt(x: number, z: number, count: number): number {
  if (count <= 1) return 0
  // A cheap spatial hash. The multipliers are large and coprime-ish so
  // neighbouring planks land far apart in the sequence rather than walking
  // through the boards in order, which would read as a repeating stripe.
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return Math.floor((h - Math.floor(h)) * count) % count
}
