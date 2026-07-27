import apiClient from '../config/api'

export interface WallElement {
  type: 'eshik' | 'deraza' | 'balkon'
  width: number
  height: number
  sill_height?: number
  position?: number
}

export interface RoomWall {
  id: string
  length: number
  elements: WallElement[]
}

export interface RoomGeometryData {
  walls: RoomWall[]
  vertices?: [number, number][]
}

export interface Room {
  id: string
  apartment_id: string
  name: string
  room_type: string
  area: number
  ceiling_height: number
  width: number
  length: number
  num_doors: number
  num_windows: number
  has_balcony: boolean
  renovation_level: string
  design_state: Record<string, unknown>
  created_at: string
  ceiling_h?: number | null
  geometry?: RoomGeometryData | null
  surfaces?: Record<string, unknown> | null
  furniture_layout?: unknown[] | null
  state?: Record<string, unknown> | null
  floor_area?: number | null
  net_wall_area?: number | null
  perimeter?: number | null
  openings_count?: number | null
  updated_at?: string | null
}

export interface CreateRoomData {
  name: string
  ceiling_h: number
  geometry: RoomGeometryData
}

export interface UpdateRoomData {
  name?: string
  ceiling_h?: number
  geometry?: RoomGeometryData
  surfaces?: Record<string, unknown>
  furniture_layout?: unknown[]
  state?: Record<string, unknown>
  design_state?: Record<string, unknown>
}

/**
 * Get all rooms in an apartment
 */
export async function getRooms(aptId: string): Promise<Room[]> {
  const response = await apiClient.get<Room[]>(`/apartments/${aptId}/rooms`)
  return response.data
}

/**
 * Create new room
 */
export async function createRoom(aptId: string, data: CreateRoomData): Promise<Room> {
  const response = await apiClient.post<Room>(`/apartments/${aptId}/rooms`, data)
  return response.data
}

/**
 * Get room details
 */
export async function getRoom(roomId: string): Promise<Room> {
  const response = await apiClient.get<Room>(`/rooms/${roomId}`)
  return response.data
}

/**
 * Update room details
 */
export async function updateRoom(roomId: string, data: UpdateRoomData): Promise<Room> {
  const response = await apiClient.patch<Room>(`/rooms/${roomId}`, data)
  return response.data
}

/**
 * Delete room
 */
export async function deleteRoom(roomId: string): Promise<void> {
  await apiClient.delete(`/rooms/${roomId}`)
}
