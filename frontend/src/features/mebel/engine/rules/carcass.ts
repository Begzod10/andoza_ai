import { cutSize } from '../edges'
import type { CabinetSpec, ConstructionDefaults, EdgeSide, Part, PartRole } from '../model'

const NO_EDGES: Part['edges'] = { L1: null, L2: null, W1: null, W2: null }

/**
 * A cabinet box: two sides, a bottom, a top (two rails on a base cabinet, a
 * full panel on a wall or tall one), shelves and an HDF back. Parts come in a
 * fixed order so their ids stay put when a size changes.
 */
export function carcassParts(
  cab: CabinetSpec,
  d: ConstructionDefaults,
  opts: { top: 'rails' | 'panel'; bottomJoint: ConstructionDefaults['bottomJoint'] },
): Part[] {
  const { width: W, height: H, depth: D } = cab
  const t = d.board.thickness
  const tb = d.back.thickness
  const nailed = d.back.kind === 'hdf_nailed'
  const groove = d.back.kind === 'hdf_groove'
  const under = opts.bottomJoint === 'under_sides'

  // A nailed back sits behind the carcass; a grooved one inside it.
  const Dc = nailed ? D - tb : D
  const Di = groove ? Dc - d.back.grooveOffset - tb : Dc
  const x0 = cab.position.x
  const zc0 = cab.position.z + (nailed ? tb : 0)
  const zFront = zc0 + Dc

  // A band of thickness 0 ("—" in the settings) is no band at all.
  const visible: EdgeSide = d.edge.visible.thickness > 0 ? { band: 'visible', thickness: d.edge.visible.thickness } : null
  const hidden: EdgeSide = d.edge.hidden.thickness > 0 ? { band: 'hidden', thickness: d.edge.hidden.thickness } : null

  const parts: Part[] = []
  const add = (
    role: PartRole,
    finished: { length: number; width: number },
    edges: Part['edges'],
    box: [x1: number, x2: number, y1: number, y2: number, z1: number, z2: number],
    material: Part['material'] = 'board',
  ) => {
    const [x1, x2, y1, y2, z1, z2] = box
    parts.push({
      id: `${cab.label}-${String(parts.length + 1).padStart(2, '0')}`,
      cabinetId: cab.id,
      role,
      material,
      materialId: material === 'board' ? d.board.materialId : d.back.materialId ?? null,
      thickness: material === 'board' ? t : tb,
      finished,
      cut: cutSize(finished, edges, d.edge.premilled),
      grain: material === 'board' ? 'length' : 'none',
      edges,
      qty: 1,
      placement: { x: (x1 + x2) / 2, y: (y1 + y2) / 2, z: (z1 + z2) / 2, sx: x2 - x1, sy: y2 - y1, sz: z2 - z1 },
    })
  }

  const sideH = under ? H - t : H
  const sideY1 = under ? t : 0
  const sideEdges = { L1: visible, L2: null, W1: hidden, W2: null }
  add('side_left', { length: sideH, width: Dc }, sideEdges, [x0, x0 + t, sideY1, H, zc0, zFront])
  add('side_right', { length: sideH, width: Dc }, sideEdges, [x0 + W - t, x0 + W, sideY1, H, zc0, zFront])

  const bottomW = under ? W : W - 2 * t
  const bx1 = under ? x0 : x0 + t
  add('bottom', { length: bottomW, width: Dc }, { ...NO_EDGES, L1: visible }, [bx1, bx1 + bottomW, 0, t, zc0, zFront])

  const inner = W - 2 * t
  if (opts.top === 'rails') {
    add('rail_front', { length: inner, width: d.railDepth }, { ...NO_EDGES, L1: visible },
      [x0 + t, x0 + W - t, H - t, H, zFront - d.railDepth, zFront])
    // A grooved back runs up to the top, so the rear rail stands in front of it.
    const railBackZ = groove ? zc0 + d.back.grooveOffset + tb : zc0
    add('rail_back', { length: inner, width: d.railDepth }, NO_EDGES,
      [x0 + t, x0 + W - t, H - t, H, railBackZ, railBackZ + d.railDepth])
  } else {
    add('top', { length: inner, width: Dc }, { ...NO_EDGES, L1: visible }, [x0 + t, x0 + W - t, H - t, H, zc0, zFront])
  }

  const shelfL = inner - 2 * d.shelfGap
  const shelfD = Di - d.shelfSetback
  for (let i = 1; i <= cab.shelves; i++) {
    const yc = t + ((H - 2 * t) * i) / (cab.shelves + 1)
    add('shelf', { length: shelfL, width: shelfD }, { ...NO_EDGES, L1: visible },
      [x0 + t + d.shelfGap, x0 + W - t - d.shelfGap, yc - t / 2, yc + t / 2, zFront - d.shelfSetback - shelfD, zFront - d.shelfSetback])
  }

  const g = d.backGap
  if (nailed) {
    add('back', { length: W - 2 * g, width: H - 2 * g }, NO_EDGES,
      [x0 + g, x0 + W - g, g, H - g, cab.position.z, cab.position.z + tb], 'back')
  } else if (groove) {
    const gd = d.back.grooveDepth
    const bl = W - 2 * t + 2 * gd - 2 * g
    // A top panel is grooved too, so the back goes into it as into the bottom.
    const yTop = opts.top === 'panel' ? H - t + gd - g : H - g
    const y1 = t - gd + g
    const bx = x0 + (W - bl) / 2
    const zb = zc0 + d.back.grooveOffset
    add('back', { length: bl, width: yTop - y1 }, NO_EDGES, [bx, bx + bl, y1, yTop, zb, zb + tb], 'back')
  }
  return parts
}
