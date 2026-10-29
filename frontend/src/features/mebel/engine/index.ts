import { buildBom, hardwareCounts, type CatalogPrices, type HardwareCounts } from './bom'
import { edgeTotals, estimateSheets, groupParts } from './cutlist'
import { baseCabinetParts, resolveDefaults } from './rules/baseCabinet'
import { partWarnings, validateCabinets } from './validate'
import type { ConstructionDefaults, FurnitureProject, PriceBook, Result } from './model'

export * from './model'
export { buildBom, EMPTY_PRICE_BOOK, hardwareCounts, type CatalogPrices } from './bom'
export { cutSize, round01 } from './edges'
export { edgeTotals, estimateSheets, groupParts } from './cutlist'
export { baseCabinetParts, resolveDefaults } from './rules/baseCabinet'
export { LIMITS, partWarnings } from './validate'

/** The project's errors, each cabinet checked with its own overrides. */
export function validateProject(p: FurnitureProject) {
  const byId = new Map(p.cabinets.map(c => [c.id, resolveDefaults(p, c)]))
  return validateCabinets(p, id => byId.get(id) ?? p.defaults)
}

const EMPTY: Omit<Result, 'errors'> = {
  parts: [], groups: [], edgeTotals: [], sheets: [], bom: [], total: null, hasUnpriced: false, warnings: [],
}

/**
 * Everything the page shows, from the project alone: parts with their 3D
 * placement, the grouped cut list, band metres, the sheet estimate and the
 * priced BOM. Pure: no I/O, the same input always gives the same result.
 */
export function computeProject(p: FurnitureProject, prices: PriceBook, catalog: CatalogPrices): Result {
  const byId = new Map<string, ConstructionDefaults>(p.cabinets.map(c => [c.id, resolveDefaults(p, c)]))
  const settings = (id: string) => byId.get(id) ?? p.defaults
  const { errors } = validateCabinets(p, settings)
  if (errors.length > 0) return { ...EMPTY, errors }

  const parts = p.cabinets.flatMap(c => baseCabinetParts(c, settings(c.id)))
  const groups = groupParts(parts)
  const edges = edgeTotals(
    parts,
    (part, side) => (side.band === 'visible' ? settings(part.cabinetId).edge.visible : settings(part.cabinetId).edge.hidden),
    p.defaults,
  )
  const sheets = estimateSheets(groups, p.defaults.sheet, p.defaults.sheetWaste)
  const hardware = p.cabinets.reduce<HardwareCounts>((sum, c) => {
    const h = hardwareCounts(c, settings(c.id))
    return { leg: sum.leg + h.leg, confirmat: sum.confirmat + h.confirmat, shelfPin: sum.shelfPin + h.shelfPin, nail: sum.nail + h.nail }
  }, { leg: 0, confirmat: 0, shelfPin: 0, nail: 0 })
  const bom = buildBom({ sheets, edges, hardware, prices, catalog })

  const warnings = partWarnings(parts, part => settings(part.cabinetId).sheet)
  if (bom.hasUnpriced) warnings.push({ code: 'unpriced' })
  return { parts, groups, edgeTotals: edges, sheets, bom: bom.lines, total: bom.total, hasUnpriced: bom.hasUnpriced, warnings, errors: [] }
}
