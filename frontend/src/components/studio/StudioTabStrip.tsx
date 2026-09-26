import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Stories-style navigation between the studio's view tabs: the PREVIOUS
 * section's name, the CURRENT one in the middle, and the NEXT one — each
 * neighbour a button that goes there, wrapping around at both ends
 * (Smeta → 3D). Naming the neighbours instead of drawing bare arrows means
 * you can see where a tap leads before taking it.
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

// Same floating-pill family as the other viewport controls: bg-white/95 +
// backdrop-blur, gray-200 border, shadow-md, rounded-full.
//
// The neighbours are NAMED rather than drawn as chevrons — you can see where
// a tap will take you before taking it. They are deliberately quieter than
// the current section (lighter weight, muted text, translucent) so the
// middle pill still reads as "you are here", and they truncate instead of
// pushing the row wider than a phone viewport.
const NEIGHBOUR_CLS =
  "h-10 px-3 max-w-[34vw] sm:max-w-[10rem] rounded-full bg-white/80 backdrop-blur border border-gray-200 " +
  "shadow-md flex items-center gap-1 text-[12px] font-medium text-gray-500 " +
  "hover:bg-white hover:text-gray-900 transition-colors";
const NEIGHBOUR_LABEL_CLS = "truncate";
const TITLE_CLS =
  "h-10 px-4 flex items-center rounded-full bg-white/95 backdrop-blur border border-gray-200 shadow-md " +
  "text-[13px] font-bold text-gray-900 whitespace-nowrap select-none";

export function StudioTabStrip({
  roomId,
  variant = "overlay",
  titleClassName = "",
}: {
  roomId: string;
  /**
   * "overlay": one absolutely-positioned centred cluster (arrow, title,
   * arrow) inside the nearest relative ancestor — the page's viewport box.
   * "inline": the same row in normal flow, for regular document pages
   * (Smeta).
   */
  variant?: "overlay" | "inline";
  /** Extra classes for the overlay title — e.g. "hidden sm:block" where the
   *  host viewport gets too narrow for all three pills (PlacementPage's
   *  plan+3D area on phones); the arrows stay usable without it. */
  titleClassName?: string;
}) {
  const nav = useStudioTabNav(roomId);
  if (!nav) return null;

  const prevBtn = (
    <button
      type="button"
      onClick={nav.goPrev}
      title={`Oldingi bo'lim — ${nav.prev.label}`}
      aria-label={`Oldingi bo'lim — ${nav.prev.label}`}
      className={NEIGHBOUR_CLS}
    >
      <ChevronLeft size={14} aria-hidden="true" className="shrink-0" />
      <span className={NEIGHBOUR_LABEL_CLS}>{nav.prev.label}</span>
    </button>
  );
  const nextBtn = (
    <button
      type="button"
      onClick={nav.goNext}
      title={`Keyingi bo'lim — ${nav.next.label}`}
      aria-label={`Keyingi bo'lim — ${nav.next.label}`}
      className={NEIGHBOUR_CLS}
    >
      <span className={NEIGHBOUR_LABEL_CLS}>{nav.next.label}</span>
      <ChevronRight size={14} aria-hidden="true" className="shrink-0" />
    </button>
  );
  const title = (
    // aria-live so screen readers hear the section change as the arrows cycle.
    <div className={TITLE_CLS} aria-live="polite">
      {nav.current.label}
    </div>
  );

  if (variant === "inline") {
    return (
      <div className="flex items-center justify-between gap-3">
        {prevBtn}
        {title}
        {nextBtn}
      </div>
    );
  }

  // One centred cluster: [←] [section name] [→]. The arrows used to sit in
  // the far corners with the name alone in the middle; keeping all three
  // together means the eye (and the cursor) only has to find one spot, and
  // it leaves both corners free for each page's own controls.
  // z-30: above the canvas and the z-10/z-20 corner-control tiers (which the
  // 3D pages drop to top-16 to leave this top row free), below drag-drop
  // overlays (z-40) and mobile panels (z-40/50).
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2">
      {prevBtn}
      <div className={titleClassName}>{title}</div>
      {nextBtn}
    </div>
  );
}
