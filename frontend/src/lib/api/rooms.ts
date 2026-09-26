import { apiClient } from "./client";

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

/** One furniture/appliance object detected by the LiDAR RoomPlan scan.
 *  Coordinates are METRES on the app floor plane (x,y), origin at the room
 *  bbox min corner — the SAME convention as `room.geometry.vertices`.
 *  `rotation` is yaw in radians; `width`/`depth`/`height` are the footprint
 *  and height in metres. */
export interface RoomScanObject {
  category:
    | "table" | "chair" | "sofa" | "bed" | "storage" | "refrigerator"
    | "stove" | "sink" | "toilet" | "bathtub" | "washer" | "television"
    | "fireplace" | "stairs" | "other";
  x: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  rotation: number;
  confidence: string;
  /** Per-object photogrammetry scan (Phase 6). Null/absent when this object
   *  was not individually scanned. When `glb_path` is set,
   *  GET /rooms/{id}/room-scan/objects/{index}/model.glb streams it (auth). */
  usdz_path?: string | null;
  glb_path?: string | null;
}

/** LiDAR room-scan metadata attached to `RoomOut` for scanned (RoomPlan)
 *  rooms. Absent/null for manually-built rooms. Mirrors the backend's
 *  `room_scan` field (Phase 4). */
export interface RoomScan {
  source: "lidar";
  roomplan_version: string;
  scanned_at: string;
  usdz_path: string;
  /** Object-storage key for the streamable GLB, or null until it's produced.
   *  When set, GET /rooms/{id}/room-scan/model.glb streams it (auth cookie). */
  glb_path: string | null;
  object_count: number;
  objects: RoomScanObject[];
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
  /** LiDAR RoomPlan scan data — present only for scanned rooms (Phase 4/5). */
  room_scan?: RoomScan | null;
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

// ---------- Room sharing (public read-only links) ----------

export interface ShareLinkData {
  share_token: string;
}

/** Owner-only. Idempotent: returns the room's existing token if it already has one. */
export async function createShareLink(roomId: string): Promise<ShareLinkData> {
  return apiClient<ShareLinkData>(`/rooms/${roomId}/share`, {
    method: "POST",
  });
}

/** Owner-only. Clears the room's share token; any outstanding link 404s afterwards. */
export async function revokeShareLink(roomId: string): Promise<void> {
  return apiClient<void>(`/rooms/${roomId}/share`, {
    method: "DELETE",
  });
}

/**
 * Read-only room shape served by GET /public/rooms/{token} — no auth.
 * Deliberately NOT the full Room type: no id, no apartment_id, no owner
 * reference, just enough to render the 3D view (see SharedRoomPage).
 */
export interface PublicRoom {
  name: string;
  ceiling_h: number | null;
  geometry: RoomGeometryData | null;
  surfaces: Record<string, unknown> | null;
  /** Trimmed subset of Room.state: designState/furniture/electricals/lights only. */
  state: Record<string, unknown> | null;
}

export async function getPublicRoom(token: string): Promise<PublicRoom> {
  return apiClient<PublicRoom>(`/public/rooms/${encodeURIComponent(token)}`);
}
