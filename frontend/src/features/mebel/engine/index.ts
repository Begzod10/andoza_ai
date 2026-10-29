import { buildBom, HARDWARE_KEYS, hardwareCounts, type CatalogPrices, type HardwareCounts } from './bom'
import { edgeTotals, groupParts } from './cutlist'
import { nestSheets } from './nest'
import { resolveDefaults } from './rules/baseCabinet'
import { cabinetParts } from './rules'
import { doorParts, facadeOrderLines } from './rules/doors'
import { partWarnings, validateCabinets } from './validate'
import { DEFAULTS } from './model'
import type { ConstructionDefaults, FurnitureProject, PriceBook, Result, Warning } from './model'

export * from './model'
export { buildBom, EMPTY_PRICE_BOOK, HARDWARE_KEYS, hardwareCounts, type CatalogPrices } from './bom'
export { doorCount, type FacadeOrderLine } from './rules/doors'
export { cutSize, round01 } from './edges'
export { edgeTotals, groupParts } from './cutlist'
export { nestSheets } from './nest'
export { baseCabinetParts, resolveDefaults } from './rules/baseCabinet'
export { LIMITS, LIMITS_BY_TYPE, partWarnings } from './validate'
export { cabinetParts } from './rules'

/** A project saved before a setting existed gets that setting's default; a cabinet
 *  saved before types existed is a base cabinet. */
export function normalizeProject(p: FurnitureProject): FurnitureProject {
  return {
    ...p,
    defaults: { ...DEFAULTS, ...p.defaults },
    cabinets: p.cabinets.map((c) => (c.type ? c : { ...c, type: 'base' })),
  }
}

/** The project's errors, each cabinet checked with its own overrides. */
export function validateProject(project: FurnitureProject) {
  const p = normalizeProject(project)
  const byId = new Map(p.cabinets.map(c => [c.id, resolveDefaults(p, c)]))
  return validateCabinets(p, id => byId.get(id) ?? p.defaults)
}

const EMPTY: Omit<Result, 'errors'> = {
  parts: [], groups: [], edgeTotals: [], nesting: [], facadeOrder: [], bom: [], total: null, hasUnpriced: false, warnings: [],
}

/**
 * Everything the page shows, from the project alone: parts with their 3D
 * placement, the grouped cut list, band metres, the sheet estimate and the
 * priced BOM. Pure: no I/O, the same input always gives the same result.
 */
export function computeProject(project: FurnitureProject, prices: PriceBook, catalog: CatalogPrices): Result {
  const p = normalizeProject(project)
  const byId = new Map<string, ConstructionDefaults>(p.cabinets.map(c => [c.id, resolveDefaults(p, c)]))
  const settings = (id: string) => byId.get(id) ?? p.defaults
  const { errors } = validateCabinets(p, settings)
  if (errors.length > 0) return { ...EMPTY, errors }

  const parts = p.cabinets.flatMap((c) => {
    const box = cabinetParts(c, settings(c.id))
    return [...box, ...doorParts(c, settings(c.id), box.length)]
  })
  const facadeOrder = p.cabinets.flatMap((c) => facadeOrderLines(c, settings(c.id)))
  const groups = groupParts(parts)
  const edges = edgeTotals(
    parts,
    (part, side) => (side.band === 'visible' ? settings(part.cabinetId).edge.visible : settings(part.cabinetId).edge.hidden),
    p.defaults,
  )
  const nesting = nestSheets(groups, p.defaults.sheet, { kerf: p.defaults.kerf, trim: p.defaults.trim })
  const hardware = p.cabinets.reduce<HardwareCounts>((sum, c) => {
    const h = hardwareCounts(c, settings(c.id))
    return Object.fromEntries(HARDWARE_KEYS.map((k) => [k, sum[k] + h[k]])) as HardwareCounts
  }, Object.fromEntries(HARDWARE_KEYS.map((k) => [k, 0])) as HardwareCounts)
  const bom = buildBom({ nesting, facadeOrder, edges, hardware, prices, catalog })

  const warnings: Warning[] = partWarnings(parts)
  const byPart = new Map(parts.map((x) => [x.id, x]))
  for (const n of nesting) {
    for (const id of n.unplaced) {
      const part = byPart.get(id)!
      warnings.push({ code: 'part_exceeds_sheet', cabinetId: part.cabinetId, params: { length: part.cut.length, width: part.cut.width } })
    }
  }
  if (bom.hasUnpriced) warnings.push({ code: 'unpriced' })
  return { parts, groups, edgeTotals: edges, nesting, facadeOrder, bom: bom.lines, total: bom.total, hasUnpriced: bom.hasUnpriced, warnings, errors: [] }
}
