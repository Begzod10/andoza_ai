import { useTranslation } from "react-i18next";
import type { EdgeTotal } from "@/features/mebel/engine";
import { formatBand, formatMm } from "./format";

export function EdgeTable({ totals, materialName }: { totals: EdgeTotal[]; materialName(id: string | null): string | null }) {
  const { t } = useTranslation();
  return (
    <table aria-label={t("mebel.tab.edges")} className="w-full text-left text-sm">
      <thead className="text-xs text-neutral-500">
        <tr>
          <th className="px-2 py-2 font-medium">{t("mebel.col.band")}</th>
          <th className="px-2 py-2 text-right font-medium">{t("mebel.col.meters")}</th>
          <th className="px-2 py-2 text-right font-medium">{t("mebel.col.with_waste")}</th>
        </tr>
      </thead>
      <tbody>
        {totals.map((e) => (
          <tr key={e.bandKey} className="border-t border-neutral-100">
            <td className="px-2 py-2">
              <span className="font-medium">{t(e.band === "visible" ? "mebel.edge_visible" : "mebel.edge_hidden")}</span>{" "}
              <span className="text-neutral-500">
                {formatBand(e.thickness)}×{e.width} {t("mebel.mm")}{materialName(e.materialId) ? ` · ${materialName(e.materialId)}` : ""}
              </span>
            </td>
            <td className="px-2 py-2 text-right tabular-nums">{formatMm(e.meters)}</td>
            <td className="px-2 py-2 text-right font-semibold tabular-nums">{e.metersWithWaste}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
