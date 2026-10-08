import { apiClient } from "./client";
import type { AdminFurnitureCategory, AdminPlacement, AdminRoomType } from "./admin";
import type { OrderLine, OrderStatus } from "./orders";

/** Where a shop or a model stands with the admins. Anything but "approved" is
 *  hidden from the public catalog. */
export type ModerationStatus = "pending" | "approved" | "rejected";

export interface SellerStore {
  id: string;
  name: string;
  district: string | null;
  phone: string | null;
  telegram: string | null;
  logo_color: string | null;
  partner_tier: string;
  status: ModerationStatus;
  moderation_note: string | null;
  is_active: boolean;
  created_at: string;
}

export interface SellerModel {
  id: string;
  category: AdminFurnitureCategory;
  room_type: AdminRoomType | null;
  placement: AdminPlacement;
  name_uz: string;
  price_uzs: number | null;
  glb_url: string | null;
  thumbnail_url: string | null;
  footprint_w: number | null;
  footprint_d: number | null;
  is_active: boolean;
  status: ModerationStatus;
  moderation_note: string | null;
  created_at: string;
}

export interface SellerModelPage {
  items: SellerModel[];
  total: number;
  page: number;
  per_page: number;
}

export interface StoreApplication {
  name: string;
  district?: string | null;
  phone?: string | null;
  telegram?: string | null;
  logo_color?: string | null;
}

/** The caller's shop, or null when they have not applied yet. */
export async function getMyStore(): Promise<SellerStore | null> {
  return apiClient<SellerStore | null>("/seller/store");
}

export async function applyForStore(input: StoreApplication): Promise<SellerStore> {
  return apiClient<SellerStore>("/seller/store", { method: "POST", body: JSON.stringify(input) });
}

export async function updateMyStore(patch: Partial<StoreApplication>): Promise<SellerStore> {
  return apiClient<SellerStore>("/seller/store", { method: "PATCH", body: JSON.stringify(patch) });
}

export async function resubmitMyStore(): Promise<SellerStore> {
  return apiClient<SellerStore>("/seller/store/resubmit", { method: "POST" });
}

export async function listMyModels(page = 1): Promise<SellerModelPage> {
  return apiClient<SellerModelPage>(`/seller/furniture?page=${page}&per_page=100`);
}

export interface UploadModelInput {
  file: File;
  thumbnail?: File | null;
  name_uz: string;
  category: AdminFurnitureCategory;
  room_type?: AdminRoomType | null;
  placement?: AdminPlacement;
  price_uzs?: number | null;
}

/** Upload a .glb into the caller's shop. It waits for an admin before it shows. */
export async function uploadMyModel(input: UploadModelInput): Promise<SellerModel> {
  const form = new FormData();
  form.append("file", input.file);
  if (input.thumbnail) form.append("thumbnail", input.thumbnail);
  form.append("name_uz", input.name_uz);
  form.append("category", input.category);
  if (input.room_type) form.append("room_type", input.room_type);
  if (input.placement) form.append("placement", input.placement);
  if (input.price_uzs != null) form.append("price_uzs", String(input.price_uzs));
  return apiClient<SellerModel>("/seller/furniture", { method: "POST", body: form });
}

export async function updateMyModel(
  id: string,
  patch: Partial<{ name_uz: string; price_uzs: number | null; is_active: boolean }>,
): Promise<SellerModel> {
  return apiClient<SellerModel>(`/seller/furniture/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export async function deleteMyModel(id: string): Promise<void> {
  return apiClient<void>(`/seller/furniture/${id}`, { method: "DELETE" });
}

// ---------- Admin moderation ----------

export interface PendingStore extends SellerStore {
  owner_user_id: string | null;
}

export interface PendingModel extends SellerModel {
  store_id: string | null;
  store_name: string | null;
}

/** A craftsman's application (`ustalar` row), as the moderator sees it. */
export interface PendingUsta {
  id: string;
  name: string;
  category: string;
  district: string | null;
  phone: string;
  telegram: string | null;
  price_min: number | null;
  price_max: number | null;
  status: ModerationStatus;
  moderation_note: string | null;
  owner_user_id: string | null;
  created_at: string;
}

export interface PendingQueue {
  stores: PendingStore[];
  furniture: PendingModel[];
  /** Absent on a server that predates self-service ustalar. */
  ustalar?: PendingUsta[];
}

export async function getPendingQueue(): Promise<PendingQueue> {
  return apiClient<PendingQueue>("/admin/moderation/pending");
}

export type ModerationTarget = "stores" | "furniture" | "ustalar";

export async function approvePending(target: ModerationTarget, id: string): Promise<void> {
  return apiClient<void>(`/admin/moderation/${target}/${id}/approve`, { method: "POST" });
}

export async function rejectPending(target: ModerationTarget, id: string, note: string): Promise<void> {
  return apiClient<void>(`/admin/moderation/${target}/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

/** An order as the shop that must fulfil it sees it. */
export interface SellerOrder {
  id: string;
  dealer_name: string;
  total_uzs: number;
  status: OrderStatus | string;
  delivery_address: string | null;
  phone: string | null;
  payment_method: string | null;
  created_at: string;
  lines: OrderLine[];
}

export async function listMyOrders(): Promise<SellerOrder[]> {
  return apiClient<SellerOrder[]>("/seller/orders?per_page=100");
}

/** Move an order to its next stage; the server refuses anything but the next one. */
export async function advanceMyOrder(id: string, status: OrderStatus): Promise<SellerOrder> {
  return apiClient<SellerOrder>(`/seller/orders/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}
