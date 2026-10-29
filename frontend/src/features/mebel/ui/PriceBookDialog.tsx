import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { savePriceBook } from "@/lib/api";
import type { CatalogPrices, PriceBook } from "@/features/mebel/engine";
import { formatUZS } from "@/lib/utils";

const field = "w-32 rounded-xl border border-neutral-200 px-3 py-1.5 text-right text-sm tabular-nums";
const num = (v: string): number | null => (v.trim() === "" ? null : Math.max(0, Number(v) || 0));

/** The workshop's own prices, used in all its projects. A blank price falls back to the catalogue. */
export function PriceBookDialog({
  open, onOpenChange, priceBook, ready, usedMaterials, catalog,
}: {
  open: boolean
  /** The saved price book has loaded; until then saving would overwrite it with blanks. */
  ready: boolean
  onOpenChange(open: boolean): void
  priceBook: PriceBook
  /** The materials this project uses, so their price can be set here. */
  usedMaterials: string[]
  catalog: CatalogPrices
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<PriceBook>(priceBook);
  // Each opening starts from the saved prices: not the ones from when the page
  // loaded, nor an edit that was cancelled.
  useEffect(() => {
    if (open) setDraft(priceBook);
  }, [open, priceBook]);
  const save = useMutation({
    mutationFn: savePriceBook,
    onSuccess: (pb) => {
      queryClient.setQueryData(["mebel", "price-book"], pb);
      onOpenChange(false);
    },
  });

  const row = (label: string, value: number | null, onChange: (v: number | null) => void, hint?: string) => (
    <label key={label} className="flex items-center justify-between gap-3 text-sm">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <input type="number" inputMode="numeric" className={field} value={value ?? ""} placeholder={hint}
        onChange={(e) => onChange(num(e.target.value))} />
    </label>
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/40" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-[80] max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white p-6 sm:inset-0 sm:m-auto sm:h-fit sm:w-[min(92vw,520px)] sm:rounded-3xl">
          <Dialog.Title className="text-lg font-bold">{t("mebel.price_book")}</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-neutral-500">{t("mebel.price_book_hint")}</Dialog.Description>

          <div className="mt-5 flex flex-col gap-2">
            {usedMaterials.length > 0 && <h3 className="text-xs font-semibold text-neutral-500">{t("mebel.pb.materials")}</h3>}
            {usedMaterials.map((id) =>
              row(catalog[id]?.name ?? id, draft.materials[id] ?? null, (v) =>
                setDraft((d) => {
                  const materials = { ...d.materials };
                  if (v == null) delete materials[id]; else materials[id] = v;
                  return { ...d, materials };
                }), catalog[id] ? formatUZS(catalog[id].price) : undefined))}

            <h3 className="mt-3 text-xs font-semibold text-neutral-500">{t("mebel.tab.bom")}</h3>
            {row(t("mebel.pb.cut_per_sheet"), draft.cutPerSheet, (v) => setDraft((d) => ({ ...d, cutPerSheet: v })))}
            {(["0.4", "1", "2"] as const).map((k) =>
              row(t("mebel.pb.banding", { t: k }), draft.bandingPerMeter[k], (v) =>
                setDraft((d) => ({ ...d, bandingPerMeter: { ...d.bandingPerMeter, [k]: v } }))))}

            <h3 className="mt-3 text-xs font-semibold text-neutral-500">{t("mebel.pb.hardware")}</h3>
            {(["leg", "confirmat", "shelfPin", "nail", "hinge", "handle", "hanger"] as const).map((k) =>
              row(t(`mebel.bom.${k}`), draft.hardware[k], (v) => setDraft((d) => ({ ...d, hardware: { ...d.hardware, [k]: v } }))))}

            <div className="mt-3">
              {row(t("mebel.pb.markup"), draft.markupPercent, (v) =>
                setDraft((d) => ({ ...d, markupPercent: Math.min(300, v ?? 0) })))}
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close className="rounded-full px-4 py-2 text-sm font-semibold text-neutral-600">{t("mebel.cancel")}</Dialog.Close>
            <button type="button" onClick={() => save.mutate(draft)} disabled={save.isPending || !ready}
              className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {t("mebel.save")}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
