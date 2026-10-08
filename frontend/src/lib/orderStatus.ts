import type { OrderStatus } from "@/lib/api/orders";

/** The stages an order goes through, in order. */
export const ORDER_STATUSES: OrderStatus[] = ["accepted", "gathering", "on_the_way", "delivered"];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  accepted: "Qabul qilindi",
  gathering: "Yig'ilmoqda",
  on_the_way: "Yo'lda",
  delivered: "Yetkazildi",
};

/** What a shop does to move an order on, named by the action. The last stage has none. */
export const NEXT_ORDER_ACTION: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  accepted: { to: "gathering", label: "Yig'ishni boshlash" },
  gathering: { to: "on_the_way", label: "Yo'lga chiqarish" },
  on_the_way: { to: "delivered", label: "Yetkazildi deb belgilash" },
};
