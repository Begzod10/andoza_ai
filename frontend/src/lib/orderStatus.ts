import type { OrderStatus } from "@/lib/api/orders";

/** The stages an order goes through, in order. Cancelled is not a stage: it ends the order. */
export const ORDER_STATUSES: OrderStatus[] = ["accepted", "gathering", "on_the_way", "delivered"];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  accepted: "Qabul qilindi",
  gathering: "Yig'ilmoqda",
  on_the_way: "Yo'lda",
  delivered: "Yetkazildi",
  cancelled: "Bekor qilindi",
};

/** What a shop does to move an order on, named by the action. The last stage has none. */
export const NEXT_ORDER_ACTION: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  accepted: { to: "gathering", label: "Yig'ishni boshlash" },
  gathering: { to: "on_the_way", label: "Yo'lga chiqarish" },
  on_the_way: { to: "delivered", label: "Yetkazildi deb belgilash" },
};

/** Until which stage each party may cancel (the server enforces the same). */
export const BUYER_CAN_CANCEL: OrderStatus[] = ["accepted"];
export const SELLER_CAN_CANCEL: OrderStatus[] = ["accepted", "gathering"];
export const ADMIN_CAN_CANCEL: OrderStatus[] = ["accepted", "gathering", "on_the_way"];

export const CANCELLED_BY_LABELS: Record<string, string> = { buyer: "xaridor", seller: "do'kon", admin: "administrator" };

export const PAYMENT_LABELS: Record<string, string> = { cash: "Naqd pul", card: "Karta" };

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
