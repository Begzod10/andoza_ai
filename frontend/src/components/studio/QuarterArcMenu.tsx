/**
 * QuarterArcMenu — a round arrow button pinned to the bottom-right corner that
 * fans out along a quarter circle, up and to the left, in two rings: the
 * categories on the inner arc, and the chosen category's own items on an outer
 * one beyond them.
 *
 * The outer ring scrolls ALONG the arc. A library of 87 wallpapers will never
 * fit on a quarter circle, and a "more" button that dumped the user into a
 * panel was a dead end rather than a way through them — so the ring is dragged
 * round its own curve instead, like beads on a wire.
 *
 * Mobile's answer to a toolbar: the corner is the one spot a thumb reaches
 * without crossing the viewport, and the quarter arc is the slice of screen
 * that thumb sweeps through. Purely presentational — the caller supplies the
 * categories, their items and what picking one does.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ARC_FAB, ARC_ITEM, ARC_ITEM_OUTER, ARC_RADIUS, ARC_RADIUS_OUTER,
  angleAt, arcCapacity, arcOffsets, arcSlots, clampArcOffset, maxArcOffset,
  slotsFromAngleDelta,
} from '@/lib/arcMenu'

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

/** Finger travel, in slot units, past which a drag stops counting as a tap. */
const DRAG_SLOP_SLOTS = 0.18

export function QuarterArcMenu({
  categories,
  label = 'Qo‘shish',
  className = '',
}: {
  categories: ArcCategory[]
  /** Accessible name for the corner button itself. */
  label?: string
  /** Positioning for the anchor — defaults to the bottom-right corner. */
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const fabRef = useRef<HTMLButtonElement | null>(null)
  /** Live gesture: where it started and whether it has become a drag yet. */
  const drag = useRef<{ startAngle: number; startOffset: number; moved: boolean } | null>(null)
  /** Whether the gesture that just ended was a scroll. Separate from `drag`,
   *  which is already cleared by the time the click lands: the click fires
   *  AFTER pointerup, so a guard reading the live gesture always saw null and
   *  let a scroll that happened to start on a button apply it as well. Cleared
   *  on the next press, so the tap after a scroll still counts. */
  const didDrag = useRef(false)

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
    setOffset(0)
  }

  const active = categories.find((c) => c.key === activeKey) ?? null
  const capacity = arcCapacity(ARC_RADIUS_OUTER, ARC_ITEM_OUTER)
  const outer: ArcItem[] = active
    ? (active.items.length === 0 ? (active.emptyItem ? [active.emptyItem] : []) : active.items)
    : []
  const scrollable = maxArcOffset(outer.length, capacity) > 0

  // When everything fits, spread it across the whole quarter so it sits
  // balanced; once it doesn't, the slots have to keep a fixed pitch or the
  // buttons would slide around under the finger as the list advanced.
  const evenOffsets = scrollable ? null : arcOffsets(outer.length, ARC_RADIUS_OUTER)
  const slots = scrollable ? arcSlots(outer.length, capacity, offset, ARC_RADIUS_OUTER) : null

  /** The arc's centre in client coordinates — the corner button's own centre. */
  function centre() {
    const r = fabRef.current?.getBoundingClientRect()
    if (!r) return null
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }
  }

  function onDragStart(e: React.PointerEvent) {
    didDrag.current = false
    if (!scrollable) return
    const c = centre()
    if (!c) return
    drag.current = { startAngle: angleAt(c.cx, c.cy, e.clientX, e.clientY), startOffset: offset, moved: false }
  }

  function onDragMove(e: React.PointerEvent) {
    const d = drag.current
    const c = centre()
    if (!d || !c) return
    const delta = slotsFromAngleDelta(angleAt(c.cx, c.cy, e.clientX, e.clientY) - d.startAngle, capacity)
    if (Math.abs(delta) > DRAG_SLOP_SLOTS) d.moved = true
    setOffset(clampArcOffset(d.startOffset + delta, outer.length, capacity))
  }

  function onDragEnd() {
    const d = drag.current
    drag.current = null
    if (!d) return false
    didDrag.current = d.moved
    // Settle on a whole slot so the ring always comes to rest with buttons on
    // their marks rather than halfway between two.
    if (d.moved) setOffset((o) => clampArcOffset(Math.round(o), outer.length, capacity))
    return d.moved
  }

  /** A pick only counts if the gesture that ended on it was not a scroll. */
  function pick(item: ArcItem) {
    if (didDrag.current) return
    item.onSelect()
    closeAll()
  }

  function renderOuterButton(item: ArcItem, pos: { dx: number; dy: number }, opacity: number, i: number) {
    return (
      <button
        key={`${activeKey}:${item.key}`}
        onPointerDown={(e) => { e.stopPropagation(); onDragStart(e) }}
        onPointerMove={onDragMove}
        onPointerUp={() => onDragEnd()}
        onClick={(e) => { e.stopPropagation(); pick(item) }}
        title={item.label}
        className="absolute flex flex-col items-center justify-center gap-0.5 rounded-full bg-white text-brand shadow-lg ring-1 ring-black/5 overflow-hidden active:scale-95"
        style={{
          left: ARC_FAB / 2 + pos.dx,
          top: ARC_FAB / 2 + pos.dy,
          width: ARC_ITEM_OUTER,
          height: ARC_ITEM_OUTER,
          transform: 'translate(-50%, -50%)',
          opacity,
          // Only the first fan-out is animated: re-running it on every scroll
          // frame would fight the drag it is supposed to follow.
          animation: scrollable ? undefined : `arcpop 160ms ease-out ${i * 35}ms backwards`,
          touchAction: 'none',
        }}
      >
        {item.imageUrl ? (
          <>
            <img src={item.imageUrl} alt="" loading="lazy" draggable={false} className="absolute inset-0 w-full h-full object-cover" />
            {/* The label rides a scrim at the foot of the thumbnail — a name
                over a busy wallpaper is unreadable otherwise. */}
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
  }

  return (
    <>
      {/* Scrim: carries the drag when it starts off a button (most of the arc
          is empty space), catches the tap that dismisses, and drops the 3D
          view back so the fanned buttons read as a layer above it. */}
      {open && (
        <div
          className="absolute inset-0 z-30 bg-black/25 animate-[arcfade_140ms_ease-out]"
          style={{ touchAction: 'none' }}
          onPointerDown={(e) => { e.stopPropagation(); onDragStart(e) }}
          onPointerMove={onDragMove}
          onPointerUp={(e) => {
            e.stopPropagation()
            // A drag that happened to start on the backdrop must not also
            // dismiss the menu when the finger lifts.
            if (!onDragEnd()) closeAll()
          }}
          aria-hidden="true"
        />
      )}

      <div className={`absolute z-30 ${className}`}>
        {/* Outer ring — the active category's own things. Rendered first so
            the category buttons paint over it where the rings crowd. */}
        {open && slots
          ? slots.map((s) => renderOuterButton(outer[s.index], s, s.opacity, s.index))
          : open && evenOffsets
            ? outer.map((item, i) => renderOuterButton(item, evenOffsets[i], 1, i))
            : null}

        {/* Inner ring — the categories. Tapping one swaps the outer ring
            instead of closing, so the three stay reachable from each other. */}
        {open && categories.map((cat, i) => {
          const { dx, dy } = arcOffsets(categories.length, ARC_RADIUS)[i]
          const isActive = cat.key === activeKey
          return (
            <button
              key={cat.key}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                setOffset(0)
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

        {/* How far along a long list the ring is sitting — without it a
            scrolling arc gives no clue there is more either way. */}
        {open && scrollable && (
          <div
            className="absolute rounded-full bg-white/85 text-[9px] font-bold text-gray-600 px-1.5 py-0.5 shadow pointer-events-none"
            style={{
              left: ARC_FAB / 2 - ARC_RADIUS_OUTER - 6,
              top: ARC_FAB / 2 - ARC_RADIUS_OUTER - 6,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {Math.min(outer.length, Math.round(offset) + capacity)}/{outer.length}
          </div>
        )}

        {/* The corner button. One arrow that turns 180° instead of swapping to
            an X: it points up the arc to open, and back down into the corner
            to put it away. */}
        <button
          ref={fabRef}
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
