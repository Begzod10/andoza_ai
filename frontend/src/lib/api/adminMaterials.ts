import { apiClient } from "./client";
import type { TKey } from "@/i18n";
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
  /** False when the shop is closed, pending or rejected: users don't see the product. */
  store_open?: boolean;
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

/** An option of an admin select: `labelKey` is translated while rendering (never at module load). */
export interface LabelledOption {
  id: string;
  labelKey: TKey;
}

export const MATERIAL_CATEGORIES: LabelledOption[] = [
  { id: "boyoq", labelKey: "dokon.admin.category.boyoq" },
  { id: "oboy", labelKey: "dokon.admin.category.oboy" },
  { id: "dekorativ", labelKey: "dokon.admin.category.dekorativ" },
  { id: "laminat", labelKey: "dokon.admin.category.laminat" },
  { id: "parket", labelKey: "dokon.admin.category.parket" },
  { id: "plitka", labelKey: "dokon.admin.category.plitka" },
  { id: "eshik", labelKey: "dokon.admin.category.eshik" },
  { id: "deraza", labelKey: "dokon.admin.category.deraza" },
  { id: "gips", labelKey: "dokon.admin.category.gips" },
  { id: "sement", labelKey: "dokon.admin.category.sement" },
  { id: "santexnika", labelKey: "dokon.admin.category.santexnika" },
  { id: "elektr_mat", labelKey: "dokon.admin.category.elektr_mat" },
  { id: "ldsp", labelKey: "dokon.admin.category.ldsp" },
  { id: "mdf", labelKey: "dokon.admin.category.mdf" },
  { id: "hdf", labelKey: "dokon.admin.category.hdf" },
  { id: "kromka", labelKey: "dokon.admin.category.kromka" },
  { id: "furnitura", labelKey: "dokon.admin.category.furnitura" },
];

export const MATERIAL_UNITS: LabelledOption[] = [
  { id: "litr", labelKey: "dokon.admin.unit.litr" },
  { id: "rulon", labelKey: "dokon.admin.unit.rulon" },
  { id: "m2", labelKey: "dokon.admin.unit.m2" },
  { id: "qop", labelKey: "dokon.admin.unit.qop" },
  { id: "dona", labelKey: "dokon.admin.unit.dona" },
  { id: "m", labelKey: "dokon.admin.unit.m" },
  { id: "komplekt", labelKey: "dokon.admin.unit.komplekt" },
];

/** Pack units the backend accepts (a pydantic pattern; anything else is a 422). */
export const PACK_UNITS: LabelledOption[] = [
  { id: "kg", labelKey: "dokon.admin.unit.kg" },
  { id: "litr", labelKey: "dokon.admin.unit.litr" },
  { id: "m", labelKey: "dokon.admin.unit.m" },
  { id: "m2", labelKey: "dokon.admin.unit.m2" },
  { id: "dona", labelKey: "dokon.admin.unit.dona" },
];

export interface SmetaKeyOption extends LabelledOption {
  /** Light fixtures read "Chiroq: <name>": `labelKey` is then the fixture's own name. */
  light?: boolean;
  /** Pack unit the key needs; null when it has none. */
  packUnit: string | null;
  /** Sale unit the key is restricted to, when it has one. */
  unit?: string;
}

// Mirrors backend/app/services/smeta_keys.py.
export const SMETA_KEYS: SmetaKeyOption[] = [
  { id: "suvoq", labelKey: "dokon.admin.smeta_key.suvoq", packUnit: "kg" },
  { id: "grunt", labelKey: "dokon.admin.smeta_key.grunt", packUnit: "kg" },
  { id: "shpatlyovka", labelKey: "dokon.admin.smeta_key.shpatlyovka", packUnit: "kg" },
  { id: "plintus", labelKey: "dokon.admin.smeta_key.plintus", packUnit: "m" },
  { id: "gipsokarton", labelKey: "dokon.admin.smeta_key.gipsokarton", packUnit: "m2" },
  { id: "profil", labelKey: "dokon.admin.smeta_key.profil", packUnit: "m" },
  { id: "led_lenta", labelKey: "dokon.admin.smeta_key.led_lenta", packUnit: "m" },
  { id: "kabel", labelKey: "dokon.admin.smeta_key.kabel", packUnit: null, unit: "m" },
  { id: "galtel", labelKey: "dokon.admin.smeta_key.galtel", packUnit: "m" },
  ...LIGHT_TYPES.map((t) => ({
    id: `light:${t.id}`,
    labelKey: t.nameKey,
    light: true,
    packUnit: null,
    unit: "dona",
  })),
];
