import { useCallback, useEffect, useMemo } from 'react'
import { create } from 'zustand'
import { createHoldTracker, HOLD_DELETE_MS } from '@/lib/holdToDelete'

/**
 * Press and hold a placed thing for 1.2s and a delete button appears where the
 * finger is: doors and windows, models, the skirting and cornice, the
 * electrical faceplates.
 *
 * State lives in a store rather than React context because most of these live
 * INSIDE the R3F `<Canvas>`, and context does not cross that boundary — a
 * provider outside it is invisible to the meshes, which is exactly where the
 * presses happen.
 *
 * One tracker for the whole app, since only one thing can be held at a time:
 * pressing a second item cancels the first cleanly instead of leaving a stray
 * timer to fire over the top of it.
 */
export interface HoldDeleteItem {
  /** Named above the button, so it is clear what is about to go. */
  label: string
  onDelete: () => void
}

interface HoldDeleteState {
  pending: { x: number; y: number; item: HoldDeleteItem } | null
  open(p: { x: number; y: number; item: HoldDeleteItem }): void
  close(): void
}

const useHoldDeleteStore = create<HoldDeleteState>((set) => ({
  pending: null,
  open: (p) => set({ pending: p }),
  close: () => set({ pending: null }),
}))

/** True from the moment a hold fires until that press ends, so the release
 *  does not also read as a tap on the thing underneath. */
let heldThisPress = false

const tracker = createHoldTracker<HoldDeleteItem>({
  holdMs: HOLD_DELETE_MS,
  onHold: ({ x, y, payload }) => useHoldDeleteStore.getState().open({ x, y, item: payload }),
})

if (typeof window !== 'undefined') {
  // Movement and release are both watched on the window rather than per item.
  // Once a drag starts, the moves go to the canvas and the item never sees
  // another one — so a per-item listener would keep the hold alive through a
  // drag and delete what the user was moving. And a press can end anywhere,
  // including off the window, which has to stop the timer too.
  window.addEventListener('pointermove', (e) => tracker.move(e.clientX, e.clientY))
  const end = () => { heldThisPress = tracker.up() }
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
}

/**
 * Handlers to spread onto a mesh. They do NOT stop propagation: the press
 * still has to reach whatever drag or selection the item already has, and the
 * hold gives way the moment that turns into a drag.
 */
export function useHoldToDelete() {
  const bind = useCallback((item: HoldDeleteItem) => ({
    onPointerDown: (e: { clientX: number; clientY: number }) => tracker.down(e.clientX, e.clientY, item),
  }), [])
  /** Whether the press that just ended fired a hold — checked before treating
   *  a release as a tap. */
  const wasHeld = useCallback(() => heldThisPress, [])
  return useMemo(() => ({ bind, wasHeld }), [bind, wasHeld])
}

/**
 * The button itself, at the point that was held. Mounted once, outside the
 * canvas — it is ordinary DOM, not part of the scene.
 */
export function HoldDeleteButton() {
  const pending = useHoldDeleteStore((s) => s.pending)
  const close = useHoldDeleteStore((s) => s.close)

  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending, close])

  if (!pending) return null

  // Keep it on screen when something near an edge is held.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1080
  const vh = typeof window !== 'undefined' ? window.innerHeight : 1920
  const x = Math.max(80, Math.min(vw - 80, pending.x))
  const y = Math.max(64, Math.min(vh - 16, pending.y))

  return (
    <div
      className="fixed inset-0 z-[320]"
      // Anywhere else dismisses: while this is up, a stray tap should put it
      // away rather than hit whatever is behind it.
      onPointerDown={(e) => { e.stopPropagation(); close() }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="absolute flex flex-col items-center gap-1"
        style={{ left: x, top: y, transform: 'translate(-50%, -120%)' }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="px-2 py-0.5 rounded-full bg-black/70 text-white text-[10px] font-semibold max-w-[170px] truncate">
          {pending.item.label}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); pending.item.onDelete(); close() }}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white text-[#E5484D] text-[13px] font-bold shadow-lg ring-1 ring-black/10 active:scale-95"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
          </svg>
          O&apos;chirish
        </button>
      </div>
    </div>
  )
}
