import { apiClient } from "./client";

// ---------- Furniture (public catalog — do'kon-managed 3D models) ----------

/** A shop-managed 3D model as the public catalog serves it — mirrors
 * `FurnitureOut` in `backend/app/schemas/catalog.py`. This is what the
 * Studio's "3D Modellar" panel merges in alongside the built-in and
 * user-imported models. */
export interface CatalogFurniture {
  id: string;
  store_id: string | null;
  store_name: string | null;
  category: string;
  room_type: string | null;
  placement: "pol" | "devor" | "shift";
  name_uz: string;
  price_uzs: number | null;
  glb_url: string | null;
  thumbnail_url: string | null;
  footprint_w: number | null;
  footprint_d: number | null;
}

export interface PaginatedCatalogFurniture {
  items: CatalogFurniture[];
  total: number;
  page: number;
  per_page: number;
}

export interface CatalogFurnitureParams {
  category?: string;
  room_type?: string;
  page?: number;
  per_page?: number;
}

export async function listCatalogFurniture(
  params: CatalogFurnitureParams = {}
): Promise<PaginatedCatalogFurniture> {
  const query = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    )
  ).toString();
  return apiClient<PaginatedCatalogFurniture>(`/furniture${query ? `?${query}` : ""}`);
}
