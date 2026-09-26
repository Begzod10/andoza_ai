import type { ElectricalType } from '@/store/roomStore'

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

export interface CatalogEntry { type: ElectricalType; label: string; height: number; oneTime?: boolean }

export const CATALOG: CatalogEntry[] = [
  { type: 'panel',        label: 'Elektr qutisi',        height: 1500, oneTime: true },
  { type: 'switch1',      label: 'Bitta kalit',          height: 900 },
  { type: 'switch2',      label: 'Ikkita kalit',         height: 900 },
  { type: 'socket1',      label: 'Bitta rozetka',        height: 300 },
  { type: 'socket2',      label: 'Ikkita rozetka',       height: 300 },
  { type: 'socket_media', label: 'TV + Ethernet + Ant.', height: 1200 },
]

export const TYPE_LABEL: Record<ElectricalType, string> = {
  panel: 'Elektr qutisi', switch1: 'Bitta kalit', switch2: 'Ikkita kalit',
  socket1: 'Bitta rozetka', socket2: 'Ikkita rozetka', socket_media: 'TV+ETH+ANT',
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
}
