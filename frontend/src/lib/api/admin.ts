import { apiClient } from "./client";

// ---------- Admin: shops and 3D-model catalog ----------
//
// Separate from `Furniture`/`Store` above — those model a different,
// unrelated shape and are unused by the current UI. These mirror
// backend/app/schemas/admin_catalog.py exactly. Every call here is
// admin-only (403 for anyone else).

export const ADMIN_FURNITURE_CATEGORIES = [
  "divan", "stol", "stul", "karavot", "shkaf", "lampa", "boshqa",
] as const;
export type AdminFurnitureCategory = (typeof ADMIN_FURNITURE_CATEGORIES)[number];

export const ADMIN_ROOM_TYPES = [
  "mehmonxona", "oshxona", "yotoqxona", "hammom", "balkon",
] as const;
export type AdminRoomType = (typeof ADMIN_ROOM_TYPES)[number];

export const ADMIN_PARTNER_TIERS = ["standard", "gold", "platinum"] as const;
export type AdminPartnerTier = (typeof ADMIN_PARTNER_TIERS)[number];

export interface AdminStore {
  id: string;
  name: string;
  district: string | null;
  phone: string | null;
  telegram: string | null;
  logo_color: string | null;
  partner_tier: string;
  is_active: boolean;
  created_at: string;
}

export interface AdminStoreInput {
  name: string;
  district?: string | null;
  phone?: string | null;
  telegram?: string | null;
  logo_color?: string | null;
  partner_tier?: AdminPartnerTier;
}

export async function listAdminStores(): Promise<AdminStore[]> {
  return apiClient<AdminStore[]>("/admin/stores");
}

export async function createAdminStore(input: AdminStoreInput): Promise<AdminStore> {
  return apiClient<AdminStore>("/admin/stores", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateAdminStore(
  id: string,
  patch: Partial<AdminStoreInput & { is_active: boolean }>,
): Promise<AdminStore> {
  return apiClient<AdminStore>(`/admin/stores/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteAdminStore(id: string): Promise<void> {
  await apiClient<void>(`/admin/stores/${id}`, { method: "DELETE" });
}

export const ADMIN_PLACEMENTS = ["pol", "devor", "shift"] as const;
export type AdminPlacement = (typeof ADMIN_PLACEMENTS)[number];

export interface AdminFurniture {
  id: string;
  store_id: string | null;
  store_name: string | null;
  category: string;
  room_type: string | null;
  placement: AdminPlacement;
  name_uz: string;
  price_uzs: number | null;
  glb_url: string | null;
  thumbnail_url: string | null;
  footprint_w: number | null;
  footprint_d: number | null;
  is_active: boolean;
  created_at: string;
}

export interface UploadAdminFurnitureInput {
  file: File;
  thumbnail?: File | null;
  name_uz: string;
  category: AdminFurnitureCategory;
  room_type?: AdminRoomType | null;
  placement?: AdminPlacement;
  store_id?: string | null;
  price_uzs?: number | null;
  footprint_w?: number | null;
  footprint_d?: number | null;
}

export async function listAdminFurniture(params: {
  store_id?: string;
  category?: string;
  room_type?: string;
} = {}): Promise<AdminFurniture[]> {
  const query = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)) as Record<string, string>,
  ).toString();
  return apiClient<AdminFurniture[]>(`/admin/furniture${query ? `?${query}` : ""}`);
}

/** Upload a .glb model into the shop catalog, tagged with the type of
 * furniture and the room it belongs in. */
export async function uploadAdminFurniture(input: UploadAdminFurnitureInput): Promise<AdminFurniture> {
  const form = new FormData();
  form.append("file", input.file);
  if (input.thumbnail) form.append("thumbnail", input.thumbnail);
  form.append("name_uz", input.name_uz);
  form.append("category", input.category);
  if (input.room_type) form.append("room_type", input.room_type);
  if (input.placement) form.append("placement", input.placement);
  if (input.store_id) form.append("store_id", input.store_id);
  if (input.price_uzs != null) form.append("price_uzs", String(input.price_uzs));
  if (input.footprint_w != null) form.append("footprint_w", String(input.footprint_w));
  if (input.footprint_d != null) form.append("footprint_d", String(input.footprint_d));
  return apiClient<AdminFurniture>("/admin/furniture", { method: "POST", body: form });
}

export async function updateAdminFurniture(
  id: string,
  patch: Partial<{
    name_uz: string;
    category: AdminFurnitureCategory;
    room_type: AdminRoomType | null;
    placement: AdminPlacement;
    store_id: string | null;
    price_uzs: number | null;
    footprint_w: number | null;
    footprint_d: number | null;
    is_active: boolean;
  }>,
): Promise<AdminFurniture> {
  return apiClient<AdminFurniture>(`/admin/furniture/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteAdminFurniture(id: string): Promise<void> {
  await apiClient<void>(`/admin/furniture/${id}`, { method: "DELETE" });
}
