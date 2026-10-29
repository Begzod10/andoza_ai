import type { FacadeOrderLine } from "@/features/mebel/engine";
import { cell, num } from "./csv";

/** The column names a facade shop reads; kept in Uzbek whatever the interface language. */
const HEADER = ["Shkaf", "Uzunlik", "Eni", "Soni", "Material", "m²"];

/** MDF doors to order, as CSV: one line per cabinet, the same format rules as the cut list. */
export function facadeOrderCsv(
  lines: FacadeOrderLine[],
  labels: { cabinet(id: string): string; material(id: string | null): string },
): string {
  const rows = lines.map((l) => [
    labels.cabinet(l.cabinetId), String(l.length), String(l.width), String(l.qty), labels.material(l.materialId),
    num(Math.round((l.length * l.width * l.qty) / 1000) / 1000),
  ]);
  return "\uFEFF" + [HEADER, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
}
