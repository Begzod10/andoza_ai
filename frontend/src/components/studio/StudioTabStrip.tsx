import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Instagram-stories-style navigation between the studio's view tabs:
 * a LEFT arrow (previous tab), the CURRENT tab's name centered, and a
 * RIGHT arrow (next tab), wrapping around at both ends (Smeta → 3D).
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

// Same floating-pill family as ViewModeSegment / the Eshik-Deraza chip:
// bg-white/95 + backdrop-blur, gray-200 border, shadow-md, rounded-full.
const ARROW_CLS =
  "w-10 h-10 rounded-full bg-white/95 backdrop-blur border border-gray-200 shadow-md " +
  "flex items-center justify-center text-gray-700 hover:bg-white hover:text-gray-900 transition-colors";
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
      className={ARROW_CLS}
    >
      <ChevronLeft size={20} aria-hidden="true" />
    </button>
  );
  const nextBtn = (
    <button
      type="button"
      onClick={nav.goNext}
      title={`Keyingi bo'lim — ${nav.next.label}`}
      aria-label={`Keyingi bo'lim — ${nav.next.label}`}
      className={ARROW_CLS}
    >
      <ChevronRight size={20} aria-hidden="true" />
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
