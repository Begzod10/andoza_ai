import type { ConstructionDefaults, FurnitureProject, Part, Warning } from './model'

export const LIMITS = {
  width: [150, 1200],
  height: [300, 1000],
  depth: [250, 700],
  shelves: [0, 4],
  cabinets: 30,
} as const

const outside = (v: number, [lo, hi]: readonly [number, number]) => !(v >= lo && v <= hi)
const finite = (v: unknown, min = 0) => typeof v === 'number' && Number.isFinite(v) && v >= min

/** Errors stop the calculation (a field is marked red); `resolve` gives each
 *  cabinet's construction settings, its overrides included. */
export function validateCabinets(
  p: FurnitureProject,
  resolve: (cabId: string) => ConstructionDefaults = () => p.defaults,
): { errors: Warning[] } {
  const errors: Warning[] = []
  if (p.cabinets.length > LIMITS.cabinets) errors.push({ code: 'too_many_cabinets', params: { max: LIMITS.cabinets } })
  const s = p.defaults.sheet
  if (!finite(s?.length, 100) || !finite(s?.width, 100)) errors.push({ code: 'sheet_size', params: { min: 100 } })
  const d0 = p.defaults
  if (![d0.railDepth, d0.shelfSetback, d0.shelfGap, d0.backGap, d0.edgeAllowance, d0.edgeWaste, d0.sheetWaste].every(v => finite(v))) {
    errors.push({ code: 'settings_invalid' })
  }
  for (const c of p.cabinets) {
    const d = resolve(c.id)
    const t = d.board.thickness
    if (outside(c.width, LIMITS.width)) errors.push({ code: 'width_range', cabinetId: c.id, params: { min: 150, max: 1200 } })
    if (outside(c.height, LIMITS.height)) errors.push({ code: 'height_range', cabinetId: c.id, params: { min: 300, max: 1000 } })
    if (outside(c.depth, LIMITS.depth)) errors.push({ code: 'depth_range', cabinetId: c.id, params: { min: 250, max: 700 } })
    if (!Number.isInteger(c.shelves) || outside(c.shelves, LIMITS.shelves)) {
      errors.push({ code: 'shelves_range', cabinetId: c.id, params: { min: 0, max: 4 } })
    }
    // the server stores whole millimetres
    if ([c.width, c.height, c.depth].some(v => Number.isFinite(v) && !Number.isInteger(v))) {
      errors.push({ code: 'whole_mm', cabinetId: c.id })
    }
    if (c.width - 2 * t <= 0) errors.push({ code: 'inner_width', cabinetId: c.id })
    const Dc = d.back.kind === 'hdf_nailed' ? c.depth - d.back.thickness : c.depth
    const Di = d.back.kind === 'hdf_groove' ? Dc - d.back.grooveOffset - d.back.thickness : Dc
    if (c.shelves > 0 && Di - d.shelfSetback <= 0) errors.push({ code: 'shelf_depth', cabinetId: c.id })
  }
  return { errors }
}

/** Warnings about computed parts: the calculation still stands. */
export function partWarnings(parts: Part[], sheetOf: (p: Part) => { length: number; width: number }): Warning[] {
  const warnings: Warning[] = []
  for (const p of parts) {
    if (p.role === 'shelf' && p.thickness === 16 && p.finished.length > 800) {
      warnings.push({ code: 'shelf_sag', cabinetId: p.cabinetId, params: { length: p.finished.length } })
    }
    const s = sheetOf(p)
    const fits = p.cut.length <= s.length && p.cut.width <= s.width
    // A grained part runs along the sheet's grain; only a plain one may be turned.
    const fitsTurned = p.grain === 'none' && p.cut.length <= s.width && p.cut.width <= s.length
    if (!fits && !fitsTurned) {
      warnings.push({ code: 'part_exceeds_sheet', cabinetId: p.cabinetId, params: { length: p.cut.length, width: p.cut.width } })
    }
  }
  return warnings
}
