/**
 * A patch of tiled floor at a given tile size, for the floor ring's Kafel
 * buttons.
 *
 * The pattern previews (PatternThumb) draw a layout from its catalogue
 * defaults and ignore the sizes, so four tile sizes of the same stack bond all
 * came out identical — which is the one thing these buttons are choosing
 * between. This draws the sizes themselves: the same square of floor each
 * time, so a 1200×600 tile reads as a larger tile rather than a larger
 * picture.
 */
const SPAN_CM = 240
const GROUT_CM = 0.6

export function TileThumb({ lengthCm, widthCm, color = '#D8D8D0' }: {
  /** Along the floor — the tile's long side as the user names it. */
  lengthCm: number
  widthCm: number
  color?: string
}) {
  const k = 100 / SPAN_CM
  const cols = Math.ceil(SPAN_CM / lengthCm)
  const rows = Math.ceil(SPAN_CM / widthCm)
  const tiles: { x: number; y: number; w: number; h: number }[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tiles.push({
        x: c * lengthCm * k + (GROUT_CM * k) / 2,
        y: r * widthCm * k + (GROUT_CM * k) / 2,
        w: (lengthCm - GROUT_CM) * k,
        h: (widthCm - GROUT_CM) * k,
      })
    }
  }
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden>
      {/* The grout, showing through the joints. */}
      <rect x="0" y="0" width="100" height="100" fill="#8F8F88" />
      {tiles.map((t, i) => (
        <rect key={i} x={t.x} y={t.y} width={t.w} height={t.h} fill={color} rx={0.4} />
      ))}
    </svg>
  )
}
