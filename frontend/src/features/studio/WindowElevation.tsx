/**
 * Line-drawing elevation of a window style — the picker thumbnails, and any
 * other place a window needs to be shown face-on. Drawn straight from the
 * style spec (`layoutPanes`), so a thumbnail can never drift from what the 3D
 * viewport builds.
 */
import { layoutPanes, type WindowStyle } from '@/lib/windowStyles'

/** Sash bar thickness as a fraction of the opening. */
const BAR = 0.022

/**
 * `vector-effect` is not inherited, so it has to sit on every shape that
 * strokes — on the <svg> or a wrapping <g> it does nothing, and stroke-width
 * is then read in user units (the viewBox is ~1 unit wide, so a width of 1
 * floods the whole drawing).
 */
const HAIRLINE = { vectorEffect: 'non-scaling-stroke' } as const

export function WindowElevation({
  style,
  stroke = '#2B2622',
  glass = '#F7FAFC',
  strokeWidth = 1.1,
  className,
}: {
  style: WindowStyle
  stroke?: string
  glass?: string
  strokeWidth?: number
  className?: string
}) {
  const panes = layoutPanes(style)

  return (
    <svg
      viewBox="-0.62 -0.62 1.24 1.32"
      className={className}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      style={{ overflow: 'visible', width: '100%', height: '100%', display: 'block' }}
    >
      <g>
        {/* casing + frame */}
        <rect x={-0.555} y={-0.555} width={1.11} height={1.11} fill="#FFFFFF" {...HAIRLINE} />
        <rect x={-0.5} y={-0.5} width={1} height={1} fill={glass} {...HAIRLINE} />

        {panes.map((p, i) => {
          // SVG y grows downward; pane coords grow upward
          const x = p.x - p.w / 2 + BAR / 2
          const y = -(p.y + p.h / 2) + BAR / 2
          const w = Math.max(0.02, p.w - BAR)
          const h = Math.max(0.02, p.h - BAR)
          const inner = { x: x + BAR, y: y + BAR, w: Math.max(0.01, w - 2 * BAR), h: Math.max(0.01, h - 2 * BAR) }

          return (
            <g key={i}>
              <rect x={x} y={y} width={w} height={h} fill={glass} {...HAIRLINE} />
              <rect x={inner.x} y={inner.y} width={inner.w} height={inner.h} fill={glass} {...HAIRLINE} />

              {/* muntin grid */}
              {p.grid && !p.fan && (
                <>
                  {Array.from({ length: p.grid[0] - 1 }, (_, k) => {
                    const gx = inner.x + (inner.w / p.grid![0]) * (k + 1)
                    return <line key={`v${k}`} x1={gx} y1={inner.y} x2={gx} y2={inner.y + inner.h} {...HAIRLINE} />
                  })}
                  {Array.from({ length: p.grid[1] - 1 }, (_, k) => {
                    const gy = inner.y + (inner.h / p.grid![1]) * (k + 1)
                    return <line key={`h${k}`} x1={inner.x} y1={gy} x2={inner.x + inner.w} y2={gy} {...HAIRLINE} />
                  })}
                </>
              )}

              {/* arched head: an arc springing from the pane's lower corners,
                  with radial bars — the rectangular reveal stays as-is */}
              {p.fan && <FanHead x={inner.x} y={inner.y} w={inner.w} h={inner.h} />}
            </g>
          )
        })}

        {/* sill slab */}
        <line x1={-0.62} y1={0.575} x2={0.62} y2={0.575} strokeWidth={strokeWidth * 1.8} {...HAIRLINE} />
      </g>
    </svg>
  )
}

function FanHead({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const cx = x + w / 2
  const base = y + h // springing line (bottom of the band)
  const rx = w / 2
  const ry = h
  const spokes = 5
  return (
    <>
      <path d={`M ${x} ${base} A ${rx} ${ry} 0 0 1 ${x + w} ${base}`} {...HAIRLINE} />
      {Array.from({ length: spokes }, (_, k) => {
        const t = (Math.PI * (k + 1)) / (spokes + 1)
        return (
          <line
            key={k}
            x1={cx}
            y1={base}
            x2={cx - Math.cos(t) * rx}
            y2={base - Math.sin(t) * ry}
            {...HAIRLINE}
          />
        )
      })}
    </>
  )
}
