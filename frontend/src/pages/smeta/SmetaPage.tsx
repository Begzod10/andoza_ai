import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createEstimate, previewEstimate, getEstimatePDF, getRoom } from "@/lib/api";
import { formatUZS, formatUSDFromUZS } from "@/lib/utils";
import { groupEstimateLines, groupKeyFor, type GroupKey } from "@/lib/smetaGroups";
import { uz } from "@/locale/uz";
import type { EstimateResponse } from "@/lib/api";
import { SmetaAskDrawer } from "@/components/smeta/SmetaAskDrawer";
import { CategorySection } from "@/components/smeta/CategorySection";
import { CostBreakdown } from "@/components/smeta/CostBreakdown";
import { StudioTabStrip } from "@/components/studio/StudioTabStrip";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** The server's own (Uzbek) message from an error, when the failed request carried one. */
function errorDetail(err: unknown): string | null {
  const raw = err instanceof Error ? err.message : "";
  try {
    const detail = JSON.parse(raw)?.detail;
    return typeof detail === "string" ? detail : null;
  } catch {
    return null;
  }
}

export default function SmetaPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [highlightedLines, setHighlightedLines] = useState<Set<string>>(new Set());
  const [currency, setCurrency] = useState<"UZS" | "USD">("UZS");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");
  // Groups the reader has folded away; everything starts open, so the whole bill is there to read.
  const [folded, setFolded] = useState<Set<GroupKey>>(new Set());
  // Whether the estimate on screen was repriced with real shop prices, and what that lookup found.
  const [marketMode, setMarketMode] = useState(false);
  const [marketNote, setMarketNote] = useState<string | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);

  // Format a so'm amount in whichever currency the user picked — every price
  // in this page routes through this so the toggle stays in sync everywhere.
  function fmt(soum: number): string {
    return currency === "USD" && estimate
      ? formatUSDFromUZS(soum, estimate.usd_rate)
      : formatUZS(soum);
  }

  const groups = useMemo(() => groupEstimateLines(estimate?.lines ?? []), [estimate]);

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
    onSuccess: (data) => {
      setEstimate(data);
      setMarketMode(false);
      setMarketNote(null);
      setMarketError(null);
    },
  });

  // Reprice with real shop prices (server: Gemini + Google Search, cached, limited per day). Only offered
  // when the server says it can; a failure keeps the catalog estimate on screen.
  const marketMutation = useMutation({
    mutationFn: () => previewEstimate(roomId!, { market: true }),
    onMutate: () => setMarketError(null),
    onSuccess: (data) => {
      setEstimate(data);
      const updated = data.market_updated ?? 0;
      setMarketMode(updated > 0);
      setMarketNote(updated > 0 ? `${updated} ${uz.smeta.bozor_yangilandi}` : uz.smeta.bozor_topilmadi);
    },
    onError: (err) => setMarketError(errorDetail(err) ?? uz.smeta.bozor_xato),
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

  // Bring the first line the AI helper pointed at into view once it is on screen.
  useEffect(() => {
    if (highlightedLines.size === 0) return;
    const first = [...highlightedLines][0];
    document.querySelector(`[data-line-index="${first}"]`)?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [highlightedLines]);

  async function handlePDF() {
    if (!roomId) return;
    setPdfLoading(true);
    try {
      const blob = await (marketMode ? getEstimatePDF(roomId, { market: true }) : getEstimatePDF(roomId));
      downloadBlob(blob, `smeta-${roomId}.pdf`);
    } catch {
      alert(uz.errors.pdf_xato);
    } finally {
      setPdfLoading(false);
    }
  }

  function handleHighlight(lineIds: string[]) {
    // A line inside a folded group would be highlighted where nobody can see it: open those groups.
    const needed = new Set<GroupKey>();
    for (const id of lineIds) {
      const line = estimate?.lines[Number(id)];
      if (line) needed.add(groupKeyFor(line.category));
    }
    if (needed.size > 0) setFolded((prev) => new Set([...prev].filter((key) => !needed.has(key))));
    setHighlightedLines(new Set(lineIds));
    setTimeout(() => setHighlightedLines(new Set()), 8000);
  }

  function toggleGroup(key: GroupKey) {
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const allFolded = groups.length > 0 && groups.every((g) => folded.has(g.key));

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
        {/* Stories-style tab navigation — Smeta is a regular scrolling page
            (a top-level route outside StudioPage's layout), so the strip
            renders as a normal-flow row here instead of a viewport overlay. */}
        {roomId && <StudioTabStrip roomId={roomId} variant="inline" />}

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
          <div className="space-y-5">
            {/* The total, with everything that qualifies it, in one card: the figure
                (total_uzs is the FULL expected spend, exact + approximate lines combined),
                the range around it, how much of it is a guess, and where it goes. */}
            <section className="rounded-3xl bg-surface p-5 shadow-subtle sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{uz.smeta.jami}</p>
                  <p className="mt-1 text-3xl font-extrabold tabular-nums text-brand sm:text-4xl">
                    {fmt(estimate.total_uzs)}
                  </p>
                  {/* Full-opacity brand is 7.4:1 on white; the /70 it replaced was 3.65:1. */}
                  <p className="mt-1 text-sm text-brand">
                    {uz.smeta.diapazon}: {fmt(estimate.total_min)} – {fmt(estimate.total_max)}
                  </p>
                  {estimate.total_approx_uzs > 0 && (
                    <p className="mt-0.5 text-sm text-orange-cta">
                      {uz.smeta.shundan_taxminiy}: ~{fmt(estimate.total_approx_uzs)}
                    </p>
                  )}
                </div>

                {/* Currency toggle */}
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <div className="inline-flex rounded-full bg-neutral-100 p-0.5 text-xs font-semibold">
                    {(["UZS", "USD"] as const).map((c) => (
                      <button
                        key={c}
                        onClick={() => setCurrency(c)}
                        aria-pressed={currency === c}
                        className={`rounded-full px-3 py-1.5 transition-colors ${
                          currency === c ? "bg-brand text-white shadow-sm" : "text-muted hover:text-neutral-900"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-on-app-muted">1$ = {formatUZS(estimate.usd_rate)}</span>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-neutral-50 px-4 py-3">
                  <p className="text-xs text-muted">{uz.smeta.minimal}</p>
                  <p className="mt-0.5 font-bold tabular-nums text-neutral-900">{fmt(estimate.total_min)}</p>
                </div>
                <div className="rounded-xl bg-neutral-50 px-4 py-3">
                  <p className="text-xs text-muted">{uz.smeta.maksimal}</p>
                  <p className="mt-0.5 font-bold tabular-nums text-neutral-900">{fmt(estimate.total_max)}</p>
                </div>
                <div className="col-span-2 rounded-xl bg-neutral-50 px-4 py-3 sm:col-span-1">
                  <p className="text-xs text-muted">{uz.smeta.elektr_ishlari}</p>
                  <p className="mt-0.5 font-bold text-neutral-900">
                    {estimate.has_electrical
                      ? estimate.electrical_confirmed
                        ? "Ha"
                        : "Ha (taxminiy)"
                      : "Yo'q"}
                  </p>
                </div>
              </div>

              {groups.length > 0 && (
                <div className="mt-5 border-t border-neutral-100 pt-5">
                  <CostBreakdown groups={groups} fmt={fmt} />
                </div>
              )}
            </section>

            {marketNote && (
              <div
                className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3 text-sm ${
                  marketMode ? "bg-emerald-50 text-emerald-800" : "bg-neutral-100 text-neutral-700"
                }`}
              >
                <span>{marketNote}</span>
                {marketMode && (
                  <button
                    type="button"
                    onClick={() => mutation.mutate()}
                    className="text-xs font-semibold underline"
                  >
                    {uz.smeta.bozor_qaytish}
                  </button>
                )}
              </div>
            )}
            {marketError && <p className="text-sm text-red-600">{marketError}</p>}

            {/* Line items, by group */}
            {groups.length > 0 && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setFolded(allFolded ? new Set() : new Set(groups.map((g) => g.key)))}
                    className="text-xs font-semibold text-brand hover:underline"
                  >
                    {allFolded ? uz.smeta.hammasini_yoyish : uz.smeta.hammasini_yigish}
                  </button>
                </div>
                {groups.map((group) => (
                  <CategorySection
                    key={group.key}
                    group={group}
                    open={!folded.has(group.key)}
                    onToggle={() => toggleGroup(group.key)}
                    fmt={fmt}
                    highlighted={highlightedLines}
                  />
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handlePDF}
                disabled={pdfLoading}
                className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {pdfLoading ? uz.common.yuklanmoqda : uz.smeta.pdf_yuklab}
              </button>
              <button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                className="flex items-center gap-2 border-2 border-neutral-300 px-5 py-2.5 rounded-full text-sm font-semibold hover:border-brand transition-colors disabled:opacity-60"
              >
                {uz.smeta.qayta_hisoblash}
              </button>
              {estimate.market_prices_available && (
                <button
                  onClick={() => marketMutation.mutate()}
                  disabled={marketMutation.isPending}
                  className="flex items-center gap-2 border-2 border-emerald-700 text-emerald-800 px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-emerald-50 transition-colors disabled:opacity-60"
                >
                  {marketMutation.isPending ? uz.smeta.bozor_qidirilmoqda : uz.smeta.bozor_yangilash}
                </button>
              )}
              {/* Only this button persists an Estimate row — opening the
                  page or hitting "Qayta hisoblash" is preview-only. */}
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="flex items-center gap-2 border-2 border-brand text-brand px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-brand/10 transition-colors disabled:opacity-60"
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
                className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/>
                </svg>
                {uz.ai.smeta_sarlavha}
              </button>
              <Link
                to="/ustalar"
                className="flex items-center gap-2 bg-emerald-700 text-white px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-emerald-800 transition-colors"
              >
                {uz.ustalar.usta_chaqirish}
              </Link>
            </div>

            <p className="text-xs text-on-app-muted">
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
