import { apiClient } from "./client";
import { LIGHT_TYPES } from "../lightCatalog";

// ---------- Admin: materials (shop products used by the room estimate) ----------
//
// Mirrors backend/app/schemas/admin_materials.py. Admin-only (403 otherwise).
// Materials are never deleted — hiding is `is_active: false`.

export interface AdminMaterial {
  id: string;
  store_id: string;
  store_name: string | null;
  category: string;
  name_uz: string;
  unit: string;
  price_uzs: number;
  pack_qty: number | null;
  pack_unit: string | null;
  smeta_key: string | null;
  roll_width_cm: number | null;
  roll_length_m: number | null;
  color_hex: string | null;
  image_url: string | null;
  is_active: boolean;
}

export interface MaterialInput {
  store_id: string;
  category: string;
  name_uz: string;
  unit: string;
  price_uzs: number;
  pack_qty?: number | null;
  pack_unit?: string | null;
  smeta_key?: string | null;
  roll_width_cm?: number | null;
  roll_length_m?: number | null;
}

export interface AdminMaterialsPage {
  items: AdminMaterial[];
  total: number;
  page: number;
  per_page: number;
}

export interface AdminMaterialsQuery {
  category?: string;
  store_id?: string;
  smeta?: boolean;
  q?: string;
  page?: number;
}

export async function listAdminMaterials(
  params: AdminMaterialsQuery = {},
): Promise<AdminMaterialsPage> {
  const qs = new URLSearchParams();
  if (params.category) qs.set("category", params.category);
  if (params.store_id) qs.set("store_id", params.store_id);
  if (params.smeta) qs.set("smeta", "true");
  if (params.q) qs.set("q", params.q);
  if (params.page) qs.set("page", String(params.page));
  const s = qs.toString();
  return apiClient<AdminMaterialsPage>(`/admin/materials${s ? `?${s}` : ""}`);
}

export async function createAdminMaterial(input: MaterialInput): Promise<AdminMaterial> {
  return apiClient<AdminMaterial>("/admin/materials", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateAdminMaterial(
  id: string,
  patch: Partial<MaterialInput> & { is_active?: boolean },
): Promise<AdminMaterial> {
  return apiClient<AdminMaterial>(`/admin/materials/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export const MATERIAL_CATEGORIES: { id: string; label: string }[] = [
  { id: "boyoq", label: "Bo'yoq" },
  { id: "oboy", label: "Oboy" },
  { id: "dekorativ", label: "Dekorativ" },
  { id: "laminat", label: "Laminat" },
  { id: "parket", label: "Parket" },
  { id: "plitka", label: "Plitka" },
  { id: "eshik", label: "Eshik" },
  { id: "deraza", label: "Deraza" },
  { id: "gips", label: "Gips" },
  { id: "sement", label: "Sement" },
  { id: "santexnika", label: "Santexnika" },
  { id: "elektr_mat", label: "Elektr" },
];

export const MATERIAL_UNITS: { id: string; label: string }[] = [
  { id: "litr", label: "litr" },
  { id: "rulon", label: "rulon" },
  { id: "m2", label: "m²" },
  { id: "qop", label: "qop" },
  { id: "dona", label: "dona" },
  { id: "m", label: "m" },
  { id: "komplekt", label: "komplekt" },
];

/** Pack units the backend accepts (a pydantic pattern; anything else is a 422). */
export const PACK_UNITS: { id: string; label: string }[] = [
  { id: "kg", label: "kg" },
  { id: "litr", label: "litr" },
  { id: "m", label: "m" },
  { id: "m2", label: "m²" },
  { id: "dona", label: "dona" },
];

export interface SmetaKeyOption {
  id: string;
  label: string;
  /** Pack unit the key needs; null when it has none. */
  packUnit: string | null;
  /** Sale unit the key is restricted to, when it has one. */
  unit?: string;
}

// Mirrors backend/app/services/smeta_keys.py.
export const SMETA_KEYS: SmetaKeyOption[] = [
  { id: "suvoq", label: "Suvoq", packUnit: "kg" },
  { id: "grunt", label: "Grunt", packUnit: "kg" },
  { id: "shpatlyovka", label: "Shpatlyovka", packUnit: "kg" },
  { id: "plintus", label: "Plintus", packUnit: "m" },
  { id: "gipsokarton", label: "Gipsokarton", packUnit: "m2" },
  { id: "profil", label: "Profil", packUnit: "m" },
  { id: "led_lenta", label: "LED lenta", packUnit: "m" },
  { id: "kabel", label: "Kabel", packUnit: null, unit: "m" },
  { id: "galtel", label: "Galtel", packUnit: "m" },
  ...LIGHT_TYPES.map((t) => ({
    id: `light:${t.id}`,
    label: `Chiroq: ${t.name}`,
    packUnit: null,
    unit: "dona",
  })),
];
