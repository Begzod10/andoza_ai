import { useLayoutEffect, useRef, useState } from "react";
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
  /** One further out on each side. The strip slides a whole slot while you
   *  drag, so without these the leading edge would open onto blank pill. */
  prev2: TabDef;
  next2: TabDef;
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
  const prev2 = tabs[(idx - 2 + n) % n];
  const next2 = tabs[(idx + 2) % n];
  // location.search carried along so any phase/query params survive the hop.
  const go = (t: TabDef) => navigate(t.to + location.search);
  return {
    current: tabs[idx],
    prev,
    next,
    prev2,
    next2,
    goPrev: () => go(prev),
    goNext: () => go(next),
  };
}

// One rounded bar holding three names at a time. The frame stays put; the
// names ride a track inside it, so a drag slides the sections past a fixed
// window rather than dragging the control itself around the screen.
//
// The geometry is in pixels rather than Tailwind classes because the track's
// transform has to be computed from the same numbers.
const SLOT_MAX = 96;
// Narrow hosts exist: Elektr's plan+3D area is the page minus a 256px
// sidebar, which on a phone leaves barely 250px. The slots shrink to fit
// rather than the control hanging off the edge (or being hidden, which is
// how it went missing there).
const SLOT_MIN = 64;
const GAP = 4;
const PAD = 8; // the frame's p-1, both sides

const BAR_CLS =
  "inline-flex p-1 rounded-full bg-white/95 backdrop-blur border border-gray-200 " +
  "shadow-md select-none touch-none overflow-hidden";
const SLOT_CLS = "shrink-0 h-8 px-1 rounded-full flex items-center justify-center";
const SIDE_CLS = `${SLOT_CLS} text-[12px] font-medium text-gray-600 opacity-80 transition-[opacity,background-color]`;
const CURRENT_CLS = `${SLOT_CLS} bg-gray-100 text-[13px] font-bold text-gray-900 transition-[opacity,background-color]`;
const LABEL_CLS = "truncate";

/** Half a slot of travel commits the switch — by then the incoming name is
 *  closer to the centre than the outgoing one. */
const SWITCH_FRACTION = 0.5;
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
  /** Extra classes for the bar's positioned wrapper. NOTE: this wraps the
   *  WHOLE control now, not just the section name it was named for — passing
   *  "hidden sm:block" here removes the navigation entirely on phones, which
   *  is exactly how it went missing from Elektr. */
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
  // Slot width, sized to whatever box the bar was mounted in.
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [slotW, setSlotW] = useState(SLOT_MAX);
  useLayoutEffect(() => {
    // Not the bar's own wrapper: in the overlay variant that wrapper is
    // absolutely positioned and shrink-wraps the bar, so measuring it (or the
    // bar's offsetParent, which IS that wrapper) just reports the bar's width
    // back. One level further out is the page's viewport box — the space
    // actually available.
    const wrapper = hostRef.current?.parentElement;
    const host = (wrapper?.offsetParent as HTMLElement | null) ?? wrapper?.parentElement;
    if (!host) return;
    const fit = () => {
      const avail = host.clientWidth;
      if (!avail) return;
      const w = Math.floor((avail - PAD - 2 * GAP) / 3);
      setSlotW(Math.max(SLOT_MIN, Math.min(SLOT_MAX, w)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(host);
    // Belt and braces: a ResizeObserver only fires with a frame, and these
    // pages can be mid-transition (rails animating open) when the bar mounts.
    window.addEventListener("resize", fit);
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, []);
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
    const step = slotW + GAP;
    const commitAt = step * SWITCH_FRACTION;
    d.side = moved > commitAt ? "prev" : moved < -commitAt ? "next" : null;
    setDx(Math.max(-step, Math.min(step, moved)));
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

  // Five slots so both edges stay filled through a full slot of travel; the
  // middle one is the current section, and the track is offset so it sits in
  // the frame's centre. Dragging moves the track, not the frame.
  const slots = [nav.prev2, nav.prev, nav.current, nav.next, nav.next2];
  // Which slot currently reads as "selected": the one the drag is pulling in,
  // so the emphasis travels with the names instead of staying behind.
  const activeIdx = armed === "next" ? 3 : armed === "prev" ? 1 : 2;

  const bar = (
    <div
      className={BAR_CLS}
      ref={hostRef}
      // maxWidth is the guarantee: if the measurement ever lags the layout,
      // the bar crops itself rather than hanging off the side of its host.
      style={{ width: slotW * 3 + GAP * 2 + PAD, maxWidth: "100%" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div
        className="flex"
        style={{
          gap: GAP,
          transform: `translateX(${-(slotW + GAP) + dx}px)`,
          transition: dx ? "none" : "transform 180ms ease-out",
        }}
      >
        {slots.map((t, i) => {
          const isActive = i === activeIdx;
          const onSide = i === 1 ? nav.goPrev : i === 3 ? nav.goNext : undefined;
          return (
            <button
              key={`${t.seg}-${i}`}
              type="button"
              // Only the immediate neighbours are tappable; the outer two are
              // there to fill the edges mid-drag.
              disabled={!onSide}
              onClick={(e) => { swallowClickAfterDrag(e); if (!e.defaultPrevented) onSide?.(); }}
              title={onSide ? `${i === 1 ? "Oldingi" : "Keyingi"} bo'lim — ${t.label}` : undefined}
              aria-hidden={i === 0 || i === 4}
              aria-current={i === 2 ? "page" : undefined}
              className={`${isActive ? CURRENT_CLS : SIDE_CLS} ${onSide ? "hover:opacity-100 hover:bg-gray-100" : ""}`}
              style={{ width: slotW }}
            >
              <span className={LABEL_CLS}>{t.label}</span>
            </button>
          );
        })}
      </div>
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
