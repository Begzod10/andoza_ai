import { apiClient } from "./client";

// ---------- Material types ----------

export interface Material {
  id: string;
  store_id: string;
  category: string;
  name_uz: string;
  unit: string;
  price_uzs: number;
  color_hex: string | null;
  texture_key: string | null;
  pbr_roughness: number;
  /** oboy only: this product's real roll size, when known. Unset falls back
   * to the smeta engine's generic default (1.06 x 10.05 m). */
  roll_width_cm?: number | null;
  roll_length_m?: number | null;
}

export interface MaterialsPage {
  items: Material[];
  total: number;
  page: number;
  per_page: number;
}

export interface MaterialParams {
  category?: string;
  store?: string;
  /** Case-insensitive substring match against the product's name_uz. */
  q?: string;
  page?: number;
  per_page?: number;
}

// ---------- Materials ----------

export async function getMaterials(params: MaterialParams = {}): Promise<Material[]> {
  const query = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    )
  ).toString();
  const page = await apiClient<MaterialsPage>(`/materials${query ? `?${query}` : ""}`);
  return page.items;
}
