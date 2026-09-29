import apiClient from '../config/api'

export interface DraftRoom {
  id: string
  state: Record<string, unknown>
  created_at: string
  updated_at: string
}

/**
 * Create new draft room
 */
export async function createDraftRoom(state: Record<string, unknown> = {}): Promise<DraftRoom> {
  const response = await apiClient.post<DraftRoom>('/draft-rooms', { state })
  return response.data
}

/**
 * Get draft room by ID
 */
export async function getDraftRoom(id: string): Promise<DraftRoom> {
  const response = await apiClient.get<DraftRoom>(`/draft-rooms/${id}`)
  return response.data
}

/**
 * Update draft room state
 */
export async function updateDraftRoom(
  id: string,
  state: Record<string, unknown>
): Promise<DraftRoom> {
  const response = await apiClient.patch<DraftRoom>(`/draft-rooms/${id}`, { state })
  return response.data
}

/**
 * Delete draft room
 */
export async function deleteDraftRoom(id: string): Promise<void> {
  await apiClient.delete(`/draft-rooms/${id}`)
}

/**
 * Get all draft rooms
 */
export async function getDraftRooms(): Promise<DraftRoom[]> {
  const response = await apiClient.get<DraftRoom[]>('/draft-rooms')
  return response.data
}
