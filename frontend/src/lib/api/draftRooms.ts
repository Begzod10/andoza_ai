import { apiClient } from "./client";

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
