import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { NestResult } from "@/features/mebel/engine";
import { SheetDrawing } from "./SheetDrawing";

/** The cutting layout: per board, its sheets drawn to scale, and the parts that fit none. */
export function NestingPanel({
  nesting, trim, selectedPartId, onSelect, materialName,
}: {
  nesting: NestResult[]
  trim: number
  selectedPartId: string | null
  onSelect(partId: string): void
  materialName(id: string | null): string | null
}) {
  const { t } = useTranslation();
  const [showCuts, setShowCuts] = useState(false);
  if (nesting.length === 0) return <p className="text-sm text-neutral-500">{t("mebel.nest.empty")}</p>;
  return (
    <div className="flex flex-col gap-5">
      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input type="checkbox" checked={showCuts} onChange={(e) => setShowCuts(e.target.checked)} />
        {t("mebel.nest.show_cuts")}
      </label>
      {nesting.map((n) => {
        const name = materialName(n.materialId) ?? t(`mebel.material.${n.material}`);
        return (
          <section key={`${n.material}|${n.materialId}|${n.thickness}`} className="flex flex-col gap-3">
            <h3 className="text-sm font-bold text-neutral-900">
              {t("mebel.nest.summary", { name, t: n.thickness, n: n.sheets.length, p: Math.round(n.utilization * 100) })}
            </h3>
            {n.unplaced.length > 0 && (
              <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                <p className="font-semibold">{t("mebel.nest.unplaced_title")}</p>
                <ul>
                  {n.unplaced.map((id) => <li key={id}>{`${id} — ${t("mebel.nest.unplaced_reason")}`}</li>)}
                </ul>
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              {n.sheets.map((s, i) => {
                const label = t("mebel.nest.sheet_label", { i: i + 1, n: n.sheets.length, p: Math.round(s.utilization * 100) });
                return (
                  <figure key={i} className="rounded-2xl border border-neutral-200 p-2">
                    <figcaption className="mb-1 text-xs text-neutral-500">{label}</figcaption>
                    <SheetDrawing sheet={n.sheet} material={n.material} nested={s} trim={trim} showCuts={showCuts}
                      selectedPartId={selectedPartId} onSelect={onSelect} label={`${name} ${n.thickness} — ${label}`} />
                  </figure>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
