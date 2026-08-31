import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createEstimate, previewEstimate, getEstimatePDF, getRoom } from "@/lib/api";
import { formatUZS, formatUSDFromUZS } from "@/lib/utils";
import { uz } from "@/locale/uz";
import type { EstimateResponse } from "@/lib/api";
import { SmetaAskDrawer } from "@/components/smeta/SmetaAskDrawer";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SmetaPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [highlightedLines, setHighlightedLines] = useState<Set<string>>(new Set());
  const [currency, setCurrency] = useState<"UZS" | "USD">("UZS");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");

  // Format a so'm amount in whichever currency the user picked — every price
  // in this page routes through this so the toggle stays in sync everywhere.
  function fmt(soum: number): string {
    return currency === "USD" && estimate
      ? formatUSDFromUZS(soum, estimate.usd_rate)
      : formatUZS(soum);
  }

  const { data: room } = useQuery({
    queryKey: ["room", roomId],
    queryFn: () => getRoom(roomId!),
    enabled: !!roomId,
  });

  // Live preview — hits the transient /estimate/preview route, which
  // computes but never persists. Used for the initial auto-calc and for
  // "Qayta hisoblash", so simply opening this page (or recalculating a few
  // times while comparing materials) no longer writes an Estimate row each
  // time and pollutes the room's estimate history.
  const mutation = useMutation({
    mutationFn: () => previewEstimate(roomId!),
    onSuccess: (data) => setEstimate(data),
  });

  // Explicit save — the only path that persists a snapshot. A separate
  // mutation (not reusing `mutation`) so its pending/success state doesn't
  // fight with the preview button's.
  const saveMutation = useMutation({
    mutationFn: () => createEstimate(roomId!),
    onSuccess: (data) => {
      setEstimate(data);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    },
  });

  // Calculate the moment the page opens — no reason to make the user hit
  // "Hisoblash" themselves first. Guarded per-room so it fires exactly once
  // per visit (StrictMode's double-invoke included) rather than double-firing.
  const autoFiredForRoomRef = useRef<string | null>(null);
  useEffect(() => {
    if (!roomId || autoFiredForRoomRef.current === roomId) return;
    autoFiredForRoomRef.current = roomId;
    mutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  async function handlePDF() {
    if (!roomId) return;
    setPdfLoading(true);
    try {
      const blob = await getEstimatePDF(roomId);
      downloadBlob(blob, `smeta-${roomId}.pdf`);
    } catch {
      alert(uz.errors.pdf_xato);
    } finally {
      setPdfLoading(false);
    }
  }

  function handleHighlight(lineIds: string[]) {
    setHighlightedLines(new Set(lineIds));
    setTimeout(() => setHighlightedLines(new Set()), 8000);
  }

  return (
    <div className="min-h-screen bg-paper">
      {/* Header */}
      <header className="bg-surface shadow-subtle">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link
            to={`/studio/${roomId}`}
            className="text-muted hover:text-neutral-900 text-sm"
          >
            ← {uz.common.orqaga}
          </Link>
          <h1 className="text-xl font-bold text-neutral-900">{uz.smeta.sarlavha}</h1>
          {room && (
            <span className="ml-auto text-sm text-muted">
              {room.name} · {room.area} m²
            </span>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Auto-calculates on open (see the effect above) — this only shows
            while that first request is in flight, or as a retry on error. */}
        {!estimate && (
          <div className="text-center py-12">
            {mutation.isPending ? (
              <p className="text-muted animate-pulse">{uz.common.yuklanmoqda}</p>
            ) : (
              <>
                <p className="text-muted mb-6">{uz.empty.smeta_yoq}</p>
                <button
                  onClick={() => mutation.mutate()}
                  className="bg-brand text-white px-8 py-3 rounded-lg font-semibold hover:bg-brand/90 transition-colors"
                >
                  {uz.smeta.hisoblash}
                </button>
              </>
            )}
            {mutation.isError && (
              <p className="mt-4 text-red-600 text-sm">{uz.errors.smeta_xato}</p>
            )}
          </div>
        )}

        {/* Estimate display */}
        {estimate && (
          <div className="space-y-6">
            {/* Currency toggle */}
            <div className="flex items-center justify-end gap-2">
              <span className="text-xs text-muted">
                1$ = {formatUZS(estimate.usd_rate)}
              </span>
              <div className="inline-flex rounded-lg border border-neutral-200 overflow-hidden text-xs font-semibold">
                {(["UZS", "USD"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setCurrency(c)}
                    className={`px-3 py-1.5 transition-colors ${
                      currency === c
                        ? "bg-brand text-white"
                        : "bg-surface text-muted hover:text-neutral-900"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="bg-surface rounded-lg p-4 shadow-subtle">
                <p className="text-xs text-muted mb-1">Minimal narx</p>
                <p className="text-lg font-bold text-neutral-900">
                  {fmt(estimate.total_min)}
                </p>
              </div>
              <div className="bg-surface rounded-lg p-4 shadow-subtle">
                <p className="text-xs text-muted mb-1">Maksimal narx</p>
                <p className="text-lg font-bold text-neutral-900">
                  {fmt(estimate.total_max)}
                </p>
              </div>
              <div className="bg-surface rounded-lg p-4 shadow-subtle col-span-2 sm:col-span-1">
                <p className="text-xs text-muted mb-1">Elektr ishlari</p>
                <p className="text-lg font-bold text-neutral-900">
                  {estimate.has_electrical
                    ? estimate.electrical_confirmed
                      ? "Ha"
                      : "Ha (taxminiy)"
                    : "Yo'q"}
                </p>
              </div>
            </div>

            {/* Total — total_uzs is the FULL expected spend (exact +
                approximate lines combined); the range and the note below
                make clear how much of it is a firm number vs. a guess. */}
            <div className="bg-brand/10 border-2 border-brand rounded-lg p-5 space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-lg font-semibold text-brand">{uz.smeta.jami}</p>
                <p className="text-2xl font-extrabold text-brand">
                  {fmt(estimate.total_uzs)}
                </p>
              </div>
              <p className="text-xs text-brand/70 text-right">
                {uz.smeta.diapazon}: {fmt(estimate.total_min)} – {fmt(estimate.total_max)}
              </p>
              {estimate.total_approx_uzs > 0 && (
                <p className="text-xs text-warning text-right">
                  {uz.smeta.shundan_taxminiy}: ~{fmt(estimate.total_approx_uzs)}
                </p>
              )}
            </div>

            {/* Line items */}
            <div className="bg-surface rounded-lg shadow-subtle overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-200">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">
                        Ish / material
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">
                        Formula
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">
                        {uz.smeta.miqdori}
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">
                        {uz.smeta.birlik}
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">
                        {uz.smeta.narxi}
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">
                        {uz.smeta.summa}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {estimate.lines.map((line, idx) => (
                      <tr
                        key={idx}
                        className={[
                          "border-b border-neutral-100 transition-colors",
                          highlightedLines.has(String(idx))
                            ? "bg-yellow-50 ring-1 ring-yellow-300"
                            : "hover:bg-neutral-50",
                        ].join(" ")}
                      >
                        <td className="px-4 py-3 font-medium text-neutral-900">
                          {line.label}
                          {line.is_approximate && (
                            <span className="ml-2 text-xs text-warning">~taxminiy</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted max-w-[200px] truncate">
                          {line.formula}
                        </td>
                        <td className="px-4 py-3 text-right text-neutral-700">
                          {line.quantity.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-muted">{line.unit}</td>
                        <td className="px-4 py-3 text-right text-neutral-700">
                          {fmt(line.unit_price)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-neutral-900">
                          {fmt(line.total_uzs)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handlePDF}
                disabled={pdfLoading}
                className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {pdfLoading ? uz.common.yuklanmoqda : uz.smeta.pdf_yuklab}
              </button>
              <button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                className="flex items-center gap-2 border-2 border-neutral-300 px-5 py-2.5 rounded-lg text-sm font-semibold hover:border-brand transition-colors disabled:opacity-60"
              >
                {uz.smeta.qayta_hisoblash}
              </button>
              {/* Only this button persists an Estimate row — opening the
                  page or hitting "Qayta hisoblash" is preview-only. */}
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="flex items-center gap-2 border-2 border-brand text-brand px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-brand/10 transition-colors disabled:opacity-60"
              >
                {saveMutation.isPending
                  ? uz.common.yuklanmoqda
                  : saveStatus === "saved"
                    ? uz.smeta.saqlandi
                    : uz.smeta.saqlash}
              </button>
              {/* AI ask button — only shown when estimate is available */}
              <button
                onClick={() => setAskOpen(true)}
                className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/>
                </svg>
                {uz.ai.smeta_sarlavha}
              </button>
              <Link
                to="/ustalar"
                className="flex items-center gap-2 bg-success text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-success/90 transition-colors"
              >
                {uz.ustalar.usta_chaqirish}
              </Link>
            </div>

            <p className="text-xs text-muted">
              Hisoblab chiqildi:{" "}
              {new Date(estimate.created_at).toLocaleString("uz-UZ")}
            </p>
          </div>
        )}
      </main>

      {roomId && (
        <SmetaAskDrawer
          open={askOpen}
          onOpenChange={setAskOpen}
          roomId={roomId}
          onHighlight={handleHighlight}
        />
      )}
    </div>
  );
}
