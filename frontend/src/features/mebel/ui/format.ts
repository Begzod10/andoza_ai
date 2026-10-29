import i18n, { type TKey } from "@/i18n";
import { formatDecimal, formatUZS } from "@/lib/utils";
import type { BomLine, EdgeSide, Part } from "@/features/mebel/engine";

/** A length in mm: whole millimetres as they are, a cut size to 0.1 mm. */
export function formatMm(n: number): string {
  return Number.isInteger(n) ? String(n) : formatDecimal(n, 1);
}

/** A band thickness: "2", "0.4" (decimal separator per language). */
export function formatBand(side: EdgeSide | number | null): string {
  const t = typeof side === "number" ? side : side?.thickness;
  if (t == null || t === 0) return "—";
  return Number.isInteger(t) ? String(t) : formatDecimal(t, 1);
}

export function edgesSummary(edges: Part["edges"]): string {
  return [edges.L1, edges.L2, edges.W1, edges.W2].map(formatBand).join(" · ");
}

export function partName(role: Part["role"]): string {
  return i18n.t(`mebel.part.${role}`);
}

/** A BOM line's label in the interface language (the engine keeps keys). */
export function bomLabel(line: BomLine, materialName: (id: string | null) => string | null): string {
  const named = materialName(line.materialId);
  if (line.kind === "board" || line.kind === "back") {
    const t = line.label.split("_")[1];
    return named ? `${named} (${t} mm)` : i18n.t(`mebel.bom.${line.kind}`, { t });
  }
  if (line.kind === "edge") {
    const [t, w] = line.label.replace("edge_", "").split("x");
    return named ?? i18n.t("mebel.bom.edge", { t: formatBand(Number(t)), w });
  }
  if (line.label === "markup") return i18n.t("mebel.bom.markup", { p: line.qty });
  if (line.label.startsWith("banding_")) return i18n.t("mebel.bom.banding", { t: formatBand(Number(line.label.slice(8))) });
  return i18n.t(`mebel.bom.${line.label}` as TKey);
}

export function formatMoney(n: number | null): string {
  return n == null ? i18n.t("mebel.unpriced") : formatUZS(n);
}
