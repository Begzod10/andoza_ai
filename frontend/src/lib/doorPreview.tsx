import { doorStyle, panelFlutes, panelOutline, DOOR_IVORY } from './doorStyles'

/**
 * A door drawn face-on for the ring, from the same panel outlines the 3D leaf
 * is moulded from — the layout IS the style, so drawing it is the only
 * preview worth having, and sharing the outlines means the button and the
 * door in the room cannot disagree.
 *
 * Laid out inside the circle inscribed in the box, since the ring's buttons
 * are round: a door is tall and narrow, so it is the height that fits.
 */
const FRAME = '#DCD3C2'
const BEAD = '#CFC5B1'
const SHADOW = '#C6BBA5'
const BRASS = '#B8985A'
const WALL = '#F6F4EF'

/** The leaf inside the 100x100 view. Its half-diagonal stays inside r=46. */
const LEAF = { w: 38, h: 80 }

export function DoorPreview({ styleId, className }: {
  styleId: string
  className?: string
}) {
  const style = doorStyle(styleId)
  const x0 = 50 - LEAF.w / 2
  const y0 = 50 - LEAF.h / 2

  // Leaf space (-0.5…0.5, y up) into view space (y down).
  const vx = (x: number) => 50 + x * LEAF.w
  const vy = (y: number) => 50 - y * LEAF.h

  return (
    <svg viewBox="0 0 100 100" className={className ?? 'w-full h-full'} aria-hidden>
      <rect x="0" y="0" width="100" height="100" fill={WALL} />
      {/* The lining the leaf hangs in. */}
      <rect x={x0 - 4} y={y0 - 4} width={LEAF.w + 8} height={LEAF.h + 4} rx="1" fill={FRAME} />
      <rect x={x0} y={y0} width={LEAF.w} height={LEAF.h} fill={DOOR_IVORY} />

      {style.panels.map((panel, i) => {
        const pts = panelOutline(panel, 14).map(([x, y]) => `${vx(x).toFixed(2)},${vy(y).toFixed(2)}`)
        const d = `M${pts.join(' L')} Z`
        return (
          <g key={i}>
            {/* The bead: the outline drawn twice, offset, which is what reads
                as a moulding at this size. */}
            <path d={d} fill="none" stroke={SHADOW} strokeWidth="2.6" strokeLinejoin="round" />
            <path d={d} fill="none" stroke={BEAD} strokeWidth="1.1" strokeLinejoin="round" />
            {panel.double && (
              <path
                d={`M${panelOutline({ ...panel, w: panel.w * 0.82, h: panel.h * 0.82 }, 14)
                  .map(([x, y]) => `${vx(x).toFixed(2)},${vy(y).toFixed(2)}`).join(' L')} Z`}
                fill="none" stroke={BEAD} strokeWidth="1" strokeLinejoin="round"
              />
            )}
            {panel.fluted && panelFlutes(panel).map((f, fi) => (
              <line
                key={fi}
                x1={vx(f.x)} y1={vy(f.y0)} x2={vx(f.x)} y2={vy(f.y1)}
                stroke={BEAD} strokeWidth="0.9" strokeLinecap="round"
              />
            ))}
          </g>
        )
      })}

      {/* The handle, on the free edge at about a metre up. */}
      <circle cx={x0 + LEAF.w - 5} cy={50 + LEAF.h * 0.06} r="2.4" fill={BRASS} />
      <rect x={x0 + LEAF.w - 12} y={50 + LEAF.h * 0.06 - 1.1} width="7" height="2.2" rx="1.1" fill={BRASS} />
    </svg>
  )
}
