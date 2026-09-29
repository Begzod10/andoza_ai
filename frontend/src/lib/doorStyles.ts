/**
 * Door leaf styles, after the MY-P millwork sheet the user supplied: painted
 * ivory doors, their panels framed by a moulded bead, in the layouts that
 * sheet shows — one tall panel, two, six, an arched head, a fluted field, an
 * oval, a ring.
 *
 * A style is nothing but the panels on the face. Everything else about a door
 * — its size, its hinge, how far it stands open — is already on the element,
 * so a style can be swapped onto an existing door without touching any of it.
 *
 * Panels are described in the leaf's own space: x and y run -0.5 … 0.5 across
 * the leaf, y up. Keeping them normalised means one description works for a
 * 700 mm door and a 900 mm one, and the same numbers draw the thumbnail and
 * cut the 3D moulding — the two cannot drift.
 */

export type PanelShape =
  /** Square corners. */
  | 'rect'
  /** Semicircular head, square foot — the classic arched panel. */
  | 'arch'
  /** Rounded at both ends, like a running track. */
  | 'stadium'
  /** Square head, semicircular foot. */
  | 'dome'
  /** A plain circle — the ring on MY-P041. */
  | 'circle'

export interface DoorPanel {
  /** Centre, in leaf space. */
  x: number
  y: number
  w: number
  h: number
  shape: PanelShape
  /** Vertical grooves across the panel's field, as the fluted doors have. */
  fluted?: boolean
  /** A second bead inside the first, which is what makes a panel read as
   *  deeply moulded rather than simply sunk. */
  double?: boolean
}

export interface DoorStyle {
  id: string
  /** The sheet's own code, so a pick can be matched against the printed page. */
  label: string
  panels: DoorPanel[]
}

/** Leaf colours from the sheet: painted ivory, warm white, and the two
 *  darker stains the studio already offered. */
export const DOOR_IVORY = '#EDE6D8'

const p = (
  x: number, y: number, w: number, h: number,
  shape: PanelShape = 'rect',
  extra: Omit<DoorPanel, 'x' | 'y' | 'w' | 'h' | 'shape'> = {},
): DoorPanel => ({ x, y, w, h, shape, ...extra })

/** Two columns of three — the six-panel door, in one place since three styles
 *  are variations on it. */
const sixPanel = (): DoorPanel[] => [
  p(-0.19, 0.30, 0.30, 0.22), p(0.19, 0.30, 0.30, 0.22),
  p(-0.19, 0.00, 0.30, 0.26), p(0.19, 0.00, 0.30, 0.26),
  p(-0.19, -0.30, 0.30, 0.22), p(0.19, -0.30, 0.30, 0.22),
]

export const DOOR_STYLES: DoorStyle[] = [
  // One tall panel with a fine bead — the plainest panelled door on the sheet.
  { id: 'p005', label: 'MY-P005', panels: [p(0, 0, 0.78, 0.86)] },
  // Two panels, the upper one twice the lower.
  { id: 'p006', label: 'MY-P006', panels: [p(0, 0.17, 0.76, 0.52, 'rect', { double: true }), p(0, -0.30, 0.76, 0.26, 'rect', { double: true })] },
  // Arched head over a square foot.
  { id: 'p009', label: 'MY-P009', panels: [p(0, 0.19, 0.74, 0.50, 'arch'), p(0, -0.29, 0.74, 0.28)] },
  // Flush: no panels at all.
  { id: 'p015', label: 'MY-P015', panels: [] },
  // Six panels, small at the ends and large in the middle.
  {
    id: 'p019', label: 'MY-P019',
    panels: [
      p(-0.20, 0.33, 0.30, 0.15), p(0.20, 0.33, 0.30, 0.15),
      p(0, 0.05, 0.72, 0.38, 'rect', { double: true }),
      p(-0.20, -0.32, 0.30, 0.16), p(0.20, -0.32, 0.30, 0.16),
    ],
  },
  // A single tall oval.
  { id: 'p020', label: 'MY-P020', panels: [p(0, 0, 0.60, 0.82, 'stadium', { double: true })] },
  { id: 'p021', label: 'MY-P021', panels: [p(0, 0.17, 0.76, 0.56), p(0, -0.32, 0.76, 0.24)] },
  { id: 'p022', label: 'MY-P022', panels: [p(0, 0, 0.72, 0.84, 'rect', { double: true })] },
  { id: 'p023', label: 'MY-P023', panels: [p(0, 0.20, 0.74, 0.48, 'rect', { double: true }), p(0, -0.28, 0.74, 0.28, 'rect', { double: true })] },
  { id: 'p026', label: 'MY-P026', panels: [p(0, 0.16, 0.74, 0.56, 'arch'), p(0, -0.33, 0.74, 0.20)] },
  // An oval head over a half-round foot.
  { id: 'p027', label: 'MY-P027', panels: [p(0, 0.14, 0.64, 0.62, 'arch', { double: true }), p(0, -0.32, 0.44, 0.22, 'dome')] },
  // Fluted, with an arched head.
  { id: 'p031', label: 'MY-P031', panels: [p(0, 0.15, 0.74, 0.58, 'arch', { fluted: true }), p(0, -0.31, 0.74, 0.24, 'rect', { fluted: true })] },
  { id: 'p032', label: 'MY-P032', panels: sixPanel() },
  { id: 'p033', label: 'MY-P033', panels: [p(0, 0.15, 0.76, 0.60), p(0, -0.33, 0.76, 0.20)] },
  // One fluted arch, full height.
  { id: 'p034', label: 'MY-P034', panels: [p(0, 0, 0.74, 0.86, 'arch', { fluted: true })] },
  {
    id: 'p037', label: 'MY-P037',
    panels: [
      p(-0.19, 0.33, 0.30, 0.16), p(0.19, 0.33, 0.30, 0.16),
      p(0, 0.05, 0.72, 0.36), p(0, -0.31, 0.72, 0.22),
    ],
  },
  // A ring set into a full-height panel.
  { id: 'p041', label: 'MY-P041', panels: [p(0, 0, 0.76, 0.86), p(0, -0.10, 0.34, 0.34, 'circle')] },
  // Fluted from top to bottom, no bead.
  { id: 'p044', label: 'MY-P044', panels: [p(0, 0, 0.80, 0.88, 'rect', { fluted: true })] },
]

const BY_ID = new Map(DOOR_STYLES.map((s) => [s.id, s]))

/** The plain flush leaf the studio drew before this sheet existed, so a door
 *  saved without a style keeps the look it was made with. */
export const DEFAULT_DOOR_STYLE = 'p021'

export function doorStyle(id: string | undefined): DoorStyle {
  return (id ? BY_ID.get(id) : undefined) ?? BY_ID.get(DEFAULT_DOOR_STYLE)!
}

/**
 * A panel's outline, sampled as a closed polyline in LEAF space.
 *
 * One sampler for both the 3D moulding and the thumbnail: an arch drawn one
 * way in the preview and another on the door would be worse than no preview.
 */
export function panelOutline(panel: DoorPanel, segs = 18): [number, number][] {
  const { x, y, w, h, shape } = panel
  const hw = w / 2
  const hh = h / 2
  const pts: [number, number][] = []

  const arc = (cx: number, cy: number, rx: number, ry: number, from: number, to: number) => {
    for (let i = 0; i <= segs; i++) {
      const t = from + ((to - from) * i) / segs
      pts.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry])
    }
  }

  if (shape === 'circle') {
    arc(x, y, hw, hh, 0, Math.PI * 2)
    return pts
  }

  if (shape === 'stadium') {
    // Straight sides, semicircular head and foot — a running track on end.
    const r = Math.min(hw, hh / 2)
    pts.push([x - hw, y - hh + r])
    arc(x, y - hh + r, hw, r, Math.PI, Math.PI * 2)
    pts.push([x + hw, y + hh - r])
    arc(x, y + hh - r, hw, r, 0, Math.PI)
    return pts
  }

  if (shape === 'arch') {
    // Square foot, semicircular head springing from the panel's shoulders.
    const rise = Math.min(hw, h * 0.42)
    pts.push([x - hw, y - hh], [x + hw, y - hh], [x + hw, y + hh - rise])
    arc(x, y + hh - rise, hw, rise, 0, Math.PI)
    // The arc ends above the left shoulder; the outline closes down that side
    // on its own, so repeating the first point here would only duplicate it.
    return pts
  }

  if (shape === 'dome') {
    // Square head, half-round foot.
    const drop = Math.min(hw, h * 0.5)
    pts.push([x + hw, y + hh], [x - hw, y + hh], [x - hw, y - hh + drop])
    arc(x, y - hh + drop, hw, drop, Math.PI, Math.PI * 2)
    return pts
  }

  pts.push([x - hw, y - hh], [x + hw, y - hh], [x + hw, y + hh], [x - hw, y + hh])
  return pts
}

/** Where a fluted panel's grooves run: x offsets in leaf space, and the y
 *  range each one spans. Kept here so the preview and the moulding cut the
 *  same grooves. */
export function panelFlutes(panel: DoorPanel, count = 9): { x: number; y0: number; y1: number }[] {
  const inset = panel.w * 0.09
  const usable = panel.w - inset * 2
  const step = usable / (count - 1)
  // An arched panel's grooves stop short of the head, which is where the
  // curve would cut them off at an angle.
  const top = panel.shape === 'arch' ? panel.y + panel.h / 2 - Math.min(panel.w / 2, panel.h * 0.42) : panel.y + panel.h / 2 - panel.h * 0.06
  return Array.from({ length: count }, (_, i) => ({
    x: panel.x - usable / 2 + step * i,
    y0: panel.y - panel.h / 2 + panel.h * 0.06,
    y1: top,
  }))
}
