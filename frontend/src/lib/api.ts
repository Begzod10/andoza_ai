const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000/api/v1";

function handleUnauthorized(): never {
  window.location.href = "/login";
  throw new Error("Unauthorized");
}

// Single in-flight refresh promise guard — prevents parallel token refreshes.
let _refreshPromise: Promise<boolean> | null = null;

async function _tryRefresh(): Promise<boolean> {
  if (_refreshPromise !== null) {
    return _refreshPromise;
  }
  const promise = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      return res.status === 200;
    } finally {
      _refreshPromise = null;
    }
  })();
  _refreshPromise = promise;
  return promise;
}

async function apiClient<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  // A FormData body must set its own Content-Type: only the browser knows the
  // multipart boundary, and forcing JSON here makes the upload unparseable.
  const headers: HeadersInit = {
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string> | undefined),
  };

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: "include",   // send HttpOnly cookie on every request
    headers,
  });

  if (response.status === 401) {
    // Do not recurse into the refresh endpoint itself.
    if (path === "/auth/refresh") {
      handleUnauthorized();
    }

    const refreshed = await _tryRefresh();
    if (!refreshed) {
      handleUnauthorized();
    }

    // Retry the original request once with the same options.
    const retryResponse = await fetch(`${BASE_URL}${path}`, {
      ...options,
      credentials: "include",
      headers,
    });

    if (retryResponse.status === 401) {
      handleUnauthorized();
    }

    if (!retryResponse.ok) {
      const errorBody = await retryResponse.text();
      throw new Error(errorBody || `HTTP ${retryResponse.status}`);
    }

    const retryContentType = retryResponse.headers.get("Content-Type") ?? "";
    if (retryContentType.includes("application/json")) {
      return retryResponse.json() as Promise<T>;
    }
    return retryResponse.text() as unknown as T;
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(errorBody || `HTTP ${response.status}`);
  }

  const contentType = response.headers.get("Content-Type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json() as Promise<T>;
  }

  return response.text() as unknown as T;
}

// ---------- Auth types ----------

export interface AuthUser {
  id: string;
  phone: string | null;
  username: string | null;
  name: string | null;
  /** Admins may delete shared library content (uploaded wallpapers). */
  is_admin?: boolean;
  created_at: string;
}

export interface LoginResponse {
  user: AuthUser;
}

export interface RegisterData {
  username: string;
  password: string;
  name?: string;
}

export interface LoginData {
  username: string;
  password: string;
}

// ---------- Auth ----------

export async function requestOTP(phone: string): Promise<{ message: string }> {
  return apiClient<{ message: string }>("/auth/otp/request", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

export async function verifyOTP(phone: string, code: string): Promise<LoginResponse> {
  return apiClient<LoginResponse>("/auth/otp/verify", {
    method: "POST",
    body: JSON.stringify({ phone, code }),
  });
}

export async function getMe(): Promise<AuthUser> {
  return apiClient<AuthUser>("/auth/me");
}

export async function logoutApi(): Promise<void> {
  await apiClient<void>("/auth/logout", { method: "POST" });
}

export async function registerUser(data: RegisterData): Promise<LoginResponse> {
  return apiClient<LoginResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function loginWithPassword(data: LoginData): Promise<LoginResponse> {
  return apiClient<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ---------- Apartment types ----------

export interface Apartment {
  id: string;
  name: string;
  address: string | null;
  developer: string | null;
  created_at: string;
  rooms?: ApartmentRoom[];
}

export interface ApartmentRoom {
  id: string;
  name: string;
  floor_area: number | null;
  thumbnail_url?: string | null;
}

export interface CreateApartmentData {
  name: string;
  address?: string;
  developer?: string;
}

// ---------- Apartments ----------

export async function getApartments(includeDeleted: boolean = false): Promise<Apartment[]> {
  const url = `/apartments${includeDeleted ? "?include_deleted=true" : ""}`;
  return apiClient<Apartment[]>(url);
}

export async function createApartment(
  data: CreateApartmentData
): Promise<Apartment> {
  return apiClient<Apartment>("/apartments", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ---------- Room types ----------

export interface WallElement {
  type: "eshik" | "deraza" | "balkon";
  width: number;
  height: number;
  sill_height?: number;
  position?: number;
  /** Window type id from the windowStyles catalog. */
  style_id?: string | null;
  /** Casement leaves, for windows saved without a style. */
  sashes?: number | null;
}

export interface RoomWall {
  id: string;
  length: number;
  elements: WallElement[];
}

export interface RoomGeometryData {
  walls: RoomWall[];
  vertices?: [number, number][];
}

export interface Room {
  id: string;
  apartment_id: string;
  name: string;
  // Synthetic fields — always set by StudioPage.localRoom before being consumed
  room_type: string;
  area: number;
  ceiling_height: number;
  width: number;
  length: number;
  num_doors: number;
  num_windows: number;
  has_balcony: boolean;
  renovation_level: string;
  design_state: Record<string, unknown>;
  created_at: string;
  // Backend API fields (RoomOut schema) — all optional/nullable
  ceiling_h?: number | null;
  geometry?: RoomGeometryData | null;
  surfaces?: Record<string, unknown> | null;
  furniture_layout?: unknown[] | null;
  state?: Record<string, unknown> | null;
  floor_area?: number | null;
  net_wall_area?: number | null;
  perimeter?: number | null;
  openings_count?: number | null;
  updated_at?: string | null;
  /** Captured 3D-viewport snapshot, shown as the project-card image. Null until first captured. */
  thumbnail_url?: string | null;
}

export interface CreateRoomData {
  name: string;
  ceiling_h: number;
  geometry: RoomGeometryData;
}

export interface UpdateRoomData {
  name?: string;
  ceiling_h?: number;
  geometry?: RoomGeometryData;
  surfaces?: Record<string, unknown>;
  furniture_layout?: unknown[];
  state?: Record<string, unknown>;
  /** @deprecated use state instead */
  design_state?: Record<string, unknown>;
}

// ---------- Rooms ----------

export async function getRooms(aptId: string): Promise<Room[]> {
  return apiClient<Room[]>(`/apartments/${aptId}/rooms`);
}

export async function createRoom(
  aptId: string,
  data: CreateRoomData
): Promise<Room> {
  return apiClient<Room>(`/apartments/${aptId}/rooms`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getRoom(roomId: string): Promise<Room> {
  return apiClient<Room>(`/rooms/${roomId}`);
}

export async function updateRoom(
  roomId: string,
  data: UpdateRoomData
): Promise<Room> {
  return apiClient<Room>(`/rooms/${roomId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

/** Upload a captured 3D-viewport snapshot (JPEG blob) as the room's project-card thumbnail. */
export async function uploadRoomThumbnail(roomId: string, blob: Blob): Promise<Room> {
  const form = new FormData();
  form.append("file", blob, "thumbnail.jpg");
  return apiClient<Room>(`/rooms/${roomId}/thumbnail`, { method: "POST", body: form });
}

export async function deleteRoom(roomId: string): Promise<void> {
  return apiClient<void>(`/rooms/${roomId}`, {
    method: "DELETE",
  });
}

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

// ---------- Store types ----------

export interface Store {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  website: string | null;
}

// ---------- Stores ----------

export async function getStores(): Promise<Store[]> {
  return apiClient<Store[]>("/stores");
}

// ---------- Regions (viloyat/tuman reference data) ----------

export interface Region {
  name: string;
  code: string;
  districts: string[];
}

/** O'zbekiston viloyatlari va ularning tumanlari — static list, no auth needed. */
export async function listRegions(): Promise<Region[]> {
  return apiClient<Region[]>("/regions");
}

// ---------- Usta types ----------

export interface Usta {
  id: string;
  name: string;
  phone: string;
  telegram: string | null;
  category: string;
  district: string;
  rating: number;
  jobs_count: number;
  price_min: number;
  price_max: number;
  verified: boolean;
  avatar_url?: string | null;
}

export interface UstalarParams {
  specialization?: string;
  region?: string;
  sort?: "rating" | "price_asc" | "price_desc";
  page?: number;
  page_size?: number;
}

// ---------- Ustalar ----------

export async function getUstalar(params: UstalarParams = {}): Promise<Usta[]> {
  const query = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    )
  ).toString();
  return apiClient<Usta[]>(`/ustalar${query ? `?${query}` : ""}`);
}

// ---------- Estimate types ----------

export interface EstimateLine {
  label: string;
  formula: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_uzs: number;
  is_approximate: boolean;
  store_id: string | null;
  category?: string;
}

export interface EstimateResponse {
  id: string;
  room_id: string;
  lines: EstimateLine[];
  total_uzs: number;
  total_min: number;
  total_max: number;
  created_at: string;
  has_electrical: boolean;
  /** so'm-per-1-USD this estimate was converted at (live CBU rate, cached ~1h). */
  usd_rate: number;
  total_usd: number;
}

// ---------- Estimate ----------

export async function createEstimate(
  roomId: string
): Promise<EstimateResponse> {
  return apiClient<EstimateResponse>(`/rooms/${roomId}/estimate`, {
    method: "POST",
  });
}

export async function previewEstimate(roomId: string): Promise<EstimateResponse> {
  return apiClient<EstimateResponse>(`/rooms/${roomId}/estimate/preview`, { method: "POST" });
}

export async function getEstimatePDF(roomId: string): Promise<Blob> {
  const response = await fetch(`${BASE_URL}/rooms/${roomId}/estimate/pdf`, {
    credentials: "include",
    headers: { Accept: "application/pdf" },
  });

  if (response.status === 401) {
    handleUnauthorized();
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.blob();
}

// ---------- Draft Room types ----------

export interface DraftRoom {
  id: string;
  state: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ---------- Draft Rooms ----------

export async function createDraftRoom(
  state: Record<string, unknown> = {}
): Promise<DraftRoom> {
  return apiClient<DraftRoom>("/draft-rooms", {
    method: "POST",
    body: JSON.stringify({ state }),
  });
}

export async function getDraftRoom(id: string): Promise<DraftRoom> {
  return apiClient<DraftRoom>(`/draft-rooms/${id}`);
}

export async function updateDraftRoom(
  id: string,
  state: Record<string, unknown>
): Promise<DraftRoom> {
  return apiClient<DraftRoom>(`/draft-rooms/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ state }),
  });
}

export async function deleteDraftRoom(id: string): Promise<void> {
  await apiClient<void>(`/draft-rooms/${id}`, { method: "DELETE" });
}

// ---------- Lead types ----------

export interface LeadData {
  usta_id: string;
  room_id?: string;
  message?: string;
  contact_phone?: string;
}

export interface LeadResponse {
  id: string;
  status: string;
  created_at: string;
}

// ---------- Lead ----------

export async function createLead(data: LeadData): Promise<LeadResponse> {
  return apiClient<LeadResponse>("/leads", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ---------- AI types ----------

export type AiBuildEventType = "thinking" | "tool_call" | "tool_result" | "done" | "error";

export interface AiBuildEvent {
  type: AiBuildEventType;
  text?: string;
  name?: string;
  args?: Record<string, unknown>;
  ok?: boolean;
  result?: string;
  summary?: string;
  patch?: AiRoomPatch;
  message?: string;
}

export interface AiRoomPatch {
  ceiling_h?: number;
  wall_lengths?: Record<string, number>;
  surfaces?: Record<string, string>;
  material_colors?: Record<string, string>;
  furniture?: Array<{
    id: string;
    furniture_id: string;
    x: number;
    y: number;
    rotation: number;
  }>;
}

export interface SmetaAskResponse {
  answer_uz: string;
  related_line_ids: string[];
}

// ---------- AI endpoints ----------

export async function* aiBuildStream(
  roomId: string,
  prompt: string
): AsyncGenerator<AiBuildEvent> {
  const response = await fetch(`${BASE_URL}/rooms/${roomId}/ai-build`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  if (response.status === 401) handleUnauthorized();
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      if (part.startsWith("data: ")) {
        try {
          yield JSON.parse(part.slice(6)) as AiBuildEvent;
        } catch {
          // skip malformed line
        }
      }
    }
  }
}

export async function smetaAsk(
  roomId: string,
  question: string
): Promise<SmetaAskResponse> {
  return apiClient<SmetaAskResponse>(`/rooms/${roomId}/smeta/ask`, {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}

// ---------- Meshy types ----------

export interface ConvertImageTo3DRequest {
  image_url: string;
  enable_pbr?: boolean;
  wait_for_completion?: boolean;
}

export interface ConvertImageTo3DResponse {
  task_id: string;
  status: string; // 'RUNNING' | 'SUCCEEDED' | 'FAILED'
  model_urls: Record<string, string>;
  message: string;
}

export interface TaskStatusResponse {
  task_id: string;
  status: string;
  model_urls: Record<string, string>;
  error: string;
}

// ---------- Meshy endpoints ----------

export async function convertImageTo3D(
  req: ConvertImageTo3DRequest
): Promise<ConvertImageTo3DResponse> {
  const MESHY_BASE_URL = "/api/meshy"; // Direct path without /api/v1 prefix
  return apiClient<ConvertImageTo3DResponse>(`${MESHY_BASE_URL}/convert`, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function getMeshyTaskStatus(
  taskId: string
): Promise<TaskStatusResponse> {
  const MESHY_BASE_URL = "/api/meshy";
  return apiClient<TaskStatusResponse>(`${MESHY_BASE_URL}/task/${taskId}`, {
    method: "GET",
  });
}

export async function waitForMeshyTask(
  taskId: string
): Promise<ConvertImageTo3DResponse> {
  const MESHY_BASE_URL = "/api/meshy";
  return apiClient<ConvertImageTo3DResponse>(`${MESHY_BASE_URL}/wait/${taskId}`, {
    method: "POST",
  });
}

// ---------- Wallpapers (shared oboy library) ----------

export interface Wallpaper {
  id: string;
  name: string;
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
 * are excluded when set. Omit to get the whole library. */
export async function listWallpapers(params: { store_id?: string } = {}): Promise<Wallpaper[]> {
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
