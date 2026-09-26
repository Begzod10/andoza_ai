import { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Stories-style navigation between the studio's view tabs: one rounded bar
 * carrying the PREVIOUS section's name, the CURRENT one, and the NEXT one,
 * wrapping around at both ends (Smeta → 3D). Tap a neighbour to go there, or
 * hold the bar and slide horizontally — the side you lean toward arms, and
 * releasing switches to it.
 *
 * This is the primary way to shift between sections; the hamburger
 * TopDrawer in the studio header (StudioNav) stays as-is as secondary
 * navigation.
 *
 * Mounted PER-PAGE rather than once in StudioPage's layout, on purpose:
 *  - /smeta/:roomId is a top-level route with its own page shell, not a
 *    child of StudioPage's <Outlet/> — a layout-level overlay could never
 *    reach it.
 *  - On ThreeDPage the 3D viewport is inset by two collapsible side rails
 *    (144px stage rail, 288px design panel, both open by default and
 *    animated), so "top-right of the viewport" is not "top-right of the
 *    layout's content area" — corner placement is only correct from inside
 *    each page's own relative viewport container.
 *  - PlacementPage has an in-flow toolbar above the content and a w-64
 *    sidebar on the right; mounting inside its plan+3D wrapper puts the
 *    arrows at that area's real corners with no magic offsets.
 * The navigation logic and pills live here once; pages only pick a mount
 * point (ThreeDPage covers the ichkarida/mebel/chiroqlar tabs by itself).
 */

interface TabDef {
  seg: string;
  label: string;
  to: string;
}

function tabsFor(roomId: string): TabDef[] {
  return [
    { seg: "ichkarida", label: "3D", to: `/studio/${roomId}/ichkarida` },
    { seg: "mebel", label: "Mebelirovka", to: `/studio/${roomId}/mebel` },
    { seg: "chiroqlar", label: "Chiroqlar", to: `/studio/${roomId}/chiroqlar` },
    { seg: "elektr", label: "Elektr", to: `/studio/${roomId}/elektr` },
    { seg: "aylanish", label: "Aylanish", to: `/studio/${roomId}/aylanish` },
    // Top-level route, not nested under /studio/:roomId — see StudioNav.
    { seg: "smeta", label: "Smeta", to: `/smeta/${roomId}` },
  ];
}

interface TabNav {
  current: TabDef;
  prev: TabDef;
  next: TabDef;
  goPrev: () => void;
  goNext: () => void;
}

export function useStudioTabNav(roomId: string): TabNav | null {
  const location = useLocation();
  const navigate = useNavigate();
  const tabs = tabsFor(roomId);

  const seg = location.pathname.startsWith("/smeta/")
    ? "smeta"
    : location.pathname.split("/").filter(Boolean)[2] ?? "ichkarida";
  const idx = tabs.findIndex((t) => t.seg === seg);
  // Unknown sub-route (e.g. the yuqori isometric view, which is not part of
  // this cycle) — render nothing rather than a wrong title.
  if (idx === -1) return null;

  const n = tabs.length;
  const prev = tabs[(idx - 1 + n) % n];
  const next = tabs[(idx + 1) % n];
  // location.search carried along so any phase/query params survive the hop.
  const go = (t: TabDef) => navigate(t.to + location.search);
  return {
    current: tabs[idx],
    prev,
    next,
    goPrev: () => go(prev),
    goNext: () => go(next),
  };
}

// One rounded bar holding all three names. The current section is opaque
// and bold; its neighbours sit at 80% opacity so "you are here" reads at a
// glance without a second pill or a chevron to decode.
const BAR_CLS =
  "inline-flex items-center gap-1 p-1 rounded-full bg-white/95 backdrop-blur border border-gray-200 " +
  "shadow-md select-none touch-none";
const SIDE_CLS =
  "h-8 px-3 max-w-[28vw] sm:max-w-[9rem] truncate rounded-full text-[12px] font-medium " +
  "text-gray-600 opacity-80 hover:opacity-100 hover:bg-gray-100 transition";
const SIDE_ARMED_CLS = "opacity-100 bg-gray-100 text-gray-900";
const CURRENT_CLS =
  "h-8 px-4 rounded-full bg-gray-100 text-[13px] font-bold text-gray-900 whitespace-nowrap " +
  "flex items-center";

/** Past this many pixels a horizontal drag counts as "switch to that side". */
const SWITCH_PX = 28;
/** Past this, the gesture was a drag and the click it ends with is ignored. */
const DRAG_SLOP = 6;

export function StudioTabStrip({
  roomId,
  variant = "overlay",
  titleClassName = "",
}: {
  roomId: string;
  /**
   * "overlay": the bar absolutely positioned, centred at the top of the
   * nearest relative ancestor — the page's viewport box. "inline": the same
   * bar in normal flow, for regular document pages (Smeta).
   */
  variant?: "overlay" | "inline";
  /** Extra classes for the bar's positioned wrapper. */
  titleClassName?: string;
}) {
  const nav = useStudioTabNav(roomId);
  // Which side a drag is currently pointing at, and how far it has travelled
  // (the bar leans that way, so the gesture feels connected to the names).
  const [armed, setArmed] = useState<"prev" | "next" | null>(null);
  const [dx, setDx] = useState(0);
  // The gesture's own state lives in a ref, not just in `armed`: pointermove
  // and pointerup can land in the same task (a quick flick, or a synthetic
  // sequence), and React would then batch the setState so the release read a
  // stale side and switched to nothing. `armed` exists only to paint it.
  const dragRef = useRef<{ x: number; moved: boolean; side: "prev" | "next" | null } | null>(null);
  // A drag that ends over a name would otherwise fire that name's click too.
  const draggedRef = useRef(false);

  if (!nav) return null;

  const commit = (side: "prev" | "next" | null) => {
    if (side === "prev") nav.goPrev();
    else if (side === "next") nav.goNext();
  };

  // Hold anywhere on the bar and slide: past SWITCH_PX the section on that
  // side arms, and releasing goes there. Dragging right reaches back for the
  // previous section, matching how the names are laid out.
  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, moved: false, side: null };
    // Clear the swallow flag HERE, at the start of the next gesture, not in
    // the click handler: a drag that ends off a name fires no click at all,
    // and the flag would otherwise survive to eat the next genuine tap.
    draggedRef.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const moved = e.clientX - d.x;
    if (Math.abs(moved) > DRAG_SLOP) d.moved = true;
    d.side = moved > SWITCH_PX ? "prev" : moved < -SWITCH_PX ? "next" : null;
    setDx(Math.max(-40, Math.min(40, moved)));
    setArmed(d.side);
  };
  const endDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDx(0);
    setArmed(null);
    if (e.currentTarget instanceof HTMLElement && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (d?.moved) {
      draggedRef.current = true;
      commit(d.side);
    }
  };
  const swallowClickAfterDrag = (e: React.MouseEvent) => {
    if (draggedRef.current) e.preventDefault();
  };

  const bar = (
    <div
      className={BAR_CLS}
      style={{ transform: dx ? `translateX(${dx * 0.35}px)` : undefined, transition: dx ? "none" : "transform 150ms ease-out" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <button
        type="button"
        onClick={(e) => { swallowClickAfterDrag(e); if (!e.defaultPrevented) nav.goPrev(); }}
        title={`Oldingi bo'lim — ${nav.prev.label}`}
        aria-label={`Oldingi bo'lim — ${nav.prev.label}`}
        className={`${SIDE_CLS} ${armed === "prev" ? SIDE_ARMED_CLS : ""}`}
      >
        {nav.prev.label}
      </button>
      {/* aria-live so a screen reader hears the section change. */}
      <div className={CURRENT_CLS} aria-live="polite">{nav.current.label}</div>
      <button
        type="button"
        onClick={(e) => { swallowClickAfterDrag(e); if (!e.defaultPrevented) nav.goNext(); }}
        title={`Keyingi bo'lim — ${nav.next.label}`}
        aria-label={`Keyingi bo'lim — ${nav.next.label}`}
        className={`${SIDE_CLS} ${armed === "next" ? SIDE_ARMED_CLS : ""}`}
      >
        {nav.next.label}
      </button>
    </div>
  );

  if (variant === "inline") return <div className="flex justify-center">{bar}</div>;

  // z-30: above the canvas and the z-10/z-20 corner-control tiers (which the
  // 3D pages drop to top-16 to leave this top row free), below drag-drop
  // overlays (z-40) and mobile panels (z-40/50).
  return (
    <div className={`absolute top-3 left-1/2 -translate-x-1/2 z-30 ${titleClassName}`}>{bar}</div>
  );
}
