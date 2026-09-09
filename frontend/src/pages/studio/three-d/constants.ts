import type { CSSProperties } from "react";

/**
 * Module-level constants, lookup tables and small type aliases shared across
 * the 3D studio's room-rendering components. Split out of ThreeDPage.tsx —
 * see that file's header comment for the full picture.
 */

// Walls are WIDTHLESS planes: surfaces sit exactly on the room boundary, so
// corners share their edge precisely (welded), and from outside the camera
// sees straight into the room (backface-culled) — dollhouse style.
export const WALL_T = 0;


// ─── Surface color defaults ───────────────────────────────────────────────────

export const CEILING_DEFAULT = "#D5D3CE";


// ─── Floor with canvas texture ────────────────────────────────────────────────

export const FLOOR_COLORS: Record<string, string> = {
  parquet: "#C9AB7E",
  laminate: "#B8906A",
  tile: "#D8D8D0",
  concrete: "#9E9E9E",
};


// Bare-screed placeholder shown until the user actually visits Pol and picks
// something — a plank/tile pattern no one chose read as a rendering bug
// (z-fighting/UV artifact), not as "here's your default floor".
export const UNCONFIGURED_FLOOR_COLOR = "#DCD7CC";


// ─── Wall with door/window openings ──────────────────────────────────────────

export const WALLPAPER_WIDTH_M = 1.06 // standard roll width


// ─── Wall-mounted electrical devices ─────────────────────────────────────────

export const ELECTRICAL_DIMS: Record<string, { w: number; h: number }> = {
  switch1:      { w: 0.08, h: 0.08 },
  switch2:      { w: 0.14, h: 0.08 },
  socket1:      { w: 0.08, h: 0.08 },
  socket2:      { w: 0.14, h: 0.08 },
  socket_media: { w: 0.18, h: 0.08 },
  // panel is a cabinet, not a thin faceplate
  panel:        { w: 0.40, h: 0.50 },
}


/** For meshes that must stay in the scene but out of every pick. */
export const noRaycast = () => {}


// ─── Add-room "+" buttons shown around the room in top-down view ──────────────

export const ADD_ROOM_BTN_STYLE: CSSProperties = {
  width: '44px',
  height: '44px',
  borderRadius: '50%',
  border: '2.5px solid #1E40AF',
  background: 'rgba(255,255,255,0.92)',
  cursor: 'pointer',
  fontSize: '22px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 2px 12px rgba(0,0,0,0.22)',
  color: '#1E40AF',
  fontWeight: 'bold',
  userSelect: 'none',
  lineHeight: 1,
};


export type RoomSide = 'north' | 'south' | 'east' | 'west';


// ─── Sibling rooms (top view floor plan) ──────────────────────────────────────
// Renders the apartment's other rooms as flat clickable outlines beside the
// active room. Data and navigation come in as props: router/query contexts
// don't bridge into the R3F Canvas tree.

export const SIBLING_LABEL_STYLE: CSSProperties = {
  padding: '4px 12px',
  borderRadius: 999,
  border: '1px solid #E5E0D5',
  background: 'rgba(255,255,255,0.92)',
  color: '#4A4438',
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
};


export const SIBLING_DELETE_STYLE: CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 999,
  border: '1px solid #FECACA',
  background: 'rgba(255,255,255,0.92)',
  color: '#DC2626',
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1,
  cursor: 'pointer',
  boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};


// Flat approximation of each floor finish — the real per-type PBR textures
// (WoodFloor) are only built for the active room; a sibling preview gets a
// representative colour instead of loading a second full material pipeline.
export const SIBLING_FLOOR_COLOR_BY_TYPE: Record<string, string> = {
  parquet: '#C9A06B',
  tile: '#E8E8E8',
  laminate: '#B98D5D',
  concrete: '#9B9B9B',
}

export const SIBLING_FLOOR_COLOR_DEFAULT = '#D9C9A8'

export const SIBLING_WALL_COLOR_DEFAULT = '#C9C2B4'


// ─── View presets ─────────────────────────────────────────────────────────────

export type ViewPreset = "corner" | "front" | "back" | "top";


export const VIEW_LABELS: Record<ViewPreset, string> = {
  corner: "Burchak",
  front:  "Old tomon",
  back:   "3D",
  top:    "Yuqori",
};
