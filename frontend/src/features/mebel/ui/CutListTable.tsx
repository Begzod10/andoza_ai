import { useTranslation } from "react-i18next";
import type { CutGroup } from "@/features/mebel/engine";
import { edgesSummary, formatMm, partName } from "./format";

/**
 * The grouped cut list: one row per set of identically cut parts. `showCut`
 * switches between the size the saw cuts and the finished, banded size.
 * Clicking a row selects its first part (and the 3D view highlights it).
 */
export function CutListTable({
  groups, showCut, selectedPartId, onSelect, materialName,
}: {
  groups: CutGroup[]
  showCut: boolean
  selectedPartId: string | null
  onSelect(partId: string): void
  materialName?: (g: CutGroup) => string
}) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto">
      <table aria-label={t("mebel.tab.parts")} className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-xs text-neutral-500">
          <tr>
            <th className="px-2 py-2 font-medium">{t("mebel.col.id")}</th>
            <th className="px-2 py-2 font-medium">{t("mebel.col.part")}</th>
            <th className="px-2 py-2 font-medium">{t("mebel.col.material")}</th>
            <th className="px-2 py-2 text-right font-medium">{t("mebel.col.thickness")}</th>
            <th className="px-2 py-2 text-right font-medium">{t("mebel.col.length")}</th>
            <th className="px-2 py-2 text-right font-medium">{t("mebel.col.width")}</th>
            <th className="px-2 py-2 text-right font-medium">{t("mebel.col.qty")}</th>
            <th className="px-2 py-2 font-medium">{t("mebel.col.grain")}</th>
            <th className="px-2 py-2 font-medium">{t("mebel.col.edges")}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const size = showCut ? g.cut : g.finished;
            const selected = selectedPartId != null && g.partIds.includes(selectedPartId);
            return (
              <tr
                key={g.key}
                aria-selected={selected}
                onClick={() => onSelect(g.partIds[0])}
                className={`cursor-pointer border-t border-neutral-100 ${selected ? "bg-blue-50" : "hover:bg-neutral-50"}`}
              >
                <td className="px-2 py-2 text-xs text-neutral-500">{g.partIds.join(", ")}</td>
                <td className="px-2 py-2 font-medium text-neutral-900">{partName(g.role)}</td>
                <td className="px-2 py-2">{materialName ? materialName(g) : t(`mebel.material.${g.material}`)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{g.thickness}</td>
                <td className="px-2 py-2 text-right tabular-nums">{formatMm(size.length)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{formatMm(size.width)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{g.qty}</td>
                <td className="px-2 py-2">{t(`mebel.grain.${g.grain}`)}</td>
                <td className="px-2 py-2 tabular-nums">{edgesSummary(g.edges)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
