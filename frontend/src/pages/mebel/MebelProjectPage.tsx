import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import type { TKey } from "@/i18n";
import { Link, useParams } from "react-router-dom";
import { useMebelProject } from "@/features/mebel/useMebelProject";
import { ParamsPanel } from "@/features/mebel/ui/ParamsPanel";
import { CutListTable } from "@/features/mebel/ui/CutListTable";
import { EdgeTable } from "@/features/mebel/ui/EdgeTable";
import { BomPanel } from "@/features/mebel/ui/BomPanel";
import { WarningsList } from "@/features/mebel/ui/WarningsList";
import { PriceBookDialog } from "@/features/mebel/ui/PriceBookDialog";
import { CabinetView } from "@/features/mebel/three/CabinetView";
import { NestingPanel } from "@/features/mebel/ui/NestingPanel";
import { cutListCsv, downloadCsv } from "@/features/mebel/export/csv";
import { PrintView } from "@/features/mebel/export/PrintView";
import { groupName } from "@/features/mebel/ui/format";
import { ERROR_FIELD } from "@/features/mebel/ui/ParamsPanel";

type Tab = "parts" | "nesting" | "edges" | "bom" | "warnings";
const TABS: Tab[] = ["parts", "nesting", "edges", "bom", "warnings"];

/** /mebel/:id — one cabinet project: parameters, 3D, cut list, banding, price. */
export default function MebelProjectPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const m = useMebelProject(id);
  const [tab, setTab] = useState<Tab>("parts");
  const [showCut, setShowCut] = useState(true);
  const [priceBookOpen, setPriceBookOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const viewRef = useRef<HTMLDivElement>(null);

  if (m.isError) {
    return (
      <div className="p-6 text-sm text-red-700">
        {t("mebel.load_failed")} <Link to="/mebel" className="underline">{t("mebel.back_to_list")}</Link>
      </div>
    );
  }
  if (!m.project || !m.result) return <div className="m-6 h-40 animate-pulse rounded-2xl bg-neutral-100" />;

  const { project, result } = m;
  const materialName = (mid: string | null) => (mid ? m.catalog[mid]?.name ?? null : null);
  const labelOf = (cabId?: string) => project.cabinets.find((c) => c.id === cabId)?.label ?? null;
  const used = [
    project.defaults.board.materialId, project.defaults.back.materialId ?? null,
    project.defaults.edge.visible.materialId, project.defaults.edge.hidden.materialId,
  ].filter((x): x is string => !!x);
  const failed = result.errors.length > 0;

  const exportCsv = () =>
    downloadCsv(project.name, cutListCsv(result.groups, {
      part: (g) => groupName(g),
      material: (g) => materialName(g.materialId) ?? t(`mebel.material.${g.material}`),
      grain: (gr) => (gr === "none" ? "" : t(`mebel.grain.${gr}`)),
    }));
  const exportPdf = () => {
    // The 3D picture goes into the printout; the canvas keeps its buffer for this.
    const canvas = viewRef.current?.querySelector("canvas");
    let image: string | null = null;
    try { image = canvas?.toDataURL("image/png") ?? null; } catch { image = null; }
    flushSync(() => setSnapshot(image));
    window.print();
  };

  return (
    <>
    <div className="flex min-h-screen flex-col bg-neutral-50 print:hidden">
      <header className="flex flex-wrap items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3">
        <Link to="/mebel" className="text-sm font-semibold text-blue-700">← {t("mebel.back_to_list")}</Link>
        <h1 className="min-w-0 flex-1 truncate text-base font-bold text-neutral-900">{project.name}</h1>
        <span className={`text-xs ${m.saveState === "error" || m.saveState === "invalid" ? "text-red-600" : "text-neutral-500"}`} role="status">
          {t(({ saving: "mebel.saving", error: "mebel.save_failed", invalid: "mebel.not_saved_invalid", saved: "mebel.saved" } as const)[m.saveState])}
        </span>
        <button type="button" onClick={() => setPriceBookOpen(true)}
          className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-200">
          {t("mebel.price_book")}
        </button>
        <button type="button" onClick={exportCsv} disabled={failed}
          className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-200 disabled:opacity-50">
          {t("mebel.export_csv")}
        </button>
        <button type="button" onClick={exportPdf} disabled={failed}
          className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          {t("mebel.export_pdf")}
        </button>
      </header>

      <div className="grid flex-1 gap-4 p-4 lg:grid-cols-[340px_1fr]">
        <aside className="rounded-2xl bg-white p-4 shadow-sm lg:max-h-[calc(100vh-88px)] lg:overflow-y-auto">
          <ParamsPanel project={project} update={m.setProject} errors={result.errors} catalog={m.options} />
        </aside>

        <main className="flex min-w-0 flex-col gap-4">
          <div ref={viewRef} className="h-[38vh] min-h-[240px] overflow-hidden rounded-2xl bg-white shadow-sm" aria-label={t("mebel.view3d")}>
            <CabinetView parts={result.parts} selectedPartId={m.selectedPartId} onSelect={m.setSelectedPartId} />
          </div>

          <section className="rounded-2xl bg-white p-4 shadow-sm">
            {failed ? (
              <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                <p className="font-semibold">{t("mebel.errors_title")}</p>
                {result.errors.filter((e) => !e.cabinetId || !ERROR_FIELD[e.code]).map((e) => (
                  <p key={`${e.code}|${e.cabinetId ?? ""}`}>{t(`mebel.error.${e.code}` as TKey, e.params)}</p>
                ))}
              </div>
            ) : (
              <>
                <div role="tablist" className="mb-3 flex gap-1 overflow-x-auto">
                  {TABS.map((k) => (
                    <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${tab === k ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>
                      {t(`mebel.tab.${k}`)}{k === "warnings" && result.warnings.length > 0 ? ` (${result.warnings.length})` : ""}
                    </button>
                  ))}
                </div>
                {tab === "parts" && (
                  <>
                    <div className="mb-2 flex gap-1">
                      <button type="button" aria-pressed={showCut} onClick={() => setShowCut(true)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${showCut ? "bg-blue-50 text-blue-700" : "text-neutral-500"}`}>
                        {t("mebel.show_cut")}
                      </button>
                      <button type="button" aria-pressed={!showCut} onClick={() => setShowCut(false)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${!showCut ? "bg-blue-50 text-blue-700" : "text-neutral-500"}`}>
                        {t("mebel.show_finished")}
                      </button>
                    </div>
                    <CutListTable groups={result.groups} showCut={showCut} selectedPartId={m.selectedPartId}
                      onSelect={m.setSelectedPartId}
                      materialName={(g) => materialName(g.materialId) ?? t(`mebel.material.${g.material}`)} />
                  </>
                )}
                {tab === "nesting" && (
                  <NestingPanel nesting={result.nesting} trim={project.defaults.trim ?? 10} selectedPartId={m.selectedPartId}
                    onSelect={m.setSelectedPartId} materialName={materialName} />
                )}
                {tab === "edges" && <EdgeTable totals={result.edgeTotals} materialName={materialName} />}
                {tab === "bom" && (
                  <BomPanel bom={result.bom} total={result.total} hasUnpriced={result.hasUnpriced}
                    nesting={result.nesting} materialName={materialName} />
                )}
                {tab === "warnings" && <WarningsList warnings={result.warnings} labelOf={labelOf} />}
              </>
            )}
          </section>
        </main>
      </div>

      <PriceBookDialog open={priceBookOpen} onOpenChange={setPriceBookOpen} priceBook={m.priceBook} ready={m.priceBookReady}
        usedMaterials={used} catalog={m.catalog} />
    </div>
    {!failed && <PrintView name={project.name} result={result} snapshot={snapshot} materialName={materialName} />}
    </>
  );
}
