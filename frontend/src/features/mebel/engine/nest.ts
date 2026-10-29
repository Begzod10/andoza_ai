import type { CutGroup, NestCut, NestedSheet, NestPlacement, NestRect, NestResult } from './model'

/**
 * The cutting layout: each board's parts on as few sheets as a panel saw can
 * cut. Every placement splits the free rectangle it lands in by straight
 * cuts that run its whole length (guillotine), so the layout can be sawn.
 * Sixteen orderings and rules are tried and the best kept: fewest sheets,
 * then the emptiest last sheet (it leaves the biggest offcut). Deterministic.
 */

const MIN_OFFCUT = 200

interface Item { partId: string; length: number; width: number; canRotate: boolean; index: number }
interface Sheet { free: NestRect[]; placements: NestPlacement[]; cuts: NestCut[]; area: number }
type Order = (a: Item, b: Item) => number
type Fit = 'baf' | 'bssf'
type Split = 'sas' | 'las'

const ORDERS: Order[] = [
  (a, b) => b.length * b.width - a.length * a.width,
  (a, b) => Math.max(b.length, b.width) - Math.max(a.length, a.width),
  (a, b) => b.width - a.width,
  (a, b) => b.length + b.width - (a.length + a.width),
]
const FITS: Fit[] = ['baf', 'bssf']
const SPLITS: Split[] = ['sas', 'las']

function score(r: NestRect, l: number, w: number, fit: Fit): [number, number] {
  const dl = r.length - l
  const dw = r.width - w
  return fit === 'baf'
    ? [r.length * r.width - l * w, Math.min(dl, dw)]
    : [Math.min(dl, dw), Math.max(dl, dw)]
}

/** The best free rectangle on one sheet for an item, either way round if it may turn. */
function bestSpot(sheet: Sheet, item: Item, fit: Fit) {
  let best: { rect: number; l: number; w: number; rotated: boolean; s: [number, number] } | null = null
  const ways = item.canRotate && item.length !== item.width
    ? [[item.length, item.width, false], [item.width, item.length, true]] as const
    : [[item.length, item.width, false]] as const
  sheet.free.forEach((r, i) => {
    for (const [l, w, rotated] of ways) {
      if (l > r.length || w > r.width) continue
      const s = score(r, l, w, fit)
      if (!best || s[0] < best.s[0] || (s[0] === best.s[0] && s[1] < best.s[1])) best = { rect: i, l, w, rotated, s }
    }
  })
  return best as { rect: number; l: number; w: number; rotated: boolean } | null
}

function place(sheet: Sheet, item: Item, spot: { rect: number; l: number; w: number; rotated: boolean }, split: Split, kerf: number) {
  const r = sheet.free[spot.rect]
  const { l, w } = spot
  sheet.free.splice(spot.rect, 1)
  sheet.placements.push({ partId: item.partId, x: r.x, y: r.y, length: l, width: w, rotated: spot.rotated })
  sheet.area += l * w
  const restL = r.length - l - kerf
  const restW = r.width - w - kerf
  // Which full-length cut comes first: across the rectangle (horizontal) or along it.
  const horizontal = split === 'sas' ? r.length - l < r.width - w : r.length - l >= r.width - w
  const along = (y: number, x1: number, x2: number) =>
    sheet.cuts.push({ x1, y1: y, x2, y2: y, order: sheet.cuts.length + 1, direction: 'along', offset: w })
  const across = (x: number, y1: number, y2: number) =>
    sheet.cuts.push({ x1: x, y1, x2: x, y2, order: sheet.cuts.length + 1, direction: 'across', offset: l })
  // A part short of its rectangle's edge is cut there even when the strip left over is
  // no wider than the kerf (it turns to dust); only a strip wider than that is kept.
  const roomL = r.length - l > 0
  const roomW = r.width - w > 0
  if (horizontal) {
    if (roomW) along(r.y + w, r.x, r.x + r.length)
    if (restW > 0) sheet.free.push({ x: r.x, y: r.y + w + kerf, length: r.length, width: restW })
    if (roomL) across(r.x + l, r.y, r.y + w)
    if (restL > 0) sheet.free.push({ x: r.x + l + kerf, y: r.y, length: restL, width: w })
  } else {
    if (roomL) across(r.x + l, r.y, r.y + r.width)
    if (restL > 0) sheet.free.push({ x: r.x + l + kerf, y: r.y, length: restL, width: r.width })
    if (roomW) along(r.y + w, r.x, r.x + l)
    if (restW > 0) sheet.free.push({ x: r.x, y: r.y + w + kerf, length: l, width: restW })
  }
}

function packOnce(items: Item[], sheet: { length: number; width: number }, kerf: number, trim: number, fit: Fit, split: Split) {
  const work: NestRect = { x: trim, y: trim, length: sheet.length - 2 * trim, width: sheet.width - 2 * trim }
  const sheets: Sheet[] = []
  const unplaced: Item[] = []
  for (const item of items) {
    let done = false
    for (const s of sheets) {
      const spot = bestSpot(s, item, fit)
      if (spot) { place(s, item, spot, split, kerf); done = true; break }
    }
    if (done) continue
    const fresh: Sheet = { free: work.length > 0 && work.width > 0 ? [{ ...work }] : [], placements: [], cuts: [], area: 0 }
    const spot = bestSpot(fresh, item, fit)
    if (!spot) { unplaced.push(item); continue }
    place(fresh, item, spot, split, kerf)
    sheets.push(fresh)
  }
  return { sheets, unplaced }
}

export function nestSheets(
  groups: CutGroup[],
  sheet: { length: number; width: number },
  opts: { kerf: number; trim: number },
): NestResult[] {
  const boards = new Map<string, { head: CutGroup; items: Item[] }>()
  for (const g of groups) {
    const key = `${g.material}|${g.materialId ?? '-'}|${g.thickness}`
    const b = boards.get(key) ?? { head: g, items: [] }
    for (const partId of g.partIds) {
      b.items.push({ partId, length: g.cut.length, width: g.cut.width, canRotate: g.grain === 'none', index: b.items.length })
    }
    boards.set(key, b)
  }
  const sheetArea = sheet.length * sheet.width
  return [...boards.values()].map(({ head, items }) => {
    let best: ReturnType<typeof packOnce> | null = null
    // Every attempt also runs with turning off: turning a plain part can only be offered,
    // never cost a sheet.
    const upright = items.map((i) => ({ ...i, canRotate: false }))
    for (const pool of items.some((i) => i.canRotate) ? [items, upright] : [items])
    for (const order of ORDERS) {
      const sorted = [...pool].sort((a, b) => order(a, b) || a.index - b.index)
      for (const fit of FITS) {
        for (const split of SPLITS) {
          const run = packOnce(sorted, sheet, opts.kerf, opts.trim, fit, split)
          if (!best || run.sheets.length < best.sheets.length
            || (run.sheets.length === best.sheets.length && run.sheets.length > 0
              && run.sheets[run.sheets.length - 1].area < best.sheets[best.sheets.length - 1].area)) {
            best = run
          }
        }
      }
    }
    const run = best ?? { sheets: [], unplaced: [] }
    const used = run.sheets.reduce((n, s) => n + s.area, 0)
    const sheets: NestedSheet[] = run.sheets.map((s) => ({
      placements: s.placements,
      cuts: s.cuts,
      offcuts: s.free.filter((r) => r.length >= MIN_OFFCUT && r.width >= MIN_OFFCUT),
      utilization: s.area / sheetArea,
    }))
    return {
      material: head.material,
      materialId: head.materialId,
      thickness: head.thickness,
      sheet: { ...sheet },
      sheets,
      utilization: sheets.length ? used / (sheets.length * sheetArea) : 0,
      unplaced: run.unplaced.map((i) => i.partId),
    }
  })
}
