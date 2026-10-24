import type { OrderStatus } from "@/lib/api/orders";
import type { TFunction } from "i18next";
import type { TKey } from "@/i18n";

/** The stages an order goes through, in order. Cancelled is not a stage: it ends the order. */
export const ORDER_STATUSES: OrderStatus[] = ["accepted", "gathering", "on_the_way", "delivered"];

export const ORDER_STATUS_KEYS: Record<OrderStatus, TKey> = {
  accepted: "dokon.order.status.accepted",
  gathering: "dokon.order.status.gathering",
  on_the_way: "dokon.order.status.on_the_way",
  delivered: "dokon.order.status.delivered",
  cancelled: "dokon.order.status.cancelled",
};

/** What a shop does to move an order on, named by the action. The last stage has none. */
export const NEXT_ORDER_ACTION: Partial<Record<OrderStatus, { to: OrderStatus; labelKey: TKey }>> = {
  accepted: { to: "gathering", labelKey: "dokon.order.next.gathering" },
  gathering: { to: "on_the_way", labelKey: "dokon.order.next.on_the_way" },
  on_the_way: { to: "delivered", labelKey: "dokon.order.next.delivered" },
};

/** Until which stage each party may cancel (the server enforces the same). */
export const BUYER_CAN_CANCEL: OrderStatus[] = ["accepted"];
export const SELLER_CAN_CANCEL: OrderStatus[] = ["accepted", "gathering"];
export const ADMIN_CAN_CANCEL: OrderStatus[] = ["accepted", "gathering", "on_the_way"];

export const CANCELLED_BY_KEYS: Record<string, TKey> = {
  buyer: "dokon.order.cancelled_by.buyer",
  seller: "dokon.order.cancelled_by.seller",
  admin: "dokon.order.cancelled_by.admin",
};

export const PAYMENT_KEYS: Record<string, TKey> = { cash: "dokon.order.payment.cash", card: "dokon.order.payment.card" };

/** The words for a status, a payment method or whoever cancelled; an unknown value (a newer server) is shown as it came. */
export function orderStatusLabel(status: string, t: TFunction): string {
  return status in ORDER_STATUS_KEYS ? t(ORDER_STATUS_KEYS[status as OrderStatus]) : status;
}
export function paymentLabel(method: string, t: TFunction): string {
  return method in PAYMENT_KEYS ? t(PAYMENT_KEYS[method]) : method;
}
export function cancelledByLabel(who: string, t: TFunction): string {
  return who in CANCELLED_BY_KEYS ? t(CANCELLED_BY_KEYS[who]) : who;
}

/** The little status pill, readable on both the day and the night card. */
export const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  accepted: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  gathering: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  on_the_way: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  delivered: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  cancelled: "bg-red-500/15 text-red-500 border-red-500/30",
};

/** 08.10.2026 14:22 — the browser's own "uz-UZ" medium format reads as "2026 M10 8". */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Orders are fetched this many to a page; a full page means there may be more. */
export const ORDERS_PAGE_SIZE = 50;

/** react-query's `getNextPageParam` for a list of orders: the next page while the last one was full. */
export function nextOrdersPage(lastPage: unknown[], allPages: unknown[][]): number | undefined {
  return lastPage.length >= ORDERS_PAGE_SIZE ? allPages.length + 1 : undefined;
}

/** The same pages with one order replaced by its newer copy (after a status change). */
export function replaceOrderInPages<T extends { id: string }>(
  data: { pages: T[][]; pageParams: unknown[] } | undefined,
  updated: T,
): { pages: T[][]; pageParams: unknown[] } | undefined {
  return data && { ...data, pages: data.pages.map((page) => page.map((o) => (o.id === updated.id ? updated : o))) };
}
