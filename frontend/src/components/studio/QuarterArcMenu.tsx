/**
 * QuarterArcMenu — a round arrow button pinned to the bottom-right corner that
 * fans its items out along a quarter circle, up and to the left.
 *
 * Mobile's answer to a toolbar: the corner is the one spot a thumb reaches
 * without crossing the viewport, and the quarter arc is the slice of screen
 * that thumb sweeps through. Purely presentational — the caller decides the
 * items and what each one does.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface ArcItem {
  key: string
  label: string
  icon: ReactNode
  onSelect: () => void
}

/** Button diameters and how far the items sit from the corner button, px. */
export const ARC_FAB = 52
export const ARC_ITEM = 54
export const ARC_RADIUS = 104

/**
 * Where each item sits relative to the corner button's centre, in px, with y
 * growing downward like the screen does.
 *
 * The arc runs from due left (180°) to straight up (270°) — the quarter that
 * stays on screen from a bottom-right anchor. A lone item goes at the 225°
 * midpoint rather than at one end, so it reads as deliberate instead of as the
 * first of a row that never arrived.
 */
export function arcOffsets(n: number, radius = ARC_RADIUS): { dx: number; dy: number }[] {
  if (n <= 0) return []
  const START = 180
  const SWEEP = 90
  return Array.from({ length: n }, (_, i) => {
    const deg = n === 1 ? START + SWEEP / 2 : START + (SWEEP * i) / (n - 1)
    const rad = (deg * Math.PI) / 180
    return { dx: radius * Math.cos(rad), dy: radius * Math.sin(rad) }
  })
}

export function QuarterArcMenu({
  items,
  label = 'Qo‘shish',
  className = '',
}: {
  items: ArcItem[]
  /** Accessible name for the corner button itself. */
  label?: string
  /** Positioning for the anchor — defaults to the bottom-right corner. */
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Escape closes, matching the surface radial menu and the rest of the studio.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const offsets = arcOffsets(items.length)

  return (
    <>
      {/* Scrim: catches the tap that dismisses, and drops the 3D view back so
          the fanned buttons read as a layer above it rather than as objects
          floating in the room. pointerdown, not click, so it also cancels an
          in-progress camera gesture instead of waiting for the release. */}
      {open && (
        <div
          className="absolute inset-0 z-30 bg-black/20 animate-[arcfade_140ms_ease-out]"
          onPointerDown={(e) => { e.stopPropagation(); setOpen(false) }}
          aria-hidden="true"
        />
      )}

      <div ref={rootRef} className={`absolute z-30 ${className}`}>
        {/* Items, laid out around the corner button's own centre. Rendered
            only while open so they can never swallow a tap meant for the 3D
            view behind them. */}
        {open && items.map((item, i) => {
          const { dx, dy } = offsets[i]
          return (
            <button
              key={item.key}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                item.onSelect()
                setOpen(false)
              }}
              className="absolute flex flex-col items-center justify-center gap-0.5 rounded-full bg-white text-brand shadow-lg ring-1 ring-black/5 active:scale-95"
              style={{
                left: ARC_FAB / 2 + dx,
                top: ARC_FAB / 2 + dy,
                width: ARC_ITEM,
                height: ARC_ITEM,
                transform: 'translate(-50%, -50%)',
                // Staggered along the arc, so the fan reads as one motion out
                // of the corner rather than three buttons appearing at once.
                animation: `arcpop 160ms ease-out ${i * 45}ms backwards`,
              }}
            >
              <span className="w-5 h-5 flex items-center justify-center">{item.icon}</span>
              <span className="text-[8px] font-semibold leading-none text-gray-600">{item.label}</span>
            </button>
          )
        })}

        {/* The corner button. One arrow that turns 180° instead of swapping to
            an X: it points up the arc to open, and back down into the corner
            to put it away. */}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
          aria-label={label}
          aria-expanded={open}
          title={label}
          className="relative flex items-center justify-center rounded-full bg-white text-brand shadow-lg ring-1 ring-black/5 active:scale-95 transition-transform"
          style={{ width: ARC_FAB, height: ARC_FAB }}
        >
          <svg
            width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{
              transform: `rotate(${open ? 180 : 0}deg)`,
              transition: 'transform 200ms ease',
            }}
            aria-hidden="true"
          >
            {/* Diagonal arrow, aiming up-left into the quarter the menu opens into. */}
            <path d="M17 17L7 7" />
            <path d="M7 14V7h7" />
          </svg>
        </button>
      </div>

      <style>{`
        @keyframes arcpop {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes arcfade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </>
  )
}
