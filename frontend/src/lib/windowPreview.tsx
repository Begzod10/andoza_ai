import { layoutPanes, type WindowStyle } from './windowStyles'

/**
 * A window drawn as the thing itself — frame, mullions, glass and the handle
 * on the sashes that open — from the same `bands` the 3D window is built from.
 *
 * The picker showed one grid icon against every style, so eighteen styles read
 * as eighteen identical buttons. The layout IS the style, so drawing it is the
 * only preview worth having.
 *
 * Laid out inside the circle inscribed in the box, since these are shown in
 * the ring's round buttons: the frame spans a little over half the width and
 * the corners stay well inside a radius of 46.
 */
const FRAME = '#8A9099'
const GLASS = '#CFE3F2'
const HANDLE = '#6B7280'

/** The opening's box in the 100x100 view, portrait like a real casement. */
const BOX = { x: 22, y: 14, w: 56, h: 72 }

export function WindowPreview({ style, className }: {
  style: WindowStyle
  className?: string
}) {
  // layoutPanes works in a -0.5..0.5 square, y up; the SVG is y down.
  const panes = layoutPanes(style).map((p) => ({
    ...p,
    px: BOX.x + (p.x + 0.5) * BOX.w,
    py: BOX.y + (0.5 - p.y) * BOX.h,
    pw: p.w * BOX.w,
    ph: p.h * BOX.h,
  }))

  return (
    <svg viewBox="0 0 100 100" className={className ?? 'w-full h-full'} aria-hidden>
      <rect x="0" y="0" width="100" height="100" fill="#F4F6F8" />
      {/* The reveal the window sits in, so it reads as a hole in a wall. */}
      <rect
        x={BOX.x - 5} y={BOX.y - 5} width={BOX.w + 10} height={BOX.h + 10}
        rx="2" fill="#E8EAED"
      />
      {panes.map((p, i) => (
        <g key={i}>
          <rect
            x={p.px - p.pw / 2 + 1.5} y={p.py - p.ph / 2 + 1.5}
            width={Math.max(0, p.pw - 3)} height={Math.max(0, p.ph - 3)}
            fill={GLASS} stroke={FRAME} strokeWidth="2.5"
          />
          {/* Only a sash that opens carries a handle — which is what tells
              "Uch tavaqa" from "Yuqori oynali" at a glance. */}
          {p.opens && p.pw > 8 && (
            <rect
              x={p.hinge === 'right' ? p.px - p.pw / 2 + 3 : p.px + p.pw / 2 - 5}
              y={p.py - 3} width="2" height="6" rx="1" fill={HANDLE}
            />
          )}
        </g>
      ))}
      {/* Outer frame over the panes, so the whole unit reads as one window. */}
      <rect
        x={BOX.x} y={BOX.y} width={BOX.w} height={BOX.h}
        fill="none" stroke={FRAME} strokeWidth="3.5"
      />
      {/* The sill it stands on. */}
      <rect x={BOX.x - 7} y={BOX.y + BOX.h} width={BOX.w + 14} height="4" rx="1.5" fill="#D6D9DD" />
    </svg>
  )
}
