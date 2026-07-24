import apiClient from '../config/api'
import { RoomState, RoomStateType } from '../types'

/**
 * Fetch current room state
 */
export async function getRoomState(roomId: string): Promise<RoomState> {
  const response = await apiClient.get<RoomState>(`/rooms/${roomId}/state`)
  return response.data
}

/**
 * Update room state (condition selection)
 */
export async function updateRoomState(
  roomId: string,
  currentState: RoomStateType
): Promise<RoomState> {
  const response = await apiClient.post<RoomState>(`/rooms/${roomId}/state`, {
    current_state: currentState,
  })
  return response.data
}

/**
 * Update floor state
 */
export async function updateFloorState(
  roomId: string,
  floorState: 'xom' | 'suvoq' | 'tayyor'
): Promise<RoomState> {
  const response = await apiClient.patch<RoomState>(`/rooms/${roomId}/state`, {
    floor_state: floorState,
  })
  return response.data
}

/**
 * Update ceiling state
 */
export async function updateCeilingState(
  roomId: string,
  ceilingState: 'xom' | 'suvoq' | 'tayyor'
): Promise<RoomState> {
  const response = await apiClient.patch<RoomState>(`/rooms/${roomId}/state`, {
    ceiling_state: ceilingState,
  })
  return response.data
}
