import { cutSize } from '../edges'
import type { CabinetSpec, ConstructionDefaults, EdgeSide, Part } from '../model'

/** An MDF door ordered from a facade shop: one line per cabinet. */
export type FacadeOrderLine = { id: string; cabinetId: string; length: number; width: number; qty: number; materialId: string | null }

/** Doors on a cabinet: as set, or two on one wider than 600 mm. */
export function doorCount(cab: Pick<CabinetSpec, 'width' | 'doors'>): number {
  return cab.doors ?? (cab.width > 600 ? 2 : 1)
}

/** Overlay doors covering the front, `gap` between them and round the edge. */
function doorSize(cab: CabinetSpec, d: ConstructionDefaults, n: number) {
  return { length: cab.height - d.facade.gap, width: Math.floor(cab.width / n - d.facade.gap) }
}

/** LDSP doors as parts, numbered after the cabinet's box parts. */
export function doorParts(cab: CabinetSpec, d: ConstructionDefaults, firstIndex: number): Part[] {
  const n = doorCount(cab)
  if (d.facade.kind !== 'ldsp' || n === 0) return []
  const size = doorSize(cab, d, n)
  const band: EdgeSide = d.edge.visible.thickness > 0 ? { band: 'visible', thickness: d.edge.visible.thickness } : null
  const edges = { L1: band, L2: band, W1: band, W2: band }
  const slot = cab.width / n
  const z1 = cab.position.z + cab.depth
  const y1 = d.facade.gap / 2
  return Array.from({ length: n }, (_, i) => {
    const x1 = cab.position.x + i * slot + (slot - size.width) / 2
    return {
      id: `${cab.label}-${String(firstIndex + i + 1).padStart(2, '0')}`,
      cabinetId: cab.id,
      role: 'door' as const,
      material: 'facade' as const,
      materialId: d.facade.materialId,
      thickness: d.facade.thickness,
      finished: { ...size },
      cut: cutSize(size, edges, d.edge.premilled),
      grain: 'length' as const,
      edges,
      qty: 1,
      placement: {
        x: x1 + size.width / 2, y: y1 + size.length / 2, z: z1 + d.facade.thickness / 2,
        sx: size.width, sy: size.length, sz: d.facade.thickness,
      },
    }
  })
}

/** MDF doors: what to order from the facade shop. */
export function facadeOrderLines(cab: CabinetSpec, d: ConstructionDefaults): FacadeOrderLine[] {
  const n = doorCount(cab)
  if (d.facade.kind !== 'mdf' || n === 0) return []
  const size = doorSize(cab, d, n)
  return [{ id: `${cab.label}-F1`, cabinetId: cab.id, ...size, qty: n, materialId: d.facade.materialId }]
}
