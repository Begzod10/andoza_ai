import { apiClient } from "./client";

// ---------- User-imported 3D models ----------
//
// The durable copy of a studio import. The browser keeps its IndexedDB copy
// for instant loads; this is what brings a model back after cleared site
// data or on another device. Personal, not shared: every route acts on the
// current user's own models only.

export interface UserModelOut {
  id: string;
  name: string;
  category: string | null;
  placement: string | null;
  price_uzs: number | null;
  scale: number;
  size_w_m: number;
  size_d_m: number;
  size_h_m: number;
  has_textures: boolean;
  /** Absolute URL — fetched straight into the GLB loader. */
  url: string;
  thumbnail_url: string | null;
  content_type: string;
  size_bytes: number;
  created_at: string;
}

export async function listUserModels(): Promise<UserModelOut[]> {
  return apiClient<UserModelOut[]>("/user-models");
}

/** Upload a converted GLB (with its rendered JPEG preview when there is one).
 * Re-uploading the same bytes returns the existing entry, metadata refreshed. */
export async function uploadUserModel(
  file: Blob,
  meta: {
    name: string;
    scale: number;
    size_w_m: number;
    size_d_m: number;
    size_h_m: number;
    has_textures: boolean;
    category?: string;
    placement?: string;
    price_uzs?: number;
  },
  thumbnail?: Blob,
): Promise<UserModelOut> {
  const form = new FormData();
  form.append("file", file, "model.glb");
  form.append("name", meta.name);
  form.append("scale", String(meta.scale));
  form.append("size_w_m", String(meta.size_w_m));
  form.append("size_d_m", String(meta.size_d_m));
  form.append("size_h_m", String(meta.size_h_m));
  form.append("has_textures", String(meta.has_textures));
  if (meta.category) form.append("category", meta.category);
  if (meta.placement) form.append("placement", meta.placement);
  if (meta.price_uzs != null) form.append("price_uzs", String(meta.price_uzs));
  if (thumbnail) form.append("thumbnail", thumbnail, "thumb.jpg");
  return apiClient<UserModelOut>("/user-models", { method: "POST", body: form });
}

export async function updateUserModel(
  id: string,
  patch: Partial<{ name: string; category: string; placement: string; price_uzs: number }>,
): Promise<UserModelOut> {
  return apiClient<UserModelOut>(`/user-models/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteUserModel(id: string): Promise<void> {
  await apiClient<void>(`/user-models/${id}`, { method: "DELETE" });
}
