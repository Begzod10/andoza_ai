import { buildBom, hardwareCounts, type CatalogPrices, type HardwareCounts } from './bom'
import { edgeTotals, groupParts } from './cutlist'
import { nestSheets } from './nest'
import { resolveDefaults } from './rules/baseCabinet'
import { cabinetParts } from './rules'
import { partWarnings, validateCabinets } from './validate'
import { DEFAULTS } from './model'
import type { ConstructionDefaults, FurnitureProject, PriceBook, Result, Warning } from './model'

export * from './model'
export { buildBom, EMPTY_PRICE_BOOK, hardwareCounts, type CatalogPrices } from './bom'
export { cutSize, round01 } from './edges'
export { edgeTotals, groupParts } from './cutlist'
export { nestSheets } from './nest'
export { baseCabinetParts, resolveDefaults } from './rules/baseCabinet'
export { LIMITS, LIMITS_BY_TYPE, partWarnings } from './validate'
export { cabinetParts } from './rules'

/** A project saved before a setting existed gets that setting's default. */
function withDefaults(p: FurnitureProject): FurnitureProject {
  return {
    ...p,
    defaults: { ...DEFAULTS, ...p.defaults },
    cabinets: p.cabinets.map((c) => (c.type ? c : { ...c, type: 'base' })),
  }
}

/** The project's errors, each cabinet checked with its own overrides. */
export function validateProject(project: FurnitureProject) {
  const p = withDefaults(project)
  const byId = new Map(p.cabinets.map(c => [c.id, resolveDefaults(p, c)]))
  return validateCabinets(p, id => byId.get(id) ?? p.defaults)
}

const EMPTY: Omit<Result, 'errors'> = {
  parts: [], groups: [], edgeTotals: [], nesting: [], bom: [], total: null, hasUnpriced: false, warnings: [],
}

/**
 * Everything the page shows, from the project alone: parts with their 3D
 * placement, the grouped cut list, band metres, the sheet estimate and the
 * priced BOM. Pure: no I/O, the same input always gives the same result.
 */
export function computeProject(project: FurnitureProject, prices: PriceBook, catalog: CatalogPrices): Result {
  const p = withDefaults(project)
  const byId = new Map<string, ConstructionDefaults>(p.cabinets.map(c => [c.id, resolveDefaults(p, c)]))
  const settings = (id: string) => byId.get(id) ?? p.defaults
  const { errors } = validateCabinets(p, settings)
  if (errors.length > 0) return { ...EMPTY, errors }

  const parts = p.cabinets.flatMap(c => cabinetParts(c, settings(c.id)))
  const groups = groupParts(parts)
  const edges = edgeTotals(
    parts,
    (part, side) => (side.band === 'visible' ? settings(part.cabinetId).edge.visible : settings(part.cabinetId).edge.hidden),
    p.defaults,
  )
  const nesting = nestSheets(groups, p.defaults.sheet, { kerf: p.defaults.kerf, trim: p.defaults.trim })
  const hardware = p.cabinets.reduce<HardwareCounts>((sum, c) => {
    const h = hardwareCounts(c, settings(c.id))
    return { leg: sum.leg + h.leg, confirmat: sum.confirmat + h.confirmat, shelfPin: sum.shelfPin + h.shelfPin, nail: sum.nail + h.nail }
  }, { leg: 0, confirmat: 0, shelfPin: 0, nail: 0 })
  const bom = buildBom({ nesting, edges, hardware, prices, catalog })

  const warnings: Warning[] = partWarnings(parts)
  const byPart = new Map(parts.map((x) => [x.id, x]))
  for (const n of nesting) {
    for (const id of n.unplaced) {
      const part = byPart.get(id)!
      warnings.push({ code: 'part_exceeds_sheet', cabinetId: part.cabinetId, params: { length: part.cut.length, width: part.cut.width } })
    }
  }
  if (bom.hasUnpriced) warnings.push({ code: 'unpriced' })
  return { parts, groups, edgeTotals: edges, nesting, bom: bom.lines, total: bom.total, hasUnpriced: bom.hasUnpriced, warnings, errors: [] }
}
