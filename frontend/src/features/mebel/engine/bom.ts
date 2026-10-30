import { doorCount, type FacadeOrderLine } from './rules/doors'
import { drawerCount } from './rules/drawers'
import type { BomLine, CabinetSpec, ConstructionDefaults, EdgeTotal, NestResult, PriceBook } from './model'

/** materialId → the shop catalogue's price for it. */
export type CatalogPrices = Record<string, { name: string; price: number }>

export type HardwareCounts = { leg: number; confirmat: number; shelfPin: number; nail: number; hinge: number; handle: number; hanger: number }
export const HARDWARE_KEYS = ['leg', 'confirmat', 'shelfPin', 'nail', 'hinge', 'handle', 'hanger'] as const

export const EMPTY_PRICE_BOOK: PriceBook = {
  materials: {},
  cutPerSheet: null,
  bandingPerMeter: { '0.4': null, '1': null, '2': null },
  hardware: { leg: null, confirmat: null, shelfPin: null, nail: null, hinge: null, handle: null, hanger: null },
  markupPercent: 0,
  sheets: { board16: null, board18: null, back: null, mdfM2: null },
}

/** Counts only; hole positions come in stage 3. */
export function hardwareCounts(
  cab: Pick<CabinetSpec, 'width' | 'height' | 'shelves' | 'doors'> & { type?: CabinetSpec['type'] },
  d: ConstructionDefaults,
): HardwareCounts {
  const type = cab.type ?? 'base'
  const drawers = drawerCount({ type, drawers: (cab as CabinetSpec).drawers })
  const doors = drawers > 0 ? 0 : d.facade && d.facade.kind !== 'none' ? doorCount(cab) : 0
  const hingesPerDoor = cab.height <= 900 ? 2 : cab.height <= 1600 ? 3 : 4
  return {
    // a wall cabinet hangs; the others stand on legs
    leg: type === 'wall' ? 0 : cab.width > 800 ? 6 : 4,
    // base: bottom 2 joints × 3 + each top rail 2 joints × 2; wall/tall: bottom and top panel 2 joints × 3
    // a drawer box: front and back, two at each end
    confirmat: (type === 'base' ? 2 * 3 + 2 * 2 * 2 : 2 * 2 * 3) + 4 * drawers,
    hinge: doors * hingesPerDoor,
    handle: doors + (d.facade && d.facade.kind !== 'none' ? drawers : 0),
    hanger: type === 'wall' ? 2 : 0,
    shelfPin: drawers > 0 ? 0 : 4 * cab.shelves,
    // only a nailed back is nailed; a grooved one sits in its grooves
    nail: d.back.kind === 'hdf_nailed' ? Math.ceil((2 * (cab.width + cab.height)) / 100) : 0,
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
  nesting: NestResult[]
  facadeOrder?: FacadeOrderLine[]
  slides?: { length: number; pairs: number }[]
  edges: EdgeTotal[]
  hardware: HardwareCounts
  prices: PriceBook
  catalog: CatalogPrices
}): { lines: BomLine[]; total: number | null; hasUnpriced: boolean } {
  const { nesting, edges, hardware, prices, catalog, facadeOrder = [], slides = [] } = input
  const priceOf = (id: string | null) => (id == null ? null : prices.materials[id] ?? catalog[id]?.price ?? null)
  const sheets = prices.sheets
  const sheetPrice = (n: NestResult) =>
    n.material === 'back' ? sheets?.back ?? null
      : n.thickness === 16 ? sheets?.board16 ?? null
        : n.thickness === 18 ? sheets?.board18 ?? null : null

  const lines: BomLine[] = []
  // Whole sheets, as the nesting lays them out.
  for (const n of nesting) {
    lines.push(line(n.material, `${n.material}_${n.thickness}`, n.materialId, n.sheets.length, 'sheet', priceOf(n.materialId) ?? sheetPrice(n)))
  }
  // MDF doors: the facade shop prices them by the square metre.
  const mdf = new Map<string | null, number>()
  for (const f of facadeOrder) mdf.set(f.materialId, (mdf.get(f.materialId) ?? 0) + f.length * f.width * f.qty)
  for (const [id, mm2] of mdf) {
    // A catalogue MDF item is a whole sheet, priced per sheet: a finished door's price
    // per m² comes only from the workshop's price book.
    const perM2 = (id == null ? null : prices.materials[id] ?? null) ?? sheets?.mdfM2 ?? null
    lines.push(line('facade', 'facade_mdf', id, Math.round(mm2 / 1000) / 1000, 'm2', perM2))
  }
  for (const e of edges) {
    lines.push(line('edge', `edge_${e.thickness}x${e.width}`, e.materialId, e.metersWithWaste, 'm', priceOf(e.materialId)))
  }
  for (const key of HARDWARE_KEYS) {
    if (hardware[key] > 0) lines.push(line('hardware', key, null, hardware[key], 'dona', prices.hardware[key]))
  }
  // Slide pairs, by length.
  const byLength = new Map<number, number>()
  for (const s of slides) byLength.set(s.length, (byLength.get(s.length) ?? 0) + s.pairs)
  for (const [length, pairs] of [...byLength].sort((a, b) => b[0] - a[0])) {
    lines.push(line('hardware', `slide_${length}`, null, pairs, 'dona', prices.hardware.slide ?? null))
  }
  const sheetCount = nesting.reduce((n, x) => n + x.sheets.length, 0)
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
