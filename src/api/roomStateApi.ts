import apiClient from '../config/api'
import { RoomState, RoomStateType } from '../types'

export type ConditionState = 'xom' | 'suvoq' | 'tayyor'

/**
 * Fetch current room state (condition/renovation level)
 */
export async function getRoomState(roomId: string): Promise<RoomState> {
  const response = await apiClient.get<RoomState>(`/rooms/${roomId}/state`)
  return response.data
}

/**
 * Update room overall condition state
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
 * Update floor condition state
 */
export async function updateFloorState(
  roomId: string,
  floorState: ConditionState
): Promise<RoomState> {
  const response = await apiClient.patch<RoomState>(`/rooms/${roomId}/state`, {
    floor_state: floorState,
  })
  return response.data
}

/**
 * Update ceiling condition state
 */
export async function updateCeilingState(
  roomId: string,
  ceilingState: ConditionState
): Promise<RoomState> {
  const response = await apiClient.patch<RoomState>(`/rooms/${roomId}/state`, {
    ceiling_state: ceilingState,
  })
  return response.data
}

/**
 * Update walls condition state
 */
export async function updateWallsState(
  roomId: string,
  wallsState: ConditionState
): Promise<RoomState> {
  const response = await apiClient.patch<RoomState>(`/rooms/${roomId}/state`, {
    walls_state: wallsState,
  })
  return response.data
}
