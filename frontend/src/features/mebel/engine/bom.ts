import type { BomLine, CabinetSpec, ConstructionDefaults, EdgeTotal, PriceBook, SheetEstimate } from './model'

/** materialId → the shop catalogue's price for it. */
export type CatalogPrices = Record<string, { name: string; price: number }>

export type HardwareCounts = { leg: number; confirmat: number; shelfPin: number; nail: number }

export const EMPTY_PRICE_BOOK: PriceBook = {
  materials: {},
  cutPerSheet: null,
  bandingPerMeter: { '0.4': null, '1': null, '2': null },
  hardware: { leg: null, confirmat: null, shelfPin: null, nail: null },
  markupPercent: 0,
}

/** Counts only; hole positions come in stage 3. */
export function hardwareCounts(cab: Pick<CabinetSpec, 'width' | 'height' | 'shelves'>, d: ConstructionDefaults): HardwareCounts {
  return {
    leg: cab.width > 800 ? 6 : 4,
    // bottom: 2 joints × 3, each top rail: 2 joints × 2
    confirmat: 2 * 3 + 2 * 2 * 2,
    shelfPin: 4 * cab.shelves,
    nail: d.back.kind === 'none' ? 0 : Math.ceil((2 * (cab.width + cab.height)) / 100),
  }
}

function line(
  kind: BomLine['kind'], label: string, materialId: string | null, qty: number, unit: BomLine['unit'], unitPrice: number | null,
): BomLine {
  return { kind, label, materialId, qty, unit, unitPrice, total: unitPrice == null ? null : Math.round(qty * unitPrice) }
}

/**
 * Materials, hardware and services, priced from the workshop's own price book
 * first and the shop catalogue second. A line with neither stays unpriced
 * (null) and is left out of the total rather than counted as zero.
 */
export function buildBom(input: {
  sheets: SheetEstimate[]
  edges: EdgeTotal[]
  hardware: HardwareCounts
  prices: PriceBook
  catalog: CatalogPrices
}): { lines: BomLine[]; total: number | null; hasUnpriced: boolean } {
  const { sheets, edges, hardware, prices, catalog } = input
  const priceOf = (id: string | null) => (id == null ? null : prices.materials[id] ?? catalog[id]?.price ?? null)

  const lines: BomLine[] = []
  for (const s of sheets) {
    lines.push(line(s.material, `${s.material}_${s.thickness}`, s.materialId, s.sheets, 'sheet', priceOf(s.materialId)))
  }
  for (const e of edges) {
    lines.push(line('edge', `edge_${e.thickness}x${e.width}`, e.materialId, e.metersWithWaste, 'm', priceOf(e.materialId)))
  }
  for (const key of ['leg', 'confirmat', 'shelfPin', 'nail'] as const) {
    if (hardware[key] > 0) lines.push(line('hardware', key, null, hardware[key], 'dona', prices.hardware[key]))
  }
  const sheetCount = sheets.reduce((n, s) => n + s.sheets, 0)
  if (sheetCount > 0) lines.push(line('service', 'cut', null, sheetCount, 'sheet', prices.cutPerSheet))
  const bandMeters = new Map<number, number>()
  for (const e of edges) {
    if (e.thickness > 0) bandMeters.set(e.thickness, (bandMeters.get(e.thickness) ?? 0) + e.metersWithWaste)
  }
  for (const [thickness, meters] of bandMeters) {
    const rate = prices.bandingPerMeter[String(thickness) as keyof PriceBook['bandingPerMeter']] ?? null
    lines.push(line('service', `banding_${thickness}`, null, meters, 'm', rate))
  }

  const pricedLines = lines.filter(l => l.total != null)
  const hasUnpriced = pricedLines.length < lines.length
  if (pricedLines.length === 0) return { lines, total: null, hasUnpriced }
  const subtotal = pricedLines.reduce((n, l) => n + (l.total as number), 0)
  if (prices.markupPercent > 0) {
    const markup = Math.round((subtotal * prices.markupPercent) / 100)
    lines.push({ kind: 'service', label: 'markup', materialId: null, qty: prices.markupPercent, unit: 'percent', unitPrice: subtotal, total: markup })
    return { lines, total: subtotal + markup, hasUnpriced }
  }
  return { lines, total: subtotal, hasUnpriced }
}
