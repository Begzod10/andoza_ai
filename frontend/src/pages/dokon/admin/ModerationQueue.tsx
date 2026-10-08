import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import {
  approvePending,
  getPendingQueue,
  rejectPending,
  type ModerationTarget,
} from "@/lib/api";
import { CATEGORY_LABELS } from "./labels";
import { errorMessage } from "./errorMessage";

const KEY = ["admin", "moderation"] as const;

const USTA_TRADES: Record<string, string> = {
  elektrik: "Elektrik",
  elektrik_loyihachi: "Elektr loyihachi",
  santexnik: "Santexnik",
  malyar: "Malyar",
  oboy: "Oboychi",
  laminat: "Laminatchi",
  brigada: "Brigada",
};

/** What sellers have submitted and is waiting for a decision: shop applications,
 *  craftsman (usta) applications and uploaded 3D models. Approving makes it live; rejecting needs a reason the
 *  seller will see. */
export function ModerationQueue({ onError }: { onError: (msg: string | null) => void }) {
  const queryClient = useQueryClient();
  const queue = useQuery({ queryKey: KEY, queryFn: getPendingQueue });
  const [rejecting, setRejecting] = useState<{ target: ModerationTarget; id: string; label: string } | null>(null);
  const [note, setNote] = useState("");

  const done = () => {
    onError(null);
    queryClient.invalidateQueries({ queryKey: KEY });
    queryClient.invalidateQueries({ queryKey: ["admin"] });
  };

  const approve = useMutation({
    mutationFn: (v: { target: ModerationTarget; id: string }) => approvePending(v.target, v.id),
    onSuccess: done,
    onError: (err) => onError(errorMessage(err, "Tasdiqlab bo'lmadi")),
  });
  const reject = useMutation({
    mutationFn: () => rejectPending(rejecting!.target, rejecting!.id, note.trim()),
    onSuccess: () => {
      setRejecting(null);
      setNote("");
      done();
    },
    onError: (err) => onError(errorMessage(err, "Rad etib bo'lmadi")),
  });

  const stores = queue.data?.stores ?? [];
  const models = queue.data?.furniture ?? [];
  const ustalar = queue.data?.ustalar ?? [];
  const total = stores.length + models.length + ustalar.length;
  if (queue.isLoading || total === 0) return null;

  return (
    <section className="space-y-3" aria-label="Ko'rib chiqishni kutayotganlar">
      <h2 className="text-base font-semibold text-on-app">
        Ko'rib chiqishni kutmoqda <span className="ml-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-500">{total}</span>
      </h2>

      {stores.map((s) => (
        <Card key={s.id} size="sm" className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink truncate">{s.name}</p>
            <p className="text-xs text-ink-muted truncate">
              Do'kon arizasi · {[s.district, s.phone, s.telegram].filter(Boolean).join(" · ") || "ma'lumot yo'q"}
            </p>
          </div>
          <Button size="sm" onClick={() => approve.mutate({ target: "stores", id: s.id })} disabled={approve.isPending}>Tasdiqlash</Button>
          <Button size="sm" variant="tertiary" onClick={() => setRejecting({ target: "stores", id: s.id, label: s.name })}>Rad etish</Button>
        </Card>
      ))}

      {ustalar.map((u) => (
        <Card key={u.id} size="sm" className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink truncate">{u.name}</p>
            <p className="text-xs text-ink-muted truncate">
              Usta arizasi · {[
                USTA_TRADES[u.category] ?? u.category,
                u.district,
                u.phone,
                u.telegram,
                u.price_min != null || u.price_max != null
                  ? `${(u.price_min ?? 0).toLocaleString("uz-UZ")}–${(u.price_max ?? 0).toLocaleString("uz-UZ")} so'm`
                  : null,
              ].filter(Boolean).join(" · ")}
            </p>
          </div>
          <Button size="sm" onClick={() => approve.mutate({ target: "ustalar", id: u.id })} disabled={approve.isPending}>Tasdiqlash</Button>
          <Button size="sm" variant="tertiary" onClick={() => setRejecting({ target: "ustalar", id: u.id, label: u.name })}>Rad etish</Button>
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
              {m.store_name ?? "—"} · {CATEGORY_LABELS[m.category] ?? m.category}
              {m.price_uzs != null ? ` · ${m.price_uzs.toLocaleString("uz-UZ")} so'm` : ""}
            </p>
            {m.glb_url && (
              <a href={m.glb_url} target="_blank" rel="noreferrer" className="text-xs text-brand underline">Faylni yuklab olish</a>
            )}
          </div>
          <Button size="sm" onClick={() => approve.mutate({ target: "furniture", id: m.id })} disabled={approve.isPending}>Tasdiqlash</Button>
          <Button size="sm" variant="tertiary" onClick={() => setRejecting({ target: "furniture", id: m.id, label: m.name_uz })}>Rad etish</Button>
        </Card>
      ))}

      <Dialog
        open={rejecting !== null}
        onOpenChange={(open) => { if (!open) { setRejecting(null); setNote(""); } }}
        title="Rad etish sababi"
        description={rejecting ? `"${rejecting.label}" — sotuvchi bu sababni ko'radi` : undefined}
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
            placeholder="Masalan: Model sifati past, rasm aniq emas"
            className="w-full rounded-xl border border-line bg-card-soft px-3 py-2 text-sm text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-[#5B84F5]/70"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="tertiary" onClick={() => { setRejecting(null); setNote(""); }}>Bekor qilish</Button>
            <Button type="submit" variant="danger" disabled={!note.trim()} loading={reject.isPending}>Rad etish</Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
