/**
 * SurfaceRadialMenu — a circular ("aylana") context menu that pops up where the
 * user long-presses a surface in the 3D room. Each surface (wall / ceiling /
 * floor) offers its own set of actions as icon buttons arranged on an arc
 * around the press point.
 *
 * Purely presentational: the caller decides the items and what each does. It
 * anchors to a screen coordinate (clientX/clientY captured from the R3F pointer
 * event) via a fixed-position overlay, and a full-screen backdrop dismisses it.
 */
import { useEffect, useRef, useState } from 'react'
import { angleAt, arcSlots, slotsFromAngleDelta, wrapArcOffset } from '@/lib/arcMenu'

export type RadialSurface = 'wall' | 'ceiling' | 'floor' | 'skirting' | 'cornice'

export interface RadialItem {
  key: string
  label: string
  icon: React.ReactNode
  /** A drawn thumbnail — a milled profile's catalogue section — shown instead
   *  of the icon, filling the whole button rather than sitting in a 20px slot,
   *  because a moulding is chosen by looking at its shape. The corner menu's
   *  items do the same thing. */
  fill?: React.ReactNode
  onSelect: () => void
  /** A second ring of choices this item opens instead of acting. Picking it
   *  swaps the menu's contents rather than closing, so a wall tap can lead to
   *  "Elektr" and then to which device without ever leaving the surface. */
  children?: RadialItem[]
  /** Names the submenu once it is open, in place of the surface's own label. */
  childLabel?: string
}

interface Props {
  x: number
  y: number
  surface: RadialSurface
  items: RadialItem[]
  onClose: () => void
}

const SURFACE_LABEL: Record<RadialSurface, string> = {
  wall: 'Devor',
  ceiling: 'Shift',
  floor: 'Pol',
  skirting: 'Plintus',
  cornice: 'Karniz',
}

// Ring geometry: buttons sit on an arc opening upward from the press point.
const RADIUS = 82
const BTN = 56

/**
 * How many buttons the ring shows at once once it has to scroll: three sitting
 * square in the middle, plus one either side half-faded so it is obvious there
 * is more round the curve.
 *
 * Six devices fanned across the old ±75° at this radius were 42px apart with
 * 56px buttons — they overlapped, and their labels ran into each other. Three
 * abreast is what actually fits.
 */
const WINDOW_FULL = 3
const WINDOW_SLOTS = WINDOW_FULL + 2
/** Degrees between neighbouring slots — wide enough that 56px never touches. */
const SLOT_DEG = 40
/** The peeking pair: small and faint, a hint rather than a target. */
const EDGE_OPACITY = 0.45
const EDGE_SCALE = 0.66

export default function SurfaceRadialMenu({ x, y, surface, items, onClose }: Props) {
  /** The path drilled into, deepest last — a stack rather than a single item
   *  because a choice can lead to another (a tile size, then its texture). */
  const [trail, setTrail] = useState<RadialItem[]>([])
  const drill = trail[trail.length - 1] ?? null
  /** How far the ring has been turned, in slots. */
  const [offset, setOffset] = useState(0)
  /** Live turn gesture; `moved` is what stops a scroll also picking something. */
  const drag = useRef<{ startAngle: number; startOffset: number; moved: boolean } | null>(null)
  const didDrag = useRef(false)

  // Escape backs out one level at a time — the submenu first, then the whole
  // menu — so a mis-tap into "Elektr" doesn't cost the whole gesture.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (drill) { setTrail((t) => t.slice(0, -1)); setOffset(0) }
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, drill])

  const shown = drill?.children ?? items
  const n = shown.length
  // Past what fits, the ring scrolls instead of cramming: a fixed window of
  // slots that the list turns through, endlessly, like the corner menu's.
  const scrolls = n > WINDOW_SLOTS
  const slotCount = scrolls ? WINDOW_SLOTS : n
  const step = scrolls ? SLOT_DEG : Math.min(52, 150 / Math.max(1, n - 1))
  const startDeg = -90 - (step * (slotCount - 1)) / 2

  // Which item sits in each slot, and how solid it looks there.
  const placed = scrolls
    ? arcSlots(n, WINDOW_SLOTS, offset, RADIUS, startDeg, step * (WINDOW_SLOTS - 1))
        .map((sl) => {
          // Only the middle three are real targets; the pair either side is a
          // hint. `sl.opacity` is what takes the slots BEYOND the window to
          // nothing — without multiplying through it they showed at the edge
          // fade too, so seven buttons appeared where five were meant to.
          const edge = sl.slot < 0.5 || sl.slot > WINDOW_SLOTS - 1.5
          return {
            item: shown[sl.index],
            key: `${trail.map((t) => t.key).join('/') || 'root'}:${sl.key}`,
            deg: startDeg + sl.slot * step,
            edge,
            opacity: (edge ? EDGE_OPACITY : 1) * sl.opacity,
            scale: edge ? EDGE_SCALE : 1,
          }
        })
    : shown.map((item, i) => ({
        item, key: item.key, deg: startDeg + step * i, edge: false, opacity: 1, scale: 1,
      }))

  // Keep the ring on-screen: nudge the anchor away from viewport edges so the
  // fanned buttons (which reach up and sideways) don't clip.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1080
  const vh = typeof window !== 'undefined' ? window.innerHeight : 1920
  const ax = Math.max(RADIUS + BTN / 2, Math.min(vw - RADIUS - BTN / 2, x))
  const ay = Math.max(RADIUS + BTN + 24, Math.min(vh - BTN, y))

  function onTurnStart(e: React.PointerEvent) {
    didDrag.current = false
    if (!scrolls) return
    drag.current = {
      startAngle: angleAt(ax, ay, e.clientX, e.clientY, -90),
      startOffset: offset,
      moved: false,
    }
  }

  function onTurnMove(e: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    const delta = slotsFromAngleDelta(
      angleAt(ax, ay, e.clientX, e.clientY, -90) - d.startAngle,
      WINDOW_SLOTS,
    )
    if (Math.abs(delta) > 0.18) d.moved = true
    setOffset(d.startOffset + delta)
  }

  /** @returns whether that gesture turned the ring rather than tapped it. */
  function onTurnEnd() {
    const d = drag.current
    drag.current = null
    if (!d) return false
    didDrag.current = d.moved
    // Settle on a whole slot, then fold back into one lap.
    if (d.moved) setOffset((o) => wrapArcOffset(Math.round(o), n))
    return d.moved
  }

  return (
    <div
      className="fixed inset-0 z-[300]"
      // Backdrop: any tap outside the buttons dismisses. Pointerdown (not click)
      // so it also cancels an in-progress camera gesture cleanly.
      onPointerDown={(e) => { e.stopPropagation(); onTurnStart(e) }}
      onPointerMove={onTurnMove}
      onPointerUp={(e) => {
        e.stopPropagation()
        // A turn that happened to start on the backdrop must not also dismiss.
        if (!onTurnEnd()) onClose()
      }}
      onContextMenu={(e) => e.preventDefault()}
      style={{ touchAction: 'none' }}
    >
      {/* Faint focus ring at the press point */}
      <div
        className="absolute rounded-full border-2 border-brand/40"
        style={{
          left: ax,
          top: ay,
          width: 18,
          height: 18,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      />
      {/* Centre chip naming the surface */}
      <div
        className="absolute px-2 py-0.5 rounded-full bg-brand text-white text-[10px] font-bold shadow"
        style={{
          left: ax,
          top: ay + 16,
          transform: 'translate(-50%, 0)',
          pointerEvents: 'none',
        }}
      >
        {drill?.childLabel ?? drill?.label ?? SURFACE_LABEL[surface]}
      </div>

      {placed.map(({ item, key, deg, edge, opacity, scale }) => {
        if (!item) return null
        const rad = (deg * Math.PI) / 180
        const bx = ax + RADIUS * Math.cos(rad)
        const by = ay + RADIUS * Math.sin(rad)
        return (
          <button
            key={key}
            onPointerDown={(e) => {
              // Swallow the event so the backdrop's onPointerDown doesn't also
              // fire (it would close before the click registers) — but still
              // start a turn, so the ring can be dragged from a button.
              e.stopPropagation()
              onTurnStart(e)
            }}
            onPointerMove={onTurnMove}
            onPointerUp={(e) => {
              // Must swallow it as well as pointerdown: the backdrop dismisses
              // on pointerUP, so letting this bubble closed the menu before the
              // click could act — every button looked dead.
              e.stopPropagation()
              onTurnEnd()
            }}
            onClick={(e) => {
              e.stopPropagation()
              // A turn that ended here is not a pick.
              if (didDrag.current) return
              // The faded pair is a hint, not a target: tapping one brings it
              // round to the middle rather than choosing something half-hidden.
              if (edge) { setOffset((o) => wrapArcOffset(Math.round(o + (deg < -90 ? -1 : 1)), n)); return }
              // An item with children opens them in place; only a leaf acts
              // and dismisses.
              if (item.children?.length) { setOffset(0); setTrail((t) => [...t, item]); return }
              item.onSelect()
              onClose()
            }}
            className="absolute flex flex-col items-center justify-center gap-0.5 rounded-full bg-white text-brand shadow-lg ring-1 ring-black/5 active:scale-95 transition-transform animate-[radialpop_120ms_ease-out] overflow-hidden"
            style={{
              left: bx,
              top: by,
              width: BTN,
              height: BTN,
              opacity,
              // Nothing to aim at once it has faded out entirely.
              pointerEvents: opacity < 0.05 ? 'none' : undefined,
              transform: `translate(-50%, -50%) scale(${scale})`,
              touchAction: 'none',
            }}
          >
            {item.fill ? (
              <>
                <span className="absolute inset-0 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>img]:w-full [&>img]:h-full">
                  {item.fill}
                </span>
                {/* The name rides a scrim at the foot of the thumbnail: a
                    catalogue code printed over line art is unreadable. */}
                <span className="absolute inset-x-0 bottom-0 px-0.5 py-[1px] bg-black/55 text-white text-[8px] font-semibold leading-tight truncate">
                  {item.label}
                </span>
              </>
            ) : (
              <>
                <span className="w-5 h-5 flex items-center justify-center">{item.icon}</span>
                <span className="text-[8px] font-semibold leading-none text-gray-600">
                  {item.label}
                </span>
              </>
            )}
          </button>
        )
      })}

      <style>{`
        @keyframes radialpop {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.6); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>
    </div>
  )
}

/* ── Inline icons (self-contained, stroke = currentColor) ─────────────── */

const ico = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export const RadialIcons = {
  paint: (
    <svg {...ico}>
      <path d="M3 7l9-4 9 4-9 4-9-4z" />
      <path d="M12 11v9" />
      <path d="M7 9v4c0 1.5 2.2 2.5 5 2.5s5-1 5-2.5V9" />
    </svg>
  ),
  window: (
    <svg {...ico}>
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <path d="M12 4v16M4 12h16" />
    </svg>
  ),
  door: (
    <svg {...ico}>
      <path d="M6 21V4a1 1 0 011-1h9a1 1 0 011 1v17" />
      <path d="M4 21h16" />
      <circle cx="14" cy="12" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  ),
  light: (
    <svg {...ico}>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 00-4 10.5c.7.6 1 1 1 2h6c0-1 .3-1.4 1-2A6 6 0 0012 3z" />
    </svg>
  ),
  ceiling: (
    <svg {...ico}>
      <rect x="3" y="4" width="18" height="6" rx="1" />
      <path d="M6 10v4M12 10v6M18 10v4" />
    </svg>
  ),
  floor: (
    <svg {...ico}>
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <path d="M3 9h18M3 14h18M9 4v5M15 9v5M9 14v6" />
    </svg>
  ),
  add: (
    <svg {...ico}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  ),
  socket: (
    <svg {...ico}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <circle cx="9.5" cy="11" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="11" r="1.1" fill="currentColor" stroke="none" />
      <path d="M8 16h8" />
    </svg>
  ),
  // The corner the cornice sits in, seen in section: ceiling across the top,
  // wall down the side, and the coved moulding bridging them.
  cornice: (
    <svg {...ico}>
      <path d="M4 5h16" />
      <path d="M5 4v16" />
      <path d="M5 12c4.5 0 7-2.5 7-7" />
      <path d="M5 12h1.5M12 5V3.5" strokeWidth="1.2" />
    </svg>
  ),
}
