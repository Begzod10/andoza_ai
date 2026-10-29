import { useTranslation } from "react-i18next";
import type { Result } from "@/features/mebel/engine";
import { CutListTable } from "@/features/mebel/ui/CutListTable";
import { EdgeTable } from "@/features/mebel/ui/EdgeTable";
import { BomPanel } from "@/features/mebel/ui/BomPanel";
import { SheetDrawing } from "@/features/mebel/ui/SheetDrawing";
import { FacadeOrder } from "@/features/mebel/ui/FacadeOrder";
import { PartDrawing } from "@/features/mebel/ui/PartDrawing";
import { HoleTable } from "@/features/mebel/ui/HoleTable";
import { AssemblyDrawing } from "@/features/mebel/ui/AssemblyDrawing";
import { partName } from "@/features/mebel/ui/format";

/** The printout is landscape: a sheet is wider than tall. */
const PRINT_PAGE_CSS = "@page { size: A4 landscape; margin: 10mm }";

/**
 * What the PDF holds: the browser's print dialog saves this as a PDF. Hidden
 * on screen, the only thing shown when printing (the page hides the rest).
 */
export function PrintView({
  name, result, snapshot, trim, materialName, labelOf = (id: string) => id, cabinets = [],
}: {
  name: string
  result: Result
  /** The 3D view as an image, taken just before printing. */
  snapshot: string | null
  /** The sheet edge trim, drawn on each sheet. */
  trim: number
  materialName(id: string | null): string | null
  /** A cabinet's label (M1) for the door order. */
  labelOf?: (cabinetId: string) => string
  /** For the assembly drawings, one per cabinet. */
  cabinets?: { id: string; label: string }[]
}) {
  const { t } = useTranslation();
  return (
    <div data-testid="mebel-print" aria-hidden="true" className="hidden flex-col gap-6 p-6 text-black print:flex">
      <style>{PRINT_PAGE_CSS}</style>
      <h1 className="text-xl font-bold">{t("mebel.print_title", { name })}</h1>
      {snapshot && <img src={snapshot} alt="" className="max-h-[80mm] self-start" />}
      <CutListTable groups={result.groups} showCut selectedPartId={null} onSelect={() => {}}
        materialName={(g) => materialName(g.materialId) ?? t(`mebel.material.${g.material}`)} />
      <EdgeTable totals={result.edgeTotals} materialName={materialName} />
      <BomPanel bom={result.bom} total={result.total} hasUnpriced={result.hasUnpriced} nesting={result.nesting}
        materialName={materialName} />

      {result.facadeOrder.length > 0 && (
        <FacadeOrder lines={result.facadeOrder} labelOf={labelOf} materialName={materialName} />
      )}

      {/* One page per sheet, for the saw: the drawing, its parts and the cuts in order. */}
      {result.nesting.flatMap((n) => {
        const board = materialName(n.materialId) ?? t(`mebel.material.${n.material}`);
        return n.sheets.map((s, i) => {
          const label = t("mebel.nest.sheet_label", { i: i + 1, n: n.sheets.length, p: Math.round(s.utilization * 100) });
          return (
            <section key={`${n.material}|${n.materialId}|${n.thickness}|${i}`} data-testid="print-sheet"
              style={{ breakBefore: "page" }} className="flex flex-col gap-3">
              <h2 className="text-lg font-bold">{`${board} ${n.thickness} ${t("mebel.mm")} — ${label}`}</h2>
              <SheetDrawing sheet={n.sheet} material={n.material} nested={s} trim={trim} showCuts print
                selectedPartId={null} onSelect={() => {}} label={label} />
              <div className="flex gap-8 text-sm">
                <table aria-label={t("mebel.nest.parts_on_sheet")} className="border-collapse">
                  <thead>
                    <tr>
                      <th className="border border-black px-2 py-1 text-left">{t("mebel.col.id")}</th>
                      <th className="border border-black px-2 py-1 text-right">{t("mebel.col.length")} × {t("mebel.col.width")}</th>
                      <th className="border border-black px-2 py-1">⟳</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.placements.map((p) => (
                      <tr key={p.partId}>
                        <td className="border border-black px-2 py-1">{p.partId}</td>
                        <td className="border border-black px-2 py-1 text-right tabular-nums">{`${p.length}×${p.width}`}</td>
                        <td className="border border-black px-2 py-1 text-center">{p.rotated ? "⟳" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div>
                  <p className="font-bold">{t("mebel.nest.cut_order")}</p>
                  <ol className="columns-2 gap-6">
                    {s.cuts.map((c) => (
                      <li key={c.order} className="tabular-nums">
                        {t("mebel.nest.cut_line", {
                          n: c.order, dir: t(`mebel.nest.dir_${c.direction}`),
                          len: Math.round(Math.abs(c.x2 - c.x1) + Math.abs(c.y2 - c.y1)), off: c.offset,
                        })}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </section>
          );
        });
      })}
      {/* Drilling: a page per drilled part, then each cabinet's assembly drawing. */}
      {result.parts.filter((p) => (p.holes ?? []).length > 0).map((p) => (
        <section key={p.id} data-testid="print-part" style={{ breakBefore: "page" }} className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">{`${p.id} — ${partName(p.role)}`}</h2>
          <PartDrawing part={p} print />
          <HoleTable part={p} print />
        </section>
      ))}
      {cabinets.map((c) => (
        <section key={c.id} data-testid="print-assembly" style={{ breakBefore: "page" }}>
          <AssemblyDrawing label={c.label} parts={result.parts.filter((p) => p.cabinetId === c.id)} />
        </section>
      ))}
    </div>
  );
}
