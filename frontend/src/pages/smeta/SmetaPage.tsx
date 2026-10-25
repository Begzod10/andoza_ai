import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createEstimate, previewEstimate, getEstimatePDF, getRoom } from "@/lib/api";
import { intlLocale } from "@/i18n";
import { formatUZS, formatUSDFromUZS } from "@/lib/utils";
import { groupEstimateLines, groupKeyFor, totalsFor, type GroupKey } from "@/lib/smetaGroups";
import { useTranslation } from "react-i18next";
import type { EstimateResponse } from "@/lib/api";
import { SmetaAskDrawer } from "@/components/smeta/SmetaAskDrawer";
import { CategorySection } from "@/components/smeta/CategorySection";
import { CostBreakdown } from "@/components/smeta/CostBreakdown";
import { StudioTabStrip } from "@/components/studio/StudioTabStrip";
import { useCompactStudio } from "@/lib/compactStudio";
import { useAppThemeAttribute } from "@/hooks/useAppThemeAttribute";

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

/** The quiet buttons under the two main ones: all alike, readable, and clearly enabled. */
const secondaryButton =
  "inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-brand-light hover:text-accent disabled:opacity-60";

/** The floor type is chosen in the studio (by hand, by the AI designer or a ready-made
 *  style) but no shop product for it. The estimate prices it from the median shop product
 *  when there is one ("stand_in": the price is approximate) and otherwise leaves it out
 *  ("left_out"); either way the page says so rather than show a total that looks settled.
 *  A bare concrete floor has nothing to buy. */
type FloorNote = "left_out" | "stand_in" | null

const FLOOR_LINE_CATEGORIES = new Set(["laminat", "parket", "plitka"])

function floorNote(
  room: { surfaces?: Record<string, unknown> | null; state?: Record<string, unknown> | null } | undefined,
  lines: EstimateResponse["lines"] | undefined,
): FloorNote {
  const design = (room?.state as { designState?: { floorType?: string | null; floorConfigured?: boolean } } | null)?.designState;
  if (!design?.floorConfigured || !design.floorType || design.floorType === "concrete" || room?.surfaces?.floor) return null;
  return (lines ?? []).some((l) => FLOOR_LINE_CATEGORIES.has(l.category ?? "")) ? "stand_in" : "left_out";
}

export default function SmetaPage() {
  const { t } = useTranslation()
  // Opened by direct link, outside AppShell — apply the theme here too.
  useAppThemeAttribute();
  const { roomId } = useParams<{ roomId: string }>();
  const compact = useCompactStudio();
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const { toast } = useToast();
  const [askOpen, setAskOpen] = useState(false);
  const [highlightedLines, setHighlightedLines] = useState<Set<string>>(new Set());
  const [currency, setCurrency] = useState<"UZS" | "USD">("UZS");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
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

  // Furniture is a purchase, not renovation work, and one sofa can be half the bill: the reader may
  // leave it out of the headline figure. Everything else on the page follows the same choice.
  const [includeFurniture, setIncludeFurniture] = useState(true);
  const exclude = useMemo<ReadonlySet<GroupKey>>(
    () => (includeFurniture ? new Set() : new Set<GroupKey>(["jihoz"])),
    [includeFurniture],
  );
  const furnitureTotal = useMemo(
    () => (estimate?.lines ?? []).filter((l) => groupKeyFor(l.category) === "jihoz").reduce((sum, l) => sum + l.total_uzs, 0),
    [estimate],
  );
  const hasFurniture = furnitureTotal > 0;
  const groups = useMemo(() => groupEstimateLines(estimate?.lines ?? [], exclude), [estimate, exclude]);
  // The server's own figures when everything counts; recomputed with its formula when a group is left out.
  const view = useMemo(
    () =>
      !estimate
        ? null
        : includeFurniture
          ? { total: estimate.total_uzs, min: estimate.total_min, max: estimate.total_max, approx: estimate.total_approx_uzs }
          : totalsFor(estimate.lines, exclude),
    [estimate, includeFurniture, exclude],
  );

  // A slim total that appears once the big one has scrolled out of sight.
  const heroRef = useRef<HTMLElement | null>(null);
  const [heroVisible, setHeroVisible] = useState(true);
  useEffect(() => {
    const el = heroRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setHeroVisible(entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, [estimate]);

  const { data: room } = useQuery({
    queryKey: ["room", roomId],
    queryFn: () => getRoom(roomId!),
    enabled: !!roomId,
  });
  const floorNoteKind = floorNote(room, estimate?.lines);

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
      setMarketNote(updated > 0 ? t("smeta.bozor_yangilandi", { count: updated }) : t("smeta.bozor_topilmadi"));
    },
    onError: (err) => setMarketError(errorDetail(err) ?? t("smeta.bozor_xato")),
  });

  // Explicit save — the only path that persists a snapshot. A separate
  // mutation (not reusing `mutation`) so its pending/success state doesn't
  // fight with the preview button's.
  const saveMutation = useMutation({
    mutationFn: () => createEstimate(roomId!),
    onMutate: () => setSaveError(null),
    onError: (err) => setSaveError(errorDetail(err) ?? t("smeta.saqlanmadi")),
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
      toast({ variant: 'error', title: t("errors.pdf_xato") });
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
      {estimate && view && !heroVisible && (
        <div className="fixed inset-x-0 top-0 z-30 border-b border-line bg-card/95 shadow-panel backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("smeta.jami")}</span>
            <span className="text-lg font-extrabold tabular-nums text-accent">{fmt(view.total)}</span>
            <button
              type="button"
              onClick={() => window.scrollTo?.({ top: 0, behavior: "smooth" })}
              aria-label={t("smeta.tepaga")}
              className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink hover:border-brand-light hover:text-accent"
            >
              ↑
            </button>
          </div>
        </div>
      )}

      {/* Header. Not on a small screen (the native app or a phone browser, see
          lib/compactStudio): there the 3D/Smeta strip below already names the
          page and leads back, and the screen is better spent on the smeta. */}
      {!compact && (
      <header className="border-b border-line bg-card">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link
            to={`/studio/${roomId}`}
            className="text-ink-muted hover:text-ink text-sm"
          >
            ← {t("common.orqaga")}
          </Link>
          <h1 className="text-xl font-bold text-ink">{t("smeta.sarlavha")}</h1>
          {room && (
            <span className="ml-auto text-sm text-ink-muted">
              {room.name}
              {room.floor_area != null && ` · ${Math.round(room.floor_area * 10) / 10} m²`}
            </span>
          )}
        </div>
      </header>
      )}

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Stories-style tab navigation — Smeta is a regular scrolling page
            (a top-level route outside StudioPage's layout), so the strip
            renders as a normal-flow row here instead of a viewport overlay. */}
        {roomId && <StudioTabStrip roomId={roomId} variant="inline" />}

        {floorNoteKind && (
          <div
            role="status"
            aria-label={floorNoteKind === "stand_in" ? t("smeta.floor_stand_in_aria") : t("smeta.floor_left_out_aria")}
            className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-ink"
          >
            {floorNoteKind === "stand_in"
              ? t("smeta.floor_stand_in")
              : t("smeta.floor_left_out")}{" "}
            <Link to={`/studio/${roomId}/ichkarida?phase=pol`} className="font-semibold text-accent hover:underline">
              {t("smeta.floor_pick")}
            </Link>
          </div>
        )}

        {/* Auto-calculates on open (see the effect above) — this only shows
            while that first request is in flight, or as a retry on error. */}
        {!estimate && (
          <div className="text-center py-12">
            {mutation.isPending ? (
              <p className="text-ink-muted animate-pulse">{t("common.yuklanmoqda")}</p>
            ) : (
              <>
                <p className="text-ink-muted mb-6">{t("empty.smeta_yoq")}</p>
                <button
                  onClick={() => mutation.mutate()}
                  className="bg-gradient-to-br from-[#5B84F5] to-[#2F55D4] text-white shadow-glow px-8 py-3 rounded-full font-semibold transition-all hover:-translate-y-px"
                >
                  {t("smeta.hisoblash")}
                </button>
              </>
            )}
            {mutation.isError && (
              <p className="mt-4 text-red-600 text-sm">{t("errors.smeta_xato")}</p>
            )}
          </div>
        )}

        {/* Estimate display */}
        {estimate && (
          <div className="space-y-5">
            {/* The total, with everything that qualifies it, in one card: the figure
                (total_uzs is the FULL expected spend, exact + approximate lines combined),
                the range around it, how much of it is a guess, and where it goes. */}
            <section ref={heroRef} className="rounded-3xl border border-line bg-card p-5 shadow-panel sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("smeta.jami")}</p>
                  <p className="mt-1 text-3xl font-extrabold tabular-nums text-accent sm:text-4xl">
                    {fmt(view!.total)}
                  </p>
                  {/* Full-opacity brand is 7.4:1 on white; the /70 it replaced was 3.65:1. */}
                  <p className="mt-1 text-sm text-accent">
                    {t("smeta.diapazon")}: {fmt(view!.min)} – {fmt(view!.max)}
                  </p>
                  {view!.approx > 0 && (
                    <p className="mt-0.5 text-sm text-orange-500">
                      {t("smeta.shundan_taxminiy")}: ~{fmt(view!.approx)}
                    </p>
                  )}
                </div>

                {/* Currency toggle */}
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <div className="inline-flex rounded-full bg-card-soft p-0.5 text-xs font-semibold">
                    {(["UZS", "USD"] as const).map((c) => (
                      <button
                        key={c}
                        onClick={() => setCurrency(c)}
                        aria-pressed={currency === c}
                        className={`rounded-full px-3 py-1.5 transition-colors ${
                          currency === c ? "bg-gradient-to-br from-[#5B84F5] to-[#2F55D4] text-white shadow-glow" : "text-ink-muted hover:text-ink"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-on-app-muted">1$ = {formatUZS(estimate.usd_rate)}</span>
                </div>
              </div>

              {hasFurniture && (
                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <div className="inline-flex rounded-full bg-card-soft p-0.5 text-xs font-semibold">
                    {([true, false] as const).map((on) => (
                      <button
                        key={String(on)}
                        type="button"
                        onClick={() => setIncludeFurniture(on)}
                        aria-pressed={includeFurniture === on}
                        className={`rounded-full px-3 py-1.5 transition-colors ${
                          includeFurniture === on ? "bg-gradient-to-br from-[#5B84F5] to-[#2F55D4] text-white shadow-glow" : "text-ink-muted hover:text-ink"
                        }`}
                      >
                        {on ? t("smeta.mebel_bilan") : t("smeta.faqat_tamir")}
                      </button>
                    ))}
                  </div>
                  {!includeFurniture && (
                    <span className="text-xs text-ink-muted">
                      {t("smeta.mebel_kirmagan")}: {fmt(furnitureTotal)}
                    </span>
                  )}
                </div>
              )}

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-card-soft px-4 py-3">
                  <p className="text-xs text-ink-muted">{t("smeta.minimal")}</p>
                  <p className="mt-0.5 font-bold tabular-nums text-ink">{fmt(view!.min)}</p>
                </div>
                <div className="rounded-2xl bg-card-soft px-4 py-3">
                  <p className="text-xs text-ink-muted">{t("smeta.maksimal")}</p>
                  <p className="mt-0.5 font-bold tabular-nums text-ink">{fmt(view!.max)}</p>
                </div>
                <div className="col-span-2 rounded-2xl bg-card-soft px-4 py-3 sm:col-span-1">
                  <p className="text-xs text-ink-muted">{t("smeta.elektr_ishlari")}</p>
                  <p className="mt-0.5 font-bold text-ink">
                    {estimate.has_electrical
                      ? estimate.electrical_confirmed
                        ? t("smeta.ha")
                        : t("smeta.ha_taxminiy")
                      : t("smeta.yoq")}
                  </p>
                </div>
              </div>

              {groups.length > 0 && (
                <div className="mt-5 border-t border-line pt-5">
                  <CostBreakdown groups={groups} fmt={fmt} />
                </div>
              )}
            </section>

            {marketNote && (
              <div
                className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3 text-sm ${
                  marketMode ? "bg-emerald-500/15 text-emerald-500" : "bg-card-soft text-ink"
                }`}
              >
                <span>{marketNote}</span>
                {marketMode && (
                  <button
                    type="button"
                    onClick={() => mutation.mutate()}
                    className="text-xs font-semibold underline"
                  >
                    {t("smeta.bozor_qaytish")}
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
                    className="text-xs font-semibold text-accent hover:underline"
                  >
                    {allFolded ? t("smeta.hammasini_yoyish") : t("smeta.hammasini_yigish")}
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

            {/* One main action (the file), one to keep the figures, and the rest quieter. */}
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handlePDF}
                  disabled={pdfLoading}
                  className="flex items-center gap-2 bg-gradient-to-br from-[#5B84F5] to-[#2F55D4] text-white shadow-glow px-6 py-2.5 rounded-full text-sm font-semibold transition-all hover:-translate-y-px disabled:opacity-60"
                >
                  {pdfLoading ? t("common.yuklanmoqda") : t("smeta.pdf_yuklab")}
                </button>
                {/* Only this button persists an Estimate row — opening the
                    page or hitting "Qayta hisoblash" is preview-only. */}
                <button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  className="flex items-center gap-2 border-2 border-brand-light text-accent px-6 py-2.5 rounded-full text-sm font-semibold hover:bg-brand-light/10 transition-colors disabled:opacity-60"
                >
                  {saveMutation.isPending
                    ? t("common.yuklanmoqda")
                    : saveStatus === "saved"
                      ? t("smeta.saqlandi")
                      : t("smeta.saqlash")}
                </button>
              </div>
              {saveError && <p role="alert" className="text-sm text-red-600">{saveError}</p>}
              <div className="flex flex-wrap gap-2">
                <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className={secondaryButton}>
                  {t("smeta.qayta_hisoblash")}
                </button>
                {estimate.market_prices_available && (
                  <button onClick={() => marketMutation.mutate()} disabled={marketMutation.isPending} className={secondaryButton}>
                    {marketMutation.isPending ? t("smeta.bozor_qidirilmoqda") : t("smeta.bozor_yangilash")}
                  </button>
                )}
                <button onClick={() => setAskOpen(true)} className={secondaryButton}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/>
                  </svg>
                  {t("ai.smeta_sarlavha")}
                </button>
                <Link to={`/ustalar?room=${roomId}`} className={secondaryButton}>
                  {t("ustalar.usta_chaqirish")}
                </Link>
              </div>
            </div>

            <p className="text-xs text-on-app-muted">
              {t("smeta.hisoblangan", { when: new Date(estimate.created_at).toLocaleString(intlLocale()) })}
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
