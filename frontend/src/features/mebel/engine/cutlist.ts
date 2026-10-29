import { round01 } from './edges'
import type { CutGroup, EdgeBandRef, EdgeSide, EdgeTotal, Part } from './model'

const sideKey = (s: EdgeSide) => (s ? `${s.band}${s.thickness}` : '-')

/**
 * The cut list a cutting service reads: parts that are cut the same way (same
 * material, thickness, cut size, grain and banding on every side) on one line,
 * with their ids. Board before back, then thickest, longest and widest first.
 */
export function groupParts(parts: Part[]): CutGroup[] {
  const groups = new Map<string, CutGroup>()
  for (const p of parts) {
    const key = [
      p.material, p.materialId ?? '-', p.thickness, p.cut.length, p.cut.width, p.grain,
      sideKey(p.edges.L1), sideKey(p.edges.L2), sideKey(p.edges.W1), sideKey(p.edges.W2),
    ].join('|')
    const g = groups.get(key)
    if (g) {
      g.qty += p.qty
      g.partIds.push(p.id)
      if (!g.roles.includes(p.role)) g.roles.push(p.role)
    } else {
      groups.set(key, {
        key, role: p.role, roles: [p.role], material: p.material, materialId: p.materialId, thickness: p.thickness,
        cut: { ...p.cut }, finished: { ...p.finished }, grain: p.grain, edges: p.edges, qty: p.qty, partIds: [p.id],
      })
    }
  }
  return [...groups.values()].sort((a, b) =>
    (a.material === b.material ? 0 : a.material === 'board' ? -1 : 1)
    || b.thickness - a.thickness
    || b.cut.length - a.cut.length
    || b.cut.width - a.cut.width)
}

/**
 * Metres of each edge band: every banded side's finished length plus the
 * overhang trimmed off its ends, then rounded up to whole metres with the
 * roll waste. A pre-milled part still uses band, so it counts too.
 */
export function edgeTotals(
  parts: Part[],
  bandOf: (p: Part, side: NonNullable<EdgeSide>) => EdgeBandRef,
  d: { edgeAllowance: number; edgeWaste: number },
): EdgeTotal[] {
  const totals = new Map<string, { ref: EdgeBandRef; band: 'visible' | 'hidden'; mm: number }>()
  for (const p of parts) {
    for (const [name, side] of Object.entries(p.edges) as [keyof Part['edges'], EdgeSide][]) {
      if (!side) continue
      const ref = bandOf(p, side)
      const key = `${ref.materialId ?? '-'}|${ref.thickness}|${ref.width}`
      const along = name.startsWith('L') ? p.finished.length : p.finished.width
      const t = totals.get(key) ?? { ref, band: side.band, mm: 0 }
      t.mm += (along + d.edgeAllowance) * p.qty
      totals.set(key, t)
    }
  }
  return [...totals.entries()].map(([bandKey, { ref, band, mm }]) => {
    const meters = round01(mm / 1000)
    return {
      bandKey, band, thickness: ref.thickness, width: ref.width, materialId: ref.materialId,
      meters, metersWithWaste: Math.ceil(meters * (1 + d.edgeWaste)),
    }
  })
}
