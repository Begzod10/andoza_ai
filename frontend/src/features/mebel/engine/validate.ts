import { frontHeights, innerDepth, MIN_BOX_HEIGHT, slideLength } from './rules/drawers'
import type { ConstructionDefaults, FurnitureProject, Part, Warning } from './model'

export const LIMITS = {
  width: [150, 1200],
  height: [300, 1000],
  depth: [250, 700],
  shelves: [0, 4],
  cabinets: 30,
} as const

/** Size and shelf limits per cabinet type. */
export const LIMITS_BY_TYPE = {
  base: { width: [150, 1200], height: [300, 1000], depth: [250, 700], shelves: [0, 4] },
  wall: { width: [150, 1200], height: [300, 1000], depth: [200, 400], shelves: [0, 4] },
  tall: { width: [150, 1200], height: [1200, 2400], depth: [300, 650], shelves: [0, 8] },
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
  const d0 = p.defaults
  const s = d0.sheet
  const trimOk = finite(d0.trim) && d0.trim <= 50
  if (!finite(s?.length, 100) || !finite(s?.width, 100) || (trimOk && (s.length - 2 * d0.trim <= 0 || s.width - 2 * d0.trim <= 0))) {
    errors.push({ code: 'sheet_size', params: { min: 100 } })
  }
  const f = d0.facade
  const facadeOk = !f || (finite(f.gap) && f.gap <= 5 && [16, 18, 19].includes(f.thickness))
  if (!trimOk || !finite(d0.kerf) || d0.kerf > 10 || !facadeOk) errors.push({ code: 'settings_invalid' })
  if (![d0.railDepth, d0.shelfSetback, d0.shelfGap, d0.backGap, d0.edgeAllowance, d0.edgeWaste, d0.sheetWaste].every(v => finite(v))) {
    errors.push({ code: 'settings_invalid' })
  }
  for (const c of p.cabinets) {
    const d = resolve(c.id)
    const t = d.board.thickness
    const lim = LIMITS_BY_TYPE[c.type ?? 'base'] ?? LIMITS_BY_TYPE.base
    const range = (code: string, v: number, [min, max]: readonly [number, number]) => {
      if (outside(v, [min, max])) errors.push({ code, cabinetId: c.id, params: { min, max } })
    }
    range('width_range', c.width, lim.width)
    range('height_range', c.height, lim.height)
    range('depth_range', c.depth, lim.depth)
    if (!Number.isInteger(c.shelves)) errors.push({ code: 'shelves_range', cabinetId: c.id, params: { min: lim.shelves[0], max: lim.shelves[1] } })
    else range('shelves_range', c.shelves, lim.shelves)
    const nDrawers = c.drawers ?? 0
    if (!Number.isInteger(nDrawers) || nDrawers < 0 || nDrawers > 4) {
      errors.push({ code: 'drawers_range', cabinetId: c.id, params: { min: 0, max: 4 } })
    } else if (nDrawers > 0) {
      if ((c.type ?? 'base') !== 'base') errors.push({ code: 'drawers_type', cabinetId: c.id })
      else {
        const Ls = slideLength(innerDepth(c, d))
        if (Ls == null) errors.push({ code: 'drawer_shallow', cabinetId: c.id, params: { min: 250 } })
        if (Math.min(...frontHeights(c, d, nDrawers)) - 40 < MIN_BOX_HEIGHT) errors.push({ code: 'drawer_low', cabinetId: c.id, params: { min: MIN_BOX_HEIGHT } })
      }
    }
    if (!(Number.isFinite(c.position?.x) && c.position.x >= 0)) errors.push({ code: 'position_range', cabinetId: c.id })
    // a saved "auto" may come back as null
    if (c.doors != null && ![0, 1, 2].includes(c.doors)) errors.push({ code: 'doors_range', cabinetId: c.id, params: { min: 0, max: 2 } })
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
export function partWarnings(parts: Part[]): Warning[] {
  const warnings: Warning[] = []
  // one warning per cabinet: the longest of its sagging shelves
  const seen = new Set<string>()
  for (const p of [...parts].sort((a, b) => b.finished.length - a.finished.length)) {
    // longest unsupported span a shelf of this thickness holds without sagging
    const span = p.thickness === 16 ? 800 : p.thickness === 18 ? 900 : null
    if (p.role === 'shelf' && span != null && p.finished.length > span && !seen.has(p.cabinetId)) {
      seen.add(p.cabinetId)
      warnings.push({ code: 'shelf_sag', cabinetId: p.cabinetId, params: { length: p.finished.length, t: p.thickness } })
    }
  }
  return warnings
}
