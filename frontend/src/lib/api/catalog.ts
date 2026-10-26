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
  /** Centimetres; null for models uploaded before it was measured. */
  height_cm?: number | null;
  /** Styles the model suits; empty = every style. Absent in older cached responses. */
  styles?: string[];
  /** Degrees (0/90/180/270) to turn the GLB about +Y so its back is on -Z (see lib/modelYaw).
   * footprint_w/footprint_d are already the turned size. Absent in older cached responses. */
  model_yaw?: number;
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
  /** Name search, done on the server so it covers every page. */
  q?: string;
  /** Only pieces with a 3-D model — what the studio can place. */
  has_model?: boolean;
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
