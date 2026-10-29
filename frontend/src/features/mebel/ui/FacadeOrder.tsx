import { useTranslation } from "react-i18next";
import type { FacadeOrderLine } from "@/features/mebel/engine";
import { formatDecimal } from "@/lib/utils";

const area = (l: FacadeOrderLine) => (l.length * l.width * l.qty) / 1e6;

/** The MDF doors to order from a facade shop: per cabinet, size, count and area. */
export function FacadeOrder({
  lines, labelOf, materialName,
}: { lines: FacadeOrderLine[]; labelOf(cabinetId: string): string; materialName(id: string | null): string | null }) {
  const { t } = useTranslation();
  const total = lines.reduce((n, l) => n + area(l), 0);
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-bold text-neutral-900">{t("mebel.facade_order")}</h3>
      <p className="text-xs text-neutral-500">{t("mebel.drill.mdf_hinge_note")}</p>
      <table aria-label={t("mebel.facade_order")} className="w-full text-left text-sm">
        <thead className="text-xs text-neutral-500">
          <tr>
            <th className="px-2 py-2 font-medium">{t("mebel.cabinets")}</th>
            <th className="px-2 py-2 text-right font-medium">{t("mebel.col.length")}</th>
            <th className="px-2 py-2 text-right font-medium">{t("mebel.col.width")}</th>
            <th className="px-2 py-2 text-right font-medium">{t("mebel.col.qty")}</th>
            <th className="px-2 py-2 font-medium">{t("mebel.col.material")}</th>
            <th className="px-2 py-2 text-right font-medium">{t("mebel.unit.m2")}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-t border-neutral-100">
              <td className="px-2 py-2 font-medium">{labelOf(l.cabinetId)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{l.length}</td>
              <td className="px-2 py-2 text-right tabular-nums">{l.width}</td>
              <td className="px-2 py-2 text-right tabular-nums">{l.qty}</td>
              <td className="px-2 py-2">{materialName(l.materialId) ?? t("mebel.bom.facade_mdf")}</td>
              <td className="px-2 py-2 text-right tabular-nums">{formatDecimal(area(l), 3)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-neutral-200">
            <td colSpan={6} className="px-2 py-2 text-right font-bold">{t("mebel.facade_total", { m2: formatDecimal(total, 3) })}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
