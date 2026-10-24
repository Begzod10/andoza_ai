import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import {
  approvePending,
  getPendingQueue,
  rejectPending,
  type ModerationTarget,
} from "@/lib/api";
import type { TKey } from "@/i18n";
import { intlLocale } from "@/i18n";
import { categoryLabel } from "./labels";
import { requestError, type FormError } from "@/lib/formError";

const KEY = ["admin", "moderation"] as const;

const USTA_TRADES: Record<string, TKey> = {
  elektrik: "dokon.mod.trade.elektrik",
  elektrik_loyihachi: "dokon.mod.trade.elektrik_loyihachi",
  santexnik: "dokon.mod.trade.santexnik",
  malyar: "dokon.mod.trade.malyar",
  oboy: "dokon.mod.trade.oboy",
  laminat: "dokon.mod.trade.laminat",
  brigada: "dokon.mod.trade.brigada",
};

/** What sellers have submitted and is waiting for a decision: shop applications,
 *  craftsman (usta) applications and uploaded 3D models. Approving makes it live; rejecting needs a reason the
 *  seller will see. */
export function ModerationQueue({ onError }: { onError: (msg: FormError) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const queue = useQuery({ queryKey: KEY, queryFn: getPendingQueue });
  const [rejecting, setRejecting] = useState<{ target: ModerationTarget; id: string; label: string } | null>(null);
  const [note, setNote] = useState("");

  const done = () => {
    onError(null);
    // Everything under ["admin"]: this queue (KEY) and the shop / model lists
    // whose active flags the decision just changed. Once is enough; listing
    // KEY separately as well fetched the queue twice.
    queryClient.invalidateQueries({ queryKey: ["admin"] });
  };

  const approve = useMutation({
    mutationFn: (v: { target: ModerationTarget; id: string }) => approvePending(v.target, v.id),
    onSuccess: done,
    onError: (err) => onError(requestError(err, "dokon.mod.approve_failed")),
  });
  const reject = useMutation({
    mutationFn: () => rejectPending(rejecting!.target, rejecting!.id, note.trim()),
    onSuccess: () => {
      setRejecting(null);
      setNote("");
      done();
    },
    onError: (err) => onError(requestError(err, "dokon.mod.reject_failed")),
  });

  const stores = queue.data?.stores ?? [];
  const models = queue.data?.furniture ?? [];
  const ustalar = queue.data?.ustalar ?? [];
  const total = stores.length + models.length + ustalar.length;
  if (queue.isLoading || total === 0) return null;

  return (
    <section className="space-y-3" aria-label={t("dokon.mod.aria")}>
      <h2 className="text-base font-semibold text-on-app">
        {t("dokon.mod.title")} <span className="ml-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-500">{total}</span>
      </h2>

      {stores.map((s) => (
        <Card key={s.id} size="sm" className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink truncate">{s.name}</p>
            <p className="text-xs text-ink-muted truncate">
              {t("dokon.mod.store_application")} · {[s.district, s.phone, s.telegram].filter(Boolean).join(" · ") || t("dokon.mod.no_info")}
            </p>
          </div>
          <Button size="sm" onClick={() => approve.mutate({ target: "stores", id: s.id })} disabled={approve.isPending}>{t("common.tasdiqlash")}</Button>
          <Button size="sm" variant="tertiary" onClick={() => setRejecting({ target: "stores", id: s.id, label: s.name })}>{t("dokon.mod.reject")}</Button>
        </Card>
      ))}

      {ustalar.map((u) => (
        <Card key={u.id} size="sm" className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink truncate">{u.name}</p>
            <p className="text-xs text-ink-muted truncate">
              {t("dokon.mod.usta_application")} · {[
                u.category in USTA_TRADES ? t(USTA_TRADES[u.category]) : u.category,
                u.district,
                u.phone,
                u.telegram,
                u.price_min != null || u.price_max != null
                  ? t("dokon.mod.price_range", { from: (u.price_min ?? 0).toLocaleString(intlLocale()), to: (u.price_max ?? 0).toLocaleString(intlLocale()) })
                  : null,
              ].filter(Boolean).join(" · ")}
            </p>
          </div>
          <Button size="sm" onClick={() => approve.mutate({ target: "ustalar", id: u.id })} disabled={approve.isPending}>{t("common.tasdiqlash")}</Button>
          <Button size="sm" variant="tertiary" onClick={() => setRejecting({ target: "ustalar", id: u.id, label: u.name })}>{t("dokon.mod.reject")}</Button>
        </Card>
      ))}

      {models.map((m) => (
        <Card key={m.id} size="sm" className="flex items-center gap-3">
          {m.thumbnail_url ? (
            <img src={m.thumbnail_url} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover border border-line" />
          ) : (
            <div className="h-12 w-12 shrink-0 rounded-lg bg-card-soft flex items-center justify-center text-xs text-ink-muted">3D</div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink truncate">{m.name_uz}</p>
            <p className="text-xs text-ink-muted truncate">
              {m.store_name ?? "—"} · {categoryLabel(m.category, t)}
              {m.price_uzs != null ? ` · ${t("common.price_som", { price: m.price_uzs.toLocaleString(intlLocale()) })}` : ""}
            </p>
            {m.glb_url && (
              <a href={m.glb_url} target="_blank" rel="noreferrer" className="text-xs text-brand underline">{t("dokon.mod.download")}</a>
            )}
          </div>
          <Button size="sm" onClick={() => approve.mutate({ target: "furniture", id: m.id })} disabled={approve.isPending}>{t("common.tasdiqlash")}</Button>
          <Button size="sm" variant="tertiary" onClick={() => setRejecting({ target: "furniture", id: m.id, label: m.name_uz })}>{t("dokon.mod.reject")}</Button>
        </Card>
      ))}

      <Dialog
        open={rejecting !== null}
        onOpenChange={(open) => { if (!open) { setRejecting(null); setNote(""); } }}
        title={t("dokon.mod.reason_title")}
        description={rejecting ? t("dokon.mod.reason_desc", { label: rejecting.label }) : undefined}
      >
        <form
          onSubmit={(e) => { e.preventDefault(); if (note.trim()) reject.mutate(); }}
          className="space-y-4"
        >
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            rows={3}
            autoFocus
            placeholder={t("dokon.mod.reason_ph")}
            className="w-full rounded-xl border border-line bg-card-soft px-3 py-2 text-sm text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-[#5B84F5]/70"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="tertiary" onClick={() => { setRejecting(null); setNote(""); }}>{t("common.bekor")}</Button>
            <Button type="submit" variant="danger" disabled={!note.trim()} loading={reject.isPending}>{t("dokon.mod.reject")}</Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
