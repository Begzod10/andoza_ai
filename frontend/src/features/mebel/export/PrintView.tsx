import { useTranslation } from "react-i18next";
import type { Result } from "@/features/mebel/engine";
import { CutListTable } from "@/features/mebel/ui/CutListTable";
import { EdgeTable } from "@/features/mebel/ui/EdgeTable";
import { BomPanel } from "@/features/mebel/ui/BomPanel";

/**
 * What the PDF holds: the browser's print dialog saves this as a PDF. Hidden
 * on screen, the only thing shown when printing (the page hides the rest).
 */
export function PrintView({
  name, result, snapshot, materialName,
}: {
  name: string
  result: Result
  /** The 3D view as an image, taken just before printing. */
  snapshot: string | null
  materialName(id: string | null): string | null
}) {
  const { t } = useTranslation();
  return (
    <div data-testid="mebel-print" aria-hidden="true" className="hidden flex-col gap-6 p-6 text-black print:flex">
      <h1 className="text-xl font-bold">{t("mebel.print_title", { name })}</h1>
      {snapshot && <img src={snapshot} alt="" className="max-h-[80mm] self-start" />}
      <CutListTable groups={result.groups} showCut selectedPartId={null} onSelect={() => {}}
        materialName={(g) => materialName(g.materialId) ?? t(`mebel.material.${g.material}`)} />
      <EdgeTable totals={result.edgeTotals} materialName={materialName} />
      <BomPanel bom={result.bom} total={result.total} hasUnpriced={result.hasUnpriced} sheets={result.sheets}
        materialName={materialName} />
    </div>
  );
}
