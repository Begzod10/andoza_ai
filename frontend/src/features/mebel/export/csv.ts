import type { CutGroup, EdgeSide } from "@/features/mebel/engine";

/** The column names cutting services know; kept in Uzbek whatever the interface language. */
const HEADER = ["ID", "Detal", "Material", "Qalinlik", "Uzunlik", "Eni", "Soni", "Tekstura", "Kromka L1", "Kromka L2", "Kromka W1", "Kromka W2"];

/** Excel in ru/uz reads a decimal comma. */
export const num = (n: number) => String(n).replace(".", ",");
const band = (s: EdgeSide) => (s && s.thickness > 0 ? num(s.thickness) : "");
// A cell starting like a formula would run in Excel: a shop-entered name must stay text.
const safe = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
export const cell = (raw: string) => {
  const v = safe(raw);
  return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

/**
 * The cut list as the CSV a cutting service imports: `;`-separated, CRLF
 * lines, a UTF-8 byte-order mark so Excel shows Cyrillic, cut sizes with a
 * decimal comma and each side's band thickness (blank: no band).
 */
export function cutListCsv(
  groups: CutGroup[],
  labels: { part(g: CutGroup): string; material(g: CutGroup): string; grain(g: CutGroup["grain"]): string },
): string {
  const rows = groups.map((g) => [
    g.partIds.join(", "), labels.part(g), labels.material(g), num(g.thickness),
    num(g.cut.length), num(g.cut.width), String(g.qty), labels.grain(g.grain),
    band(g.edges.L1), band(g.edges.L2), band(g.edges.W1), band(g.edges.W2),
  ]);
  return "﻿" + [HEADER, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
}

export function downloadCsv(name: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[\\/:*?"<>|]+/g, "_") || "cut-list"}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
