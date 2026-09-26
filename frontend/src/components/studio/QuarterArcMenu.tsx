/**
 * QuarterArcMenu — a round arrow button pinned to the bottom-right corner that
 * fans out along a quarter circle, up and to the left, in two rings: the
 * categories on the inner arc, and the chosen category's own items on an outer
 * one beyond them.
 *
 * Mobile's answer to a toolbar: the corner is the one spot a thumb reaches
 * without crossing the viewport, and the quarter arc is the slice of screen
 * that thumb sweeps through. Purely presentational — the caller supplies the
 * categories, their items and what picking one does.
 */
import { useEffect, useState, type ReactNode } from 'react'

export interface ArcItem {
  key: string
  label: string
  /** Shown when there is no `imageUrl` — an emoji or an inline icon. */
  icon?: ReactNode
  /** A real thumbnail: a model's render, a wallpaper swatch. Fills the button. */
  imageUrl?: string
  onSelect: () => void
}

export interface ArcCategory {
  key: string
  label: string
  icon: ReactNode
  /** The outer ring for this category. */
  items: ArcItem[]
  /** Shown in place of an empty outer ring, as a single button. */
  emptyItem?: ArcItem
}

/** Button diameters and ring radii, px. */
export const ARC_FAB = 52
export const ARC_ITEM = 54
export const ARC_RADIUS = 104
export const ARC_ITEM_OUTER = 50
export const ARC_RADIUS_OUTER = 190

/**
 * How many buttons fit on the quarter arc at a given radius without touching.
 * The arc's length grows with the radius, so the outer ring holds more than
 * the inner one; anything past this has to live behind a "more" button rather
 * than be crammed in at overlapping spacing.
 */
export function arcCapacity(radius: number, buttonSize: number, gap = 6): number {
  const arcLength = (radius * Math.PI) / 2
  return Math.max(1, Math.floor(arcLength / (buttonSize + gap)) + 1)
}

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

/**
 * The outer ring's contents for one category: as many of its items as the arc
 * holds, and — only when some are left over — a final button standing in for
 * the rest. The "more" button costs one slot, so it is added before the slice
 * is taken, never after; otherwise it would push an item off the end and the
 * count would quietly be one short.
 */
export function outerRing(items: ArcItem[], more: ArcItem | null, capacity: number): ArcItem[] {
  if (items.length <= capacity) return items
  if (!more) return items.slice(0, capacity)
  return [...items.slice(0, capacity - 1), more]
}

export function QuarterArcMenu({
  categories,
  label = 'Qo‘shish',
  className = '',
  makeMoreItem,
}: {
  categories: ArcCategory[]
  /** Accessible name for the corner button itself. */
  label?: string
  /** Positioning for the anchor — defaults to the bottom-right corner. */
  className?: string
  /** Builds the "everything else" button for a category whose items overflow
   *  the arc. Returning null just truncates instead. */
  makeMoreItem?: (category: ArcCategory) => ArcItem | null
}) {
  const [open, setOpen] = useState(false)
  const [activeKey, setActiveKey] = useState<string | null>(null)

  // Escape backs out one level at a time — the items first, then the whole
  // menu — which is what a user reaching for it after a mis-tap expects.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (activeKey) setActiveKey(null)
      else setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, activeKey])

  function closeAll() {
    setOpen(false)
    setActiveKey(null)
  }

  const active = categories.find((c) => c.key === activeKey) ?? null
  const capacity = arcCapacity(ARC_RADIUS_OUTER, ARC_ITEM_OUTER)
  const outer = active
    ? (active.items.length === 0
        ? (active.emptyItem ? [active.emptyItem] : [])
        : outerRing(active.items, makeMoreItem?.(active) ?? null, capacity))
    : []

  const innerOffsets = arcOffsets(categories.length, ARC_RADIUS)
  const outerOffsets = arcOffsets(outer.length, ARC_RADIUS_OUTER)

  return (
    <>
      {/* Scrim: catches the tap that dismisses, and drops the 3D view back so
          the fanned buttons read as a layer above it rather than as objects
          floating in the room. pointerdown, not click, so it also cancels an
          in-progress camera gesture instead of waiting for the release. */}
      {open && (
        <div
          className="absolute inset-0 z-30 bg-black/25 animate-[arcfade_140ms_ease-out]"
          onPointerDown={(e) => { e.stopPropagation(); closeAll() }}
          aria-hidden="true"
        />
      )}

      <div className={`absolute z-30 ${className}`}>
        {/* Outer ring — the active category's own things. Rendered first so
            the category buttons paint over it where the rings crowd. */}
        {open && outer.map((item, i) => {
          const { dx, dy } = outerOffsets[i]
          return (
            <button
              key={`${activeKey}:${item.key}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); item.onSelect(); closeAll() }}
              title={item.label}
              className="absolute flex flex-col items-center justify-center gap-0.5 rounded-full bg-white text-brand shadow-lg ring-1 ring-black/5 overflow-hidden active:scale-95"
              style={{
                left: ARC_FAB / 2 + dx,
                top: ARC_FAB / 2 + dy,
                width: ARC_ITEM_OUTER,
                height: ARC_ITEM_OUTER,
                transform: 'translate(-50%, -50%)',
                animation: `arcpop 160ms ease-out ${i * 35}ms backwards`,
              }}
            >
              {item.imageUrl ? (
                <>
                  <img src={item.imageUrl} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                  {/* The label rides a scrim at the foot of the thumbnail —
                      a name over a busy wallpaper is unreadable otherwise. */}
                  <span className="absolute inset-x-0 bottom-0 px-0.5 py-[1px] bg-black/55 text-white text-[7px] font-semibold leading-tight truncate">
                    {item.label}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-base leading-none flex items-center justify-center">{item.icon}</span>
                  <span className="text-[7px] font-semibold leading-none text-gray-600 px-0.5 truncate max-w-full">
                    {item.label}
                  </span>
                </>
              )}
            </button>
          )
        })}

        {/* Inner ring — the categories. Tapping one swaps the outer ring
            instead of closing, so the three stay reachable from each other. */}
        {open && categories.map((cat, i) => {
          const { dx, dy } = innerOffsets[i]
          const isActive = cat.key === activeKey
          return (
            <button
              key={cat.key}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                setActiveKey((k) => (k === cat.key ? null : cat.key))
              }}
              aria-pressed={isActive}
              className={`absolute flex flex-col items-center justify-center gap-0.5 rounded-full shadow-lg ring-1 active:scale-95 transition-colors ${
                isActive ? 'bg-brand text-white ring-brand/40' : 'bg-white text-brand ring-black/5'
              }`}
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
              <span className="w-5 h-5 flex items-center justify-center">{cat.icon}</span>
              <span className={`text-[8px] font-semibold leading-none ${isActive ? 'text-white' : 'text-gray-600'}`}>
                {cat.label}
              </span>
            </button>
          )
        })}

        {/* The corner button. One arrow that turns 180° instead of swapping to
            an X: it points up the arc to open, and back down into the corner
            to put it away. */}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); open ? closeAll() : setOpen(true) }}
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
