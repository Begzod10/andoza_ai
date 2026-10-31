import type { Part } from "@/features/mebel/engine";

export type LabelFormat = "a4" | "roll";

/** What one part's sticker shows. `edges`: band thickness per side, null where unbanded. */
export interface PartLabel {
  partId: string
  role: Part["role"]
  cabinet: string
  material: string
  length: number
  width: number
  thickness: number
  grain: Part["grain"]
  edges: Record<"L1" | "L2" | "W1" | "W2", number | null>
  /** Opens the project with this part chosen: its drilling map, on the worker's phone. */
  url: string
}

/**
 * One label per part the workshop cuts, in id order. The engine lists every
 * part on its own (qty 1); MDF doors are never parts — the facade shop makes
 * them — so they get no label.
 */
export function partLabels(
  parts: Part[],
  opts: { projectId: string; origin: string; labelOf(cabinetId: string): string; materialName(p: Part): string },
): PartLabel[] {
  return [...parts]
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
    .map((p) => ({
      partId: p.id,
      role: p.role,
      cabinet: opts.labelOf(p.cabinetId),
      material: opts.materialName(p),
      length: p.finished.length,
      width: p.finished.width,
      thickness: p.thickness,
      grain: p.grain,
      edges: {
        L1: p.edges.L1?.thickness || null, L2: p.edges.L2?.thickness || null,
        W1: p.edges.W1?.thickness || null, W2: p.edges.W2?.thickness || null,
      },
      url: `${opts.origin}/mebel/${opts.projectId}?part=${encodeURIComponent(p.id)}`,
    }));
}
