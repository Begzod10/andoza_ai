import { apiClient } from "./client";

export type OrderStatus = "accepted" | "gathering" | "on_the_way" | "delivered" | "cancelled";
export type PaymentMethod = "cash" | "card";

export interface OrderLine {
  id: string;
  material_id: string | null;
  furniture_id: string | null;
  product_name: string;
  unit: string;
  unit_price_uzs: number;
  quantity: number;
}

export interface Order {
  id: string;
  user_id: string;
  dealer_name: string;
  total_uzs: number;
  status: OrderStatus | string;
  delivery_address: string | null;
  phone: string | null;
  payment_method: PaymentMethod | string | null;
  /** Set when the order was cancelled: by "buyer", "seller" or "admin", and why. */
  cancelled_by: string | null;
  cancel_reason: string | null;
  created_at: string;
  lines: OrderLine[];
}

export interface OrderLineInput {
  /** Set for catalog materials: the server then uses the catalog's own price. */
  material_id: string | null;
  /** Set for catalog furniture: likewise priced by the server, never by the client. */
  furniture_id: string | null;
  product_name: string;
  unit: string;
  unit_price_uzs: number;
  quantity: number;
}

export interface OrderInput {
  dealer_name: string;
  lines: OrderLineInput[];
  delivery_address?: string | null;
  phone?: string | null;
  payment_method?: PaymentMethod | null;
}

/** One order for one dealer; the server works out the total. */
export async function createOrder(input: OrderInput): Promise<Order> {
  return apiClient<Order>("/orders", { method: "POST", body: JSON.stringify(input) });
}

export async function getOrder(id: string): Promise<Order> {
  return apiClient<Order>(`/orders/${encodeURIComponent(id)}`);
}

/** The current user's orders, newest first. */
export async function listOrders(page = 1, perPage = 50): Promise<Order[]> {
  return apiClient<Order[]>(`/orders?page=${page}&per_page=${perPage}`);
}

/** Cancel one of your own orders; the server allows it only before the shop has started on it. */
export async function cancelOrder(id: string, reason?: string): Promise<Order> {
  return apiClient<Order>(`/orders/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    body: JSON.stringify(reason?.trim() ? { reason: reason.trim() } : {}),
  });
}
