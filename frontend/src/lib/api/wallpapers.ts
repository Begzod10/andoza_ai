import { apiClient } from "./client";

// ---------- Wallpapers (shared oboy library) ----------

/**
 * Which panel an image was uploaded from: a pattern, a bare wall surface, or a
 * filled-and-sanded one. Suvoq and shpaklovka are different phases of the same
 * wall, so a photo of one is no use as the other.
 */
export type WallpaperKind = "oboy" | "suvoq" | "shpaklovka";

export interface Wallpaper {
  id: string;
  name: string;
  /** Design-panel scope bucket (oboy|suvoq|shpaklovka|pol); null for legacy rows. */
  kind: string | null;
  store_id: string | null;
  store_name: string | null;
  price_uzs: number | null;
  description: string | null;
  /** Roll/panel width, cm. */
  width_cm: number | null;
  /** Fixed panel height, cm — mural-style oboy sold as one piece. */
  height_cm: number | null;
  /** Total roll length in stock, metres — repeating-pattern oboy sold by the metre. */
  total_length_m: number | null;
  /** Absolute URL — loaded straight into a WebGL texture. */
  url: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
}

/** Every wallpaper anyone has uploaded. The library is global and permanent. */
/** `store_id` filters to one shop's oboy — global library entries (no shop)
 * are excluded when set. `kind` filters to one design-panel scope bucket
 * (oboy|suvoq|shpaklovka|pol) so each studio panel only sees its own images.
 * Omit both to get the whole library. */
export async function listWallpapers(params: { store_id?: string; kind?: string } = {}): Promise<Wallpaper[]> {
  const query = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)) as Record<string, string>,
  ).toString();
  return apiClient<Wallpaper[]>(`/wallpapers${query ? `?${query}` : ""}`);
}

/** Upload an image to the shared library. Re-uploading one returns the existing entry. */
export async function uploadWallpaper(
  file: File,
  meta?: {
    name?: string;
    /** Design-panel scope bucket (oboy|suvoq|shpaklovka|pol) the image belongs to. */
    kind?: string;
    store_id?: string;
    price_uzs?: number;
    description?: string;
    width_cm?: number;
    height_cm?: number;
    total_length_m?: number;
  },
): Promise<Wallpaper> {
  const form = new FormData();
  form.append("file", file);
  if (meta?.name) form.append("name", meta.name);
  if (meta?.kind) form.append("kind", meta.kind);
  if (meta?.store_id) form.append("store_id", meta.store_id);
  if (meta?.price_uzs != null) form.append("price_uzs", String(meta.price_uzs));
  if (meta?.description) form.append("description", meta.description);
  if (meta?.width_cm != null) form.append("width_cm", String(meta.width_cm));
  if (meta?.height_cm != null) form.append("height_cm", String(meta.height_cm));
  if (meta?.total_length_m != null) form.append("total_length_m", String(meta.total_length_m));
  return apiClient<Wallpaper>("/wallpapers", { method: "POST", body: form });
}

/** Admins only — 403 otherwise. */
export async function deleteWallpaper(id: string): Promise<void> {
  await apiClient<void>(`/wallpapers/${id}`, { method: "DELETE" });
}

/** Admins only — 403 otherwise. The image itself isn't editable — delete
 * and re-upload instead. */
export async function updateWallpaper(
  id: string,
  patch: Partial<{
    name: string;
    store_id: string | null;
    price_uzs: number | null;
    description: string | null;
    width_cm: number | null;
    height_cm: number | null;
    total_length_m: number | null;
  }>,
): Promise<Wallpaper> {
  return apiClient<Wallpaper>(`/wallpapers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
