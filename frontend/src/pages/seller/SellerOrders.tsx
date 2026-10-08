import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone, ReceiptText } from "lucide-react";
import { advanceMyOrder, listMyOrders, type SellerOrder } from "@/lib/api";
import { formatUZS } from "@/lib/utils";
import { NEXT_ORDER_ACTION, ORDER_STATUS_LABELS } from "@/lib/orderStatus";
import { Button } from "@/components/ui/Button";
import { IconBubble, Panel, Tile } from "@/components/ui/Panel";
import { errorMessage } from "@/pages/dokon/admin/errorMessage";

const ORDERS_KEY = ["seller", "orders"] as const;

const STAGE_STYLE: Record<string, string> = {
  accepted: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  gathering: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  on_the_way: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  delivered: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
};

const PAYMENT_LABEL: Record<string, string> = { cash: "Naqd pul", card: "Karta" };

/** 08.10.2026 14:22 — the browser's own "uz-UZ" medium format reads as "2026 M10 8". */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function OrderCard({ order, busy, onAdvance }: { order: SellerOrder; busy: boolean; onAdvance: (o: SellerOrder) => void }) {
  const next = NEXT_ORDER_ACTION[order.status as keyof typeof NEXT_ORDER_ACTION];
  return (
    <Panel className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-ink">№ {order.id.slice(0, 8).toUpperCase()}</p>
          <p className="text-xs text-ink-muted">{formatWhen(order.created_at)}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${STAGE_STYLE[order.status] ?? STAGE_STYLE.accepted}`}>
          {ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS] ?? order.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {order.delivery_address && (
          <Tile className="col-span-2 px-3.5 py-3">
            <p className="text-[11px] text-ink-muted">Yetkazish manzili</p>
            <p className="text-sm font-bold text-ink">{order.delivery_address}</p>
          </Tile>
        )}
        {order.phone && (
          <Tile className="col-span-2 flex items-center justify-between gap-2 px-3.5 py-3">
            <div className="min-w-0">
              <p className="text-[11px] text-ink-muted">Telefon</p>
              <p className="text-sm font-bold text-ink">{order.phone}</p>
            </div>
            <a href={`tel:${order.phone.replace(/\s/g, "")}`} aria-label="Xaridorga qo'ng'iroq" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card text-ink-muted transition-colors hover:text-accent">
              <Phone size={15} aria-hidden="true" />
            </a>
          </Tile>
        )}
      </div>

      <div className="space-y-1.5">
        {order.lines.map((l) => (
          <div key={l.id} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-ink">{l.product_name} <span className="text-ink-muted">× {l.quantity}</span></span>
            <span className="shrink-0 font-semibold text-ink">{formatUZS(l.unit_price_uzs * l.quantity)}</span>
          </div>
        ))}
        <div className="flex items-baseline justify-between border-t border-line pt-2">
          <span className="text-sm font-bold text-ink">
            Jami
            {order.payment_method && (
              <span className="ml-2 text-xs font-medium text-ink-muted">· {PAYMENT_LABEL[order.payment_method] ?? order.payment_method}</span>
            )}
          </span>
          <span className="text-lg font-extrabold text-ink">{formatUZS(order.total_uzs)}</span>
        </div>
      </div>

      {next ? (
        <Button className="w-full" loading={busy} onClick={() => onAdvance(order)}>
          {next.label}
        </Button>
      ) : (
        <p className="text-center text-xs font-semibold text-emerald-500">Buyurtma yetkazildi</p>
      )}
    </Panel>
  );
}

/** The orders placed with this shop, newest first, each movable to its next stage. */
export function SellerOrders() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  // A new order should show up without the seller having to reload the page.
  const orders = useQuery({ queryKey: ORDERS_KEY, queryFn: listMyOrders, refetchInterval: 30_000 });

  const advance = useMutation({
    mutationFn: (o: SellerOrder) => {
      const next = NEXT_ORDER_ACTION[o.status as keyof typeof NEXT_ORDER_ACTION];
      if (!next) return Promise.reject(new Error("Bu buyurtma yetkazilgan"));
      return advanceMyOrder(o.id, next.to);
    },
    onSuccess: (updated) => {
      setError(null);
      queryClient.setQueryData<SellerOrder[]>(ORDERS_KEY, (prev) => prev?.map((o) => (o.id === updated.id ? updated : o)));
    },
    onError: (err) => {
      setError(errorMessage(err, "Holatni o'zgartirib bo'lmadi"));
      // Someone (another device) may have moved it already: show where it stands now.
      void queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
    },
  });

  const list = orders.data ?? [];
  const open = list.filter((o) => o.status !== "delivered").length;

  return (
    <section className="space-y-3" aria-label="Buyurtmalar">
      <Panel className="flex items-center gap-3 px-4 py-3">
        <IconBubble tone="orange" className="h-10 w-10 rounded-2xl"><ReceiptText size={18} aria-hidden="true" /></IconBubble>
        <h2 className="text-base font-extrabold text-ink">
          Buyurtmalar{orders.data ? ` (${list.length})` : ""}
        </h2>
        {open > 0 && <span className="ml-auto rounded-full bg-accent/15 px-3 py-1 text-xs font-bold text-accent">{open} ta ochiq</span>}
      </Panel>

      {error && <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-500">{error}</div>}

      {orders.isLoading ? (
        <div className="h-32 animate-pulse rounded-3xl bg-card" />
      ) : orders.isError ? (
        <p className="text-sm text-red-500">{errorMessage(orders.error, "Buyurtmalarni yuklab bo'lmadi")}</p>
      ) : list.length === 0 ? (
        <Panel className="px-4 py-8 text-center">
          <p className="text-sm font-bold text-ink">Hali buyurtma yo'q.</p>
          <p className="mt-1 text-xs text-ink-muted">Xaridor sizning mahsulotingizni buyurtma qilsa, shu yerda chiqadi.</p>
        </Panel>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((o) => (
            <OrderCard key={o.id} order={o} busy={advance.isPending && advance.variables?.id === o.id} onAdvance={(x) => advance.mutate(x)} />
          ))}
        </div>
      )}
    </section>
  );
}
