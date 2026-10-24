/**
 * One row of the studio's ⋮ menu: the same height, icon slot and type for
 * every entry, whichever component draws it (StudioPage's Ulashish and
 * O'chirish, the 3D view's rows in ToolsDrawerPanel).
 */
export const MENU_ROW =
  "flex items-center gap-3 w-full text-left px-4 min-h-[48px] text-sm font-medium " +
  "text-ink hover:bg-card-soft transition-colors";

/** The 18px icon at a row's start. */
export const MENU_ICON = "w-[18px] h-[18px] shrink-0 text-ink-muted";
