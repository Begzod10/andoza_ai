import { cutSize } from '../edges'
import type { CabinetSpec, ConstructionDefaults, EdgeSide, Part, PartRole } from '../model'
import type { FacadeOrderLine } from './doors'

/** Ball-bearing slides: the box runs 12.5 mm clear on each side. */
const SLIDE_CLEARANCE = 12.5
const SLIDE_LENGTHS = [550, 500, 450, 400, 350, 300, 250]
/** Drawer boxes are 16 mm LDSP; the box is 40 mm lower than its front. */
const BOX_T = 16
const BOX_BELOW_FRONT = 40
const BOX_LIFT = 20
const BOX_SETBACK = 2
export const MIN_BOX_HEIGHT = 80

/** Drawers on a cabinet: only a base cabinet has them; null or missing is none. */
export function drawerCount(cab: Pick<CabinetSpec, 'type' | 'drawers'>): number {
  return (cab.type ?? 'base') === 'base' ? cab.drawers ?? 0 : 0
}

/** The longest standard slide that fits the inside depth, less 10 mm; null if none does. */
export function slideLength(depthInside: number): number | null {
  return SLIDE_LENGTHS.find((l) => l <= depthInside - 10) ?? null
}

export function innerDepth(cab: CabinetSpec, d: ConstructionDefaults): number {
  const Dc = d.back.kind === 'hdf_nailed' ? cab.depth - d.back.thickness : cab.depth
  return d.back.kind === 'hdf_groove' ? Dc - d.back.grooveOffset - d.back.thickness : Dc
}

/** Front heights, top drawer first; the bottom one takes the odd millimetres. */
export function frontHeights(cab: CabinetSpec, d: ConstructionDefaults, n: number): number[] {
  const free = cab.height - (n + 1) * d.facade.gap
  const h = Math.floor(free / n)
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? free - (n - 1) * h : h))
}

/** Drawer fronts (LDSP), boxes and their HDF bottoms, numbered after the box parts. */
export function drawerParts(cab: CabinetSpec, d: ConstructionDefaults, firstIndex: number): Part[] {
  const n = drawerCount(cab)
  const Ls = slideLength(innerDepth(cab, d))
  if (n === 0 || Ls == null) return []
  const t = d.board.thickness
  const g = d.facade.gap
  const x0 = cab.position.x
  const Dc = d.back.kind === 'hdf_nailed' ? cab.depth - d.back.thickness : cab.depth
  const zFront = cab.position.z + (d.back.kind === 'hdf_nailed' ? d.back.thickness : 0) + Dc
  const Wi = cab.width - 2 * t
  const boxW = Wi - 2 * SLIDE_CLEARANCE
  const bx1 = x0 + t + SLIDE_CLEARANCE
  const visible: EdgeSide = d.edge.visible.thickness > 0 ? { band: 'visible', thickness: d.edge.visible.thickness } : null
  const hidden: EdgeSide = d.edge.hidden.thickness > 0 ? { band: 'hidden', thickness: d.edge.hidden.thickness } : null
  const none = { L1: null, L2: null, W1: null, W2: null }

  const parts: Part[] = []
  const add = (
    role: PartRole, material: Part['material'], materialId: string | null, thickness: number,
    finished: { length: number; width: number }, edges: Part['edges'], grain: Part['grain'],
    box: [number, number, number, number, number, number],
  ) => {
    const [x1, x2, y1, y2, z1, z2] = box
    parts.push({
      id: `${cab.label}-${String(firstIndex + parts.length + 1).padStart(2, '0')}`,
      cabinetId: cab.id, role, material, materialId, thickness, finished,
      cut: cutSize(finished, edges, d.edge.premilled), grain, edges, qty: 1,
      placement: { x: (x1 + x2) / 2, y: (y1 + y2) / 2, z: (z1 + z2) / 2, sx: x2 - x1, sy: y2 - y1, sz: z2 - z1 },
    })
  }

  let top = cab.height - g
  for (const h of frontHeights(cab, d, n)) {
    const fy1 = top - h
    if (d.facade.kind === 'ldsp') {
      add('drawer_front', 'facade', d.facade.materialId, d.facade.thickness, { length: cab.width - 2 * g, width: h },
        { L1: visible, L2: visible, W1: visible, W2: visible }, 'length',
        [x0 + g, x0 + cab.width - g, fy1, top, zFront, zFront + d.facade.thickness])
    }
    const hq = h - BOX_BELOW_FRONT
    // the box clears the carcass bottom (and its own HDF bottom) on the lowest drawer
    const y1 = Math.max(fy1 + BOX_LIFT, t + d.back.thickness)
    const zb2 = zFront - BOX_SETBACK
    const zb1 = zb2 - Ls
    add('drawer_side', 'board', d.board.materialId, BOX_T, { length: Ls, width: hq }, { ...none, L1: hidden }, 'length',
      [bx1, bx1 + BOX_T, y1, y1 + hq, zb1, zb2])
    add('drawer_side', 'board', d.board.materialId, BOX_T, { length: Ls, width: hq }, { ...none, L1: hidden }, 'length',
      [bx1 + boxW - BOX_T, bx1 + boxW, y1, y1 + hq, zb1, zb2])
    const endL = boxW - 2 * BOX_T
    add('drawer_end', 'board', d.board.materialId, BOX_T, { length: endL, width: hq }, none, 'length',
      [bx1 + BOX_T, bx1 + boxW - BOX_T, y1, y1 + hq, zb2 - BOX_T, zb2])
    add('drawer_end', 'board', d.board.materialId, BOX_T, { length: endL, width: hq }, none, 'length',
      [bx1 + BOX_T, bx1 + boxW - BOX_T, y1, y1 + hq, zb1, zb1 + BOX_T])
    add('drawer_bottom', 'back', d.back.materialId ?? null, d.back.thickness, { length: boxW, width: Ls }, none, 'none',
      [bx1, bx1 + boxW, y1 - d.back.thickness, y1, zb1, zb2])
    top = fy1 - g
  }
  return parts
}

/** MDF drawer fronts to order: equal sizes on one line. */
export function drawerFacadeOrder(cab: CabinetSpec, d: ConstructionDefaults): FacadeOrderLine[] {
  const n = drawerCount(cab)
  if (d.facade.kind !== 'mdf' || n === 0) return []
  const lines: FacadeOrderLine[] = []
  for (const h of frontHeights(cab, d, n)) {
    const same = lines.find((l) => l.width === h)
    if (same) same.qty += 1
    else lines.push({ id: `${cab.label}-T${lines.length + 1}`, cabinetId: cab.id, length: cab.width - 2 * d.facade.gap, width: h, qty: 1, materialId: d.facade.materialId })
  }
  return lines
}

/** Slide pairs of one cabinet. */
export function drawerSlides(cab: CabinetSpec, d: ConstructionDefaults): { length: number; pairs: number } | null {
  const n = drawerCount(cab)
  const Ls = slideLength(innerDepth(cab, d))
  return n > 0 && Ls != null ? { length: Ls, pairs: n } : null
}
