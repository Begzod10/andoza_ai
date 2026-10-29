/**
 * The furniture project model (spec: docs/superpowers/specs/2026-10-29-mebel-ishlab-chiqarish-design.md).
 *
 * Only `FurnitureProject` is stored. Everything else is what `computeProject`
 * derives from it, so the 3D view, the cut list and the price can never drift
 * apart. Lengths are whole millimetres; only an edge band's thickness is
 * fractional (0.4).
 */

export interface EdgeBandRef {
  materialId: string | null
  thickness: 0 | 0.4 | 1 | 2
  width: 19 | 22 | 28
}

export interface ConstructionDefaults {
  board: { materialId: string | null; thickness: 16 | 18 }
  back: {
    kind: 'hdf_nailed' | 'hdf_groove' | 'none'
    materialId?: string | null
    thickness: 3 | 4
    grooveDepth: number
    grooveOffset: number
  }
  bottomJoint: 'between_sides' | 'under_sides'
  /** `premilled`: the edgebander mills the edge first, so the band is not taken off the cut size. */
  edge: { visible: EdgeBandRef; hidden: EdgeBandRef; premilled: boolean }
  sheet: { length: number; width: number }
  railDepth: number
  shelfSetback: number
  /** Clearance on each side of a shelf. */
  shelfGap: number
  /** Clearance on each side of the back panel. */
  backGap: number
  /** Band added to each banded edge: it overhangs both ends and is trimmed off. */
  edgeAllowance: number
  edgeWaste: number
  /** Kept for projects saved before nesting; no longer used. */
  sheetWaste: number
  /** Saw kerf between parts, mm. */
  kerf: number
  /** Factory edge cut off each side of a sheet, mm. */
  trim: number
  /** Doors: LDSP cut in the workshop, MDF ordered from a facade shop, or none. */
  facade: { kind: 'ldsp' | 'mdf' | 'none'; materialId: string | null; thickness: 16 | 18 | 19; gap: number }
}

export interface CabinetSpec {
  id: string
  type: 'base' | 'wall' | 'tall'
  label: string
  /** Outer size, mm. */
  width: number
  height: number
  depth: number
  shelves: number
  /** Doors on the front; unset: two above 600 mm wide, else one. */
  doors?: 0 | 1 | 2
  /** Drawers on a base cabinet (0–4); with drawers it has no door and no shelf. */
  drawers?: 0 | 1 | 2 | 3 | 4
  overrides?: Partial<ConstructionDefaults>
  position: { x: number; z: number }
}

export interface FurnitureProject {
  schemaVersion: 1
  name: string
  defaults: ConstructionDefaults
  cabinets: CabinetSpec[]
}

/** null: this side is not banded. */
export type EdgeSide = { band: 'visible' | 'hidden'; thickness: number } | null

export type PartRole = 'side_left' | 'side_right' | 'bottom' | 'top' | 'rail_front' | 'rail_back' | 'shelf' | 'back' | 'door' | 'drawer_front' | 'drawer_side' | 'drawer_end' | 'drawer_bottom'

/** A hole on a part, mm on its finished size: `u` along its length, `v` along its width
 *  (on an end edge, `u` along the edge from the front and `v` across the thickness).
 *  Face A is the inner (sides, doors) or upper (panels) face; W1/W2 are the end edges.
 *  `depth` 0 goes right through. */
export interface Hole {
  kind: 'confirmat' | 'confirmat_edge' | 'shelf_pin' | 'hinge_cup' | 'hinge_plate' | 'slide'
  face: 'A' | 'B' | 'W1' | 'W2'
  u: number
  v: number
  diameter: number
  depth: number
}

export interface Part {
  id: string
  cabinetId: string
  role: PartRole
  material: 'board' | 'back' | 'facade'
  materialId: string | null
  thickness: number
  /** Size in the assembled cabinet, band included. */
  finished: { length: number; width: number }
  /** Size the saw cuts. */
  cut: { length: number; width: number }
  grain: 'length' | 'width' | 'none'
  /** L1/L2 run along the length (L1 = front), W1/W2 along the width (W1 = top). */
  edges: { L1: EdgeSide; L2: EdgeSide; W1: EdgeSide; W2: EdgeSide }
  qty: number
  /** Centre and size of the part in the room, mm: x = width, y = height, z = depth (front is +z). */
  placement: { x: number; y: number; z: number; sx: number; sy: number; sz: number }
  holes?: Hole[]
}

export interface CutGroup {
  key: string
  /** The first part's role; `roles` lists every role cut on this line. */
  role: PartRole
  roles: PartRole[]
  material: 'board' | 'back' | 'facade'
  materialId: string | null
  thickness: number
  cut: { length: number; width: number }
  finished: { length: number; width: number }
  grain: Part['grain']
  edges: Part['edges']
  qty: number
  partIds: string[]
}

export interface EdgeTotal {
  bandKey: string
  band: 'visible' | 'hidden'
  thickness: number
  width: number
  materialId: string | null
  meters: number
  metersWithWaste: number
}


/** A part's place on a sheet, mm from the sheet's corner; `length` runs along the sheet's length. */
export interface NestPlacement { partId: string; x: number; y: number; length: number; width: number; rotated: boolean }
/** One saw cut, numbered in the order it is made. `along` runs with the sheet's length,
 *  `across` with its width; `offset` is the fence setting: the distance from the edge of
 *  the piece being cut to the cut. */
export interface NestCut {
  x1: number; y1: number; x2: number; y2: number; order: number
  direction: 'along' | 'across'; offset: number
}
export interface NestRect { x: number; y: number; length: number; width: number }
export interface NestedSheet { placements: NestPlacement[]; cuts: NestCut[]; offcuts: NestRect[]; utilization: number }
/** The cutting layout of one board (material + materialId + thickness). */
export interface NestResult {
  material: 'board' | 'back' | 'facade'
  materialId: string | null
  thickness: number
  sheet: { length: number; width: number }
  sheets: NestedSheet[]
  utilization: number
  /** Parts that fit no sheet. */
  unplaced: string[]
}

export interface BomLine {
  kind: 'board' | 'back' | 'facade' | 'edge' | 'hardware' | 'service'
  materialId: string | null
  label: string
  qty: number
  unit: 'sheet' | 'm' | 'dona' | 'm2' | 'percent'
  /** null: no price known — shown as "unpriced", never counted as zero. */
  unitPrice: number | null
  total: number | null
}

export interface PriceBook {
  /** materialId → the workshop's own price; wins over the catalogue's. */
  materials: Record<string, number>
  cutPerSheet: number | null
  bandingPerMeter: { '0.4': number | null; '1': number | null; '2': number | null }
  hardware: {
    leg: number | null; confirmat: number | null; shelfPin: number | null; nail: number | null
    hinge: number | null; handle: number | null; hanger: number | null
    /** One pair of ball-bearing slides. */
    slide?: number | null
  }
  markupPercent: number
}

export interface Warning {
  code: string
  cabinetId?: string
  params?: Record<string, number>
}

export interface Result {
  parts: Part[]
  groups: CutGroup[]
  edgeTotals: EdgeTotal[]
  nesting: NestResult[]
  /** MDF doors to order from a facade shop. */
  facadeOrder: { id: string; cabinetId: string; length: number; width: number; qty: number; materialId: string | null }[]
  bom: BomLine[]
  total: number | null
  hasUnpriced: boolean
  warnings: Warning[]
  errors: Warning[]
}

export const DEFAULTS: ConstructionDefaults = {
  board: { materialId: null, thickness: 18 },
  back: { kind: 'hdf_nailed', materialId: null, thickness: 4, grooveDepth: 8, grooveOffset: 16 },
  bottomJoint: 'between_sides',
  edge: {
    visible: { materialId: null, thickness: 2, width: 22 },
    hidden: { materialId: null, thickness: 0.4, width: 19 },
    premilled: false,
  },
  sheet: { length: 2800, width: 2070 },
  railDepth: 100,
  shelfSetback: 20,
  shelfGap: 1,
  backGap: 1,
  edgeAllowance: 50,
  edgeWaste: 0.1,
  sheetWaste: 0.15,
  kerf: 4,
  trim: 10,
  // A project saved before doors existed has none; a new one gets LDSP doors (newProject).
  facade: { kind: 'none', materialId: null, thickness: 18, gap: 2 },
}

/** Each type's usual size: a base cabinet under the worktop, a wall one above it, a tall one (penal). */
const NEW_SIZE: Record<CabinetSpec['type'], Pick<CabinetSpec, 'width' | 'height' | 'depth' | 'shelves'>> = {
  base: { width: 600, height: 720, depth: 560, shelves: 1 },
  wall: { width: 600, height: 720, depth: 300, shelves: 1 },
  tall: { width: 600, height: 2100, depth: 560, shelves: 4 },
}

export function newCabinet(label: string, x: number, type: CabinetSpec['type'] = 'base'): CabinetSpec {
  return { id: crypto.randomUUID(), type, label, ...NEW_SIZE[type], position: { x, z: 0 } }
}

export function newProject(name: string): FurnitureProject {
  return {
    schemaVersion: 1,
    name,
    defaults: { ...structuredClone(DEFAULTS), facade: { kind: 'ldsp', materialId: null, thickness: 18, gap: 2 } },
    cabinets: [newCabinet('M1', 0)],
  }
}
