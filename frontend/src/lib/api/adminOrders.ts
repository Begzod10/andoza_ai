import { apiClient } from "./client";
import type { OrderLine, OrderStatus } from "./orders";

/** An order as the administrators see it. */
export interface AdminOrder {
  id: string;
  user_id: string;
  store_id: string | null;
  store_name: string | null;
  dealer_name: string;
  total_uzs: number;
  status: OrderStatus | string;
  delivery_address: string | null;
  phone: string | null;
  payment_method: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  created_at: string;
  lines: OrderLine[];
}

export async function listAdminOrders(status?: OrderStatus): Promise<AdminOrder[]> {
  const q = new URLSearchParams({ per_page: "100", ...(status ? { status } : {}) });
  return apiClient<AdminOrder[]>(`/admin/orders?${q}`);
}

/** Move an order to its next stage, or cancel it (with a reason). */
export async function setAdminOrderStatus(id: string, status: OrderStatus, reason?: string): Promise<AdminOrder> {
  return apiClient<AdminOrder>(`/admin/orders/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, ...(reason ? { reason } : {}) }),
  });
}
