import type { CatalogPrices } from './bom'
import type { FurnitureProject, Warning } from './model'

/** A sheet's thickness from its catalogue name: the smallest of a size like
 *  "16x2070x2800" or "2800Х2070Х3мм"; null when the name gives no size. */
export function sheetThickness(name: string): number | null {
  const m = name.match(/(\d+(?:[.,]\d+)?)\s*[xхXХ×*]\s*(\d+(?:[.,]\d+)?)\s*[xхXХ×*]\s*(\d+(?:[.,]\d+)?)/)
  if (!m) return null
  const t = Math.min(...m.slice(1, 4).map((v) => Number(v.replace(',', '.'))))
  return t < 50 ? t : null
}

/** A chosen catalogue sheet whose thickness is not the one set for it: the parts
 *  are worked out for one board and priced for another. */
export function thicknessWarnings(p: FurnitureProject, catalog: CatalogPrices): Warning[] {
  const d = p.defaults
  const checks: [string, string | null | undefined, number][] = [
    ['thickness_board', d.board.materialId, d.board.thickness],
    ['thickness_back', d.back.kind === 'none' ? null : d.back.materialId, d.back.thickness],
    ['thickness_facade', d.facade?.kind === 'ldsp' ? d.facade.materialId : null, d.facade?.thickness ?? 0],
  ]
  const warnings: Warning[] = []
  for (const [code, id, expected] of checks) {
    const name = id ? catalog[id]?.name : undefined
    const actual = name ? sheetThickness(name) : null
    if (actual != null && actual !== expected) warnings.push({ code, params: { expected, actual } })
  }
  return warnings
}
