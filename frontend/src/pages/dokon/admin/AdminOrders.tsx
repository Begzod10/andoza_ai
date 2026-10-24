import { useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ReceiptText } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TKey } from "@/i18n";
import { listAdminOrders, setAdminOrderStatus, type AdminOrder } from "@/lib/api";
import type { OrderStatus } from "@/lib/api/orders";
import { formatUZS } from "@/lib/utils";
import {
  ADMIN_CAN_CANCEL, NEXT_ORDER_ACTION, ORDER_STATUS_KEYS, ORDER_STATUS_STYLES, cancelledByLabel, formatWhen, nextOrdersPage, orderStatusLabel, paymentLabel,
} from "@/lib/orderStatus";
import { Button } from "@/components/ui/Button";
import { IconBubble, Panel, Tile } from "@/components/ui/Panel";
import { errorMessage } from "./errorMessage";
import { FilterChip } from "./FilterChip";
import { type FormError, requestError } from "@/lib/formError";

const KEY = ["admin", "orders"] as const;
const MIN_REASON = 3;
const FILTERS: Array<{ value: OrderStatus | "all"; labelKey: TKey }> = [
  { value: "all", labelKey: "dokon.admin.hammasi" },
  { value: "accepted", labelKey: ORDER_STATUS_KEYS.accepted },
  { value: "gathering", labelKey: ORDER_STATUS_KEYS.gathering },
  { value: "on_the_way", labelKey: ORDER_STATUS_KEYS.on_the_way },
  { value: "delivered", labelKey: ORDER_STATUS_KEYS.delivered },
  { value: "cancelled", labelKey: ORDER_STATUS_KEYS.cancelled },
];

function Row({ order, busy, onAdvance, onCancel }: {
  order: AdminOrder; busy: boolean; onAdvance: (o: AdminOrder) => void; onCancel: (o: AdminOrder, reason: string) => void;
}) {
  const { t } = useTranslation();
  const status = order.status as OrderStatus;
  const next = NEXT_ORDER_ACTION[status];
  const canCancel = ADMIN_CAN_CANCEL.includes(status);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <Panel className="flex min-w-0 flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-ink">
            № {order.id.slice(0, 8).toUpperCase()} · {order.store_name ?? order.dealer_name}
          </p>
          <p className="text-xs text-ink-muted">
            {formatWhen(order.created_at)}
            {!order.store_id && ` · ${t("dokon.order.no_store_note")}`}
          </p>
        </div>
        <span className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${ORDER_STATUS_STYLES[status] ?? ORDER_STATUS_STYLES.accepted}`}>
          {orderStatusLabel(order.status, t)}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {order.delivery_address && <Tile className="px-3.5 py-2.5"><p className="text-[11px] text-ink-muted">{t("common.manzil")}</p><p className="text-sm font-bold text-ink">{order.delivery_address}</p></Tile>}
        {order.phone && <Tile className="px-3.5 py-2.5"><p className="text-[11px] text-ink-muted">{t("common.telefon")}</p><p className="text-sm font-bold text-ink">{order.phone}</p></Tile>}
      </div>

      <div className="space-y-1 text-sm">
        {order.lines.map((l) => (
          <div key={l.id} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-ink">{l.product_name} <span className="text-ink-muted">× {l.quantity}</span></span>
            <span className="shrink-0 font-semibold text-ink">{formatUZS(l.unit_price_uzs * l.quantity)}</span>
          </div>
        ))}
        <div className="flex items-baseline justify-between border-t border-line pt-2 font-extrabold text-ink">
          <span>
            {t("common.jami")}
            {order.payment_method && <span className="ml-2 text-xs font-medium text-ink-muted">· {paymentLabel(order.payment_method, t)}</span>}
          </span>
          <span>{formatUZS(order.total_uzs)}</span>
        </div>
      </div>

      {status === "cancelled" ? (
        <p className="mt-auto rounded-2xl bg-red-500/10 px-4 py-2.5 text-xs text-ink-muted">
          {t("dokon.order.cancelled_line", { who: order.cancelled_by ? cancelledByLabel(order.cancelled_by, t) : t("dokon.order.unknown"), reason: order.cancel_reason ?? "—" })}
        </p>
      ) : cancelling ? (
        <form
          className="mt-auto space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim().length >= MIN_REASON) onCancel(order, reason.trim());
          }}
        >
          <label htmlFor={`admin-cancel-${order.id}`} className="block text-xs font-semibold text-ink-muted">{t("dokon.order.cancel_reason")}</label>
          <textarea
            id={`admin-cancel-${order.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            rows={2}
            className="w-full rounded-xl border border-line bg-card-soft px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[#5B84F5]/70"
          />
          <div className="flex gap-2">
            <Button type="button" variant="soft" size="sm" onClick={() => { setCancelling(false); setReason(""); }}>{t("common.ortga")}</Button>
            <Button type="submit" variant="danger" size="sm" className="flex-1" loading={busy} disabled={reason.trim().length < MIN_REASON}>{t("dokon.order.confirm_cancel")}</Button>
          </div>
        </form>
      ) : (
        <div className="mt-auto flex flex-wrap gap-2">
          {next && <Button size="sm" loading={busy} onClick={() => onAdvance(order)}>{t(next.labelKey)}</Button>}
          {canCancel && <Button size="sm" variant="soft" onClick={() => setCancelling(true)}>{t("dokon.order.cancel_btn")}</Button>}
        </div>
      )}
    </Panel>
  );
}

/** Every order in the system, for the administrators: filter by stage, move one on or cancel it. */
export function AdminOrders({ onError }: { onError: (message: FormError) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const orders = useInfiniteQuery({
    queryKey: [...KEY, filter],
    queryFn: ({ pageParam }) => listAdminOrders(filter === "all" ? undefined : filter, pageParam),
    initialPageParam: 1,
    getNextPageParam: nextOrdersPage,
    refetchInterval: 30_000,
  });

  const done = () => {
    onError(null);
    void queryClient.invalidateQueries({ queryKey: KEY });
  };
  const failed = (fallbackKey: TKey) => (err: unknown) => {
    onError(requestError(err, fallbackKey));
    void queryClient.invalidateQueries({ queryKey: KEY });
  };

  const advance = useMutation({
    mutationFn: (o: AdminOrder) => {
      const next = NEXT_ORDER_ACTION[o.status as OrderStatus];
      return next ? setAdminOrderStatus(o.id, next.to) : Promise.reject(new Error(t("dokon.order.finished")));
    },
    onSuccess: done,
    onError: failed("dokon.order.status_failed"),
  });
  const cancel = useMutation({
    mutationFn: ({ order, reason }: { order: AdminOrder; reason: string }) => setAdminOrderStatus(order.id, "cancelled", reason),
    onSuccess: done,
    onError: failed("dokon.order.cancel_failed"),
  });
  const busyId = advance.isPending ? advance.variables?.id : cancel.isPending ? cancel.variables?.order.id : undefined;
  const list = orders.data?.pages.flat() ?? [];

  return (
    <section className="space-y-3" aria-label={t("dokon.order.title")}>
      <Panel className="flex flex-wrap items-center gap-3 px-4 py-3">
        <IconBubble tone="orange" className="h-10 w-10 rounded-2xl"><ReceiptText size={18} aria-hidden="true" /></IconBubble>
        <h2 className="text-base font-extrabold text-ink">{orders.data ? t("dokon.order.title_count", { n: `${list.length}${orders.hasNextPage ? "+" : ""}` }) : t("dokon.order.title")}</h2>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("dokon.order.by_status")}>
          {FILTERS.map((f) => (
            <FilterChip key={f.value} pressed={filter === f.value} onClick={() => setFilter(f.value)}>
              {t(f.labelKey)}
            </FilterChip>
          ))}
        </div>
      </Panel>

      {orders.isLoading ? (
        <div className="h-24 animate-pulse rounded-3xl bg-card" />
      ) : orders.isError ? (
        <p className="text-sm text-red-500">{errorMessage(orders.error, t("dokon.order.load_failed"))}</p>
      ) : list.length === 0 ? (
        <Panel className="px-4 py-6 text-center text-sm text-ink-muted">{t("dokon.order.not_found")}</Panel>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {list.map((o) => (
            <Row key={o.id} order={o} busy={busyId === o.id} onAdvance={(x) => advance.mutate(x)} onCancel={(x, reason) => cancel.mutate({ order: x, reason })} />
          ))}
          {orders.hasNextPage && (
            <div className="lg:col-span-2">
              <Button variant="soft" className="w-full" loading={orders.isFetchingNextPage} onClick={() => void orders.fetchNextPage()}>
                {t("common.yana_yuklash")}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
