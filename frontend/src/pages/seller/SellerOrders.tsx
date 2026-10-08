import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone, ReceiptText, XCircle } from "lucide-react";
import { advanceMyOrder, cancelMyOrder, listMyOrders, type SellerOrder } from "@/lib/api";
import { formatUZS } from "@/lib/utils";
import {
  CANCELLED_BY_LABELS, NEXT_ORDER_ACTION, ORDER_STATUS_LABELS, ORDER_STATUS_STYLES, PAYMENT_LABELS, SELLER_CAN_CANCEL, formatWhen,
} from "@/lib/orderStatus";
import type { OrderStatus } from "@/lib/api/orders";
import { Button } from "@/components/ui/Button";
import { IconBubble, Panel, Tile } from "@/components/ui/Panel";
import { errorMessage } from "@/pages/dokon/admin/errorMessage";

const ORDERS_KEY = ["seller", "orders"] as const;
const MIN_REASON = 3;

function OrderCard({
  order, busy, onAdvance, onCancel,
}: { order: SellerOrder; busy: boolean; onAdvance: (o: SellerOrder) => void; onCancel: (o: SellerOrder, reason: string) => void }) {
  const status = order.status as OrderStatus;
  const next = NEXT_ORDER_ACTION[status];
  const cancelled = status === "cancelled";
  const canCancel = SELLER_CAN_CANCEL.includes(status);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <Panel className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-ink">№ {order.id.slice(0, 8).toUpperCase()}</p>
          <p className="text-xs text-ink-muted">{formatWhen(order.created_at)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {status === "accepted" && (
            <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">Yangi</span>
          )}
          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${ORDER_STATUS_STYLES[status] ?? ORDER_STATUS_STYLES.accepted}`}>
            {ORDER_STATUS_LABELS[status] ?? order.status}
          </span>
        </div>
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
              <span className="ml-2 text-xs font-medium text-ink-muted">· {PAYMENT_LABELS[order.payment_method] ?? order.payment_method}</span>
            )}
          </span>
          <span className="text-lg font-extrabold text-ink">{formatUZS(order.total_uzs)}</span>
        </div>
      </div>

      {cancelled ? (
        <div role="status" className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-extrabold text-red-500"><XCircle size={16} aria-hidden="true" /> Bekor qilingan</p>
          <p className="mt-1 text-xs text-ink-muted">
            {order.cancelled_by ? `${CANCELLED_BY_LABELS[order.cancelled_by] ?? order.cancelled_by}: ` : ""}{order.cancel_reason}
          </p>
        </div>
      ) : cancelling ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim().length >= MIN_REASON) onCancel(order, reason.trim());
          }}
        >
          <label className="block text-xs font-semibold text-ink-muted" htmlFor={`cancel-${order.id}`}>
            Bekor qilish sababi (xaridorga ko'rsatiladi)
          </label>
          <textarea
            id={`cancel-${order.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            rows={2}
            placeholder="Masalan: mahsulot omborda tugab qolgan"
            className="w-full rounded-xl border border-line bg-card-soft px-3 py-2 text-sm text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-[#5B84F5]/70"
          />
          <div className="flex gap-2">
            <Button type="button" variant="soft" size="sm" onClick={() => { setCancelling(false); setReason(""); }}>Ortga</Button>
            <Button type="submit" variant="danger" size="sm" className="flex-1" loading={busy} disabled={reason.trim().length < MIN_REASON}>
              Bekor qilishni tasdiqlash
            </Button>
          </div>
        </form>
      ) : next ? (
        <div className="space-y-2">
          <Button className="w-full" loading={busy} onClick={() => onAdvance(order)}>{next.label}</Button>
          {canCancel && (
            <button type="button" onClick={() => setCancelling(true)} className="w-full py-1 text-xs font-semibold text-ink-muted transition-colors hover:text-red-500">
              Buyurtmani bekor qilish
            </button>
          )}
        </div>
      ) : (
        <p className="text-center text-xs font-semibold text-emerald-500">Buyurtma yetkazildi</p>
      )}
    </Panel>
  );
}

/** The orders placed with this shop, newest first, each movable to its next stage or cancellable with a reason. */
export function SellerOrders() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  // A new order should show up without the seller having to reload the page.
  const orders = useQuery({ queryKey: ORDERS_KEY, queryFn: listMyOrders, refetchInterval: 30_000 });

  const replace = (updated: SellerOrder) => {
    setError(null);
    queryClient.setQueryData<SellerOrder[]>(ORDERS_KEY, (prev) => prev?.map((o) => (o.id === updated.id ? updated : o)));
  };
  const failed = (fallback: string) => (err: unknown) => {
    setError(errorMessage(err, fallback));
    // Someone (another device, the buyer) may have changed it already: show where it stands now.
    void queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
  };

  const advance = useMutation({
    mutationFn: (o: SellerOrder) => {
      const next = NEXT_ORDER_ACTION[o.status as OrderStatus];
      if (!next) return Promise.reject(new Error("Bu buyurtma yakunlangan"));
      return advanceMyOrder(o.id, next.to);
    },
    onSuccess: replace,
    onError: failed("Holatni o'zgartirib bo'lmadi"),
  });

  const cancel = useMutation({
    mutationFn: ({ order, reason }: { order: SellerOrder; reason: string }) => cancelMyOrder(order.id, reason),
    onSuccess: replace,
    onError: failed("Buyurtmani bekor qilib bo'lmadi"),
  });

  const list = orders.data ?? [];
  const fresh = list.filter((o) => o.status === "accepted").length;

  // No SMS goes out for a new order, so the tab itself says there is one waiting.
  useEffect(() => {
    if (fresh === 0) return;
    const title = document.title;
    document.title = `(${fresh}) ${title}`;
    return () => { document.title = title; };
  }, [fresh]);

  const open = list.filter((o) => o.status !== "delivered" && o.status !== "cancelled").length;
  const busyId = advance.isPending ? advance.variables?.id : cancel.isPending ? cancel.variables?.order.id : undefined;

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
            <OrderCard
              key={o.id}
              order={o}
              busy={busyId === o.id}
              onAdvance={(x) => advance.mutate(x)}
              onCancel={(x, reason) => cancel.mutate({ order: x, reason })}
            />
          ))}
        </div>
      )}
    </section>
  );
}
