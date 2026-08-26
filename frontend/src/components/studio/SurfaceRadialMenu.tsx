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
import { useEffect } from 'react'

export type RadialSurface = 'wall' | 'ceiling' | 'floor'

export interface RadialItem {
  key: string
  label: string
  icon: React.ReactNode
  onSelect: () => void
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
}

// Ring geometry: buttons sit on an arc opening upward from the press point.
const RADIUS = 82
const BTN = 56

export default function SurfaceRadialMenu({ x, y, surface, items, onClose }: Props) {
  // Escape closes the menu, matching the rest of the studio's keyboard model.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const n = items.length
  // Spread items across an arc centred on straight-up (−90°). One item → dead
  // centre top; more items → fan out ±48° per step, clamped to a half-circle.
  const step = Math.min(52, 150 / Math.max(1, n - 1))
  const startDeg = -90 - (step * (n - 1)) / 2

  // Keep the ring on-screen: nudge the anchor away from viewport edges so the
  // fanned buttons (which reach up and sideways) don't clip.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1080
  const vh = typeof window !== 'undefined' ? window.innerHeight : 1920
  const ax = Math.max(RADIUS + BTN / 2, Math.min(vw - RADIUS - BTN / 2, x))
  const ay = Math.max(RADIUS + BTN + 24, Math.min(vh - BTN, y))

  return (
    <div
      className="fixed inset-0 z-[300]"
      // Backdrop: any tap outside the buttons dismisses. Pointerdown (not click)
      // so it also cancels an in-progress camera gesture cleanly.
      onPointerDown={(e) => {
        e.stopPropagation()
        onClose()
      }}
      onContextMenu={(e) => e.preventDefault()}
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
        {SURFACE_LABEL[surface]}
      </div>

      {items.map((item, i) => {
        const deg = startDeg + step * i
        const rad = (deg * Math.PI) / 180
        const bx = ax + RADIUS * Math.cos(rad)
        const by = ay + RADIUS * Math.sin(rad)
        return (
          <button
            key={item.key}
            onPointerDown={(e) => {
              // Swallow the event so the backdrop's onPointerDown doesn't also
              // fire (it would close before the click registers).
              e.stopPropagation()
            }}
            onClick={(e) => {
              e.stopPropagation()
              item.onSelect()
              onClose()
            }}
            className="absolute flex flex-col items-center justify-center gap-0.5 rounded-full bg-white text-brand shadow-lg ring-1 ring-black/5 active:scale-95 transition-transform animate-[radialpop_120ms_ease-out]"
            style={{
              left: bx,
              top: by,
              width: BTN,
              height: BTN,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <span className="w-5 h-5 flex items-center justify-center">{item.icon}</span>
            <span className="text-[8px] font-semibold leading-none text-gray-600">
              {item.label}
            </span>
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
      <circle cx="9.5" cy="12" r="1.2" />
      <circle cx="14.5" cy="12" r="1.2" />
    </svg>
  ),
}
