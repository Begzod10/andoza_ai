import { useTranslation } from "react-i18next";
import type { BomLine, NestResult } from "@/features/mebel/engine";
import { bomLabel, formatMoney } from "./format";

/** Materials, hardware and services with their price; a line nobody priced
 *  says "unpriced" and stays out of the total. */
export function BomPanel({
  bom, total, hasUnpriced, nesting, materialName,
}: {
  bom: BomLine[]
  total: number | null
  hasUnpriced: boolean
  nesting: NestResult[]
  materialName(id: string | null): string | null
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-2 text-xs text-neutral-600">
        {nesting.map((n) => (
          <li key={`${n.material}|${n.materialId}|${n.thickness}`} className="rounded-full bg-neutral-100 px-3 py-1">
            {materialName(n.materialId) ?? t(`mebel.material.${n.material}`)} {n.thickness} {t("mebel.mm")}:{" "}
            {t("mebel.nest.sheets_used", { n: n.sheets.length, p: Math.round(n.utilization * 100) })}
          </li>
        ))}
      </ul>
      <table aria-label={t("mebel.tab.bom")} className="w-full text-left text-sm">
        <thead className="text-xs text-neutral-500">
          <tr>
            <th className="px-2 py-2 font-medium">{t("mebel.col.material")}</th>
            <th className="px-2 py-2 text-right font-medium">{t("mebel.col.qty")}</th>
            <th className="px-2 py-2 text-right font-medium">{t("mebel.col.unit_price")}</th>
            <th className="px-2 py-2 text-right font-medium">{t("mebel.col.total")}</th>
          </tr>
        </thead>
        <tbody>
          {bom.map((l) => (
            <tr key={`${l.kind}|${l.label}|${l.materialId}`} className="border-t border-neutral-100">
              <td className="px-2 py-2">{bomLabel(l, materialName)}</td>
              <td className="px-2 py-2 text-right tabular-nums">
                {l.qty} {t(`mebel.unit.${l.unit}`)}
              </td>
              <td className={`px-2 py-2 text-right tabular-nums ${l.unitPrice == null ? "text-amber-700" : ""}`}>
                {l.unit === "percent" ? "" : formatMoney(l.unitPrice)}
              </td>
              <td className={`px-2 py-2 text-right font-medium tabular-nums ${l.total == null ? "text-amber-700" : ""}`}>
                {formatMoney(l.total)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-neutral-200">
            <td className="px-2 py-3 font-bold" colSpan={3}>{t(hasUnpriced ? "mebel.total_unpriced" : "mebel.total")}</td>
            <td className="px-2 py-3 text-right font-bold tabular-nums">{formatMoney(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
