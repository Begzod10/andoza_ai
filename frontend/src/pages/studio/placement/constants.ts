import type { ElectricalType } from '@/store/roomStore'
import i18n from '@/i18n'

// ─── Layout constants ─────────────────────────────────────────────────────────

export const NAVY = '#1B3784'
export const WIRE = '#DC2626'
export const SCALE = 88        // SVG px per metre
export const PAD   = 48        // padding around room
// Keyboard arrow-key nudge step for placed electricals — no drag-snap grid
// exists for this surface (pointer drag is continuous, rounded to 1mm), so
// this is a dedicated keyboard-only step size.
export const KEYBOARD_NUDGE_MM = 20

// ─── Device catalog ───────────────────────────────────────────────────────────

export interface CatalogEntry { type: ElectricalType; height: number; oneTime?: boolean }

export const CATALOG: CatalogEntry[] = [
  { type: 'panel',        height: 1500, oneTime: true },
  { type: 'switch1',      height: 900 },
  { type: 'switch2',      height: 900 },
  { type: 'socket1',      height: 300 },
  { type: 'socket2',      height: 300 },
  { type: 'socket_media', height: 1200 },
  // Mounted high on the wall, just under the ceiling line, the way a
  // split unit's indoor half actually hangs.
  { type: 'ac',           height: 2400 },
]

const LABEL_KEYS = {
  panel: 'studio.placement.dev.panel',
  switch1: 'studio.placement.dev.switch1',
  switch2: 'studio.placement.dev.switch2',
  socket1: 'studio.placement.dev.socket1',
  socket2: 'studio.placement.dev.socket2',
  socket_media: 'studio.placement.dev.socket_media',
  ac: 'studio.placement.dev.ac',
} as const satisfies Record<ElectricalType, string>

/** The device's name in the current language. Read while rendering (not at
 *  module load) so it follows a language change; callers subscribe with
 *  `useTranslation()`. */
export function electricalLabel(type: ElectricalType): string {
  return i18n.t(LABEL_KEYS[type])
}

/** The same, shortened where the full name is long (tables, 3D tags). */
export function electricalShort(type: ElectricalType): string {
  return type === 'socket_media' ? i18n.t('studio.placement.dev_short.socket_media') : electricalLabel(type)
}

export const SOCKET_TYPES = new Set<ElectricalType>(['socket1', 'socket2', 'socket_media'])
export const SWITCH_TYPES = new Set<ElectricalType>(['switch1', 'switch2'])

// ─── Wire routing (wall-surface only) ────────────────────────────────────────

export const WIRE_INSET = 5        // px inset from wall edge so wires are visible
export const WIRE_PALETTE = ['#DC2626','#2563EB','#16A34A','#D97706','#7C3AED','#DB2777','#0891B2','#EA580C']

// 3D wall-surface point at height h, 1.5 cm inward so the wire renders in front of the wall plane (avoids z-fighting)
export const WIRE_OFS = 0.015

// ─── Wall openings (doors / windows) ─────────────────────────────────────────

export const WALL_STROKE = 8   // must match strokeWidth on the wall rect

// ─── Dimension overlay ────────────────────────────────────────────────────────

export const DIM_C = '#2A4A7A'
export const DIM_TICK = 5   // half-length of tick cross

// ─── Polygon (N-wall) rooms ───────────────────────────────────────────────────

export const MM_PX = SCALE / 1000

// ─── 3D Elektr view ───────────────────────────────────────────────────────────

export const ELEC_DIMS_3D: Record<ElectricalType, { w: number; h: number }> = {
  switch1:      { w: 0.08, h: 0.08 },
  switch2:      { w: 0.14, h: 0.08 },
  socket1:      { w: 0.08, h: 0.08 },
  socket2:      { w: 0.14, h: 0.08 },
  socket_media: { w: 0.18, h: 0.08 },
  panel:        { w: 0.40, h: 0.50 },
  ac:           { w: 0.90, h: 0.30 },
}
