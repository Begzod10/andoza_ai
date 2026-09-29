// User & Auth
export interface User {
  id: string
  username: string
  name: string | null
  phone: string | null
  created_at: string
}

export interface LoginResponse {
  user: User
  access_token: string
}

// Project & Room
export interface Project {
  id: string
  user_id: string
  name: string
  address?: string
  developer?: string
  created_at: string
  updated_at?: string
}

export interface Room {
  id: string
  project_id: string
  name: string
  ceiling_h: number // mm
  floor_area?: number // m²
  net_wall_area?: number // m² (excluding openings)
  perimeter?: number // m
  created_at: string
  updated_at?: string
}

// Room Measurement
export interface Wall {
  id: string
  direction: 'A' | 'B' | 'C' | 'D'
  length: number // m
  openings: Opening[]
}

export interface Opening {
  id: string
  type: 'eshik' | 'deraza' | 'balkon_eshigi'
  width: number // m
  height: number // m
  position: number // m from wall start
}

export interface RoomMeasurement {
  room_id: string
  walls: Wall[]
  height: number // m (ceiling)
  floor_area: number // m²
  wall_area_netto: number // m² (minus openings)
  perimeter: number // m
}

// Room State
export type RoomStateType = 'korobka' | 'suvoq' | 'shpaklovka'
export type SurfaceState = 'xom' | 'suvoq' | 'tayyor'

export interface RoomState {
  room_id: string
  current_state: RoomStateType
  floor_state?: SurfaceState
  ceiling_state?: SurfaceState
  created_at: string
  updated_at: string
}

// Materials & Decoration
export interface Material {
  id: string
  type: 'paint' | 'wallpaper' | 'tile' | 'laminate' | 'parquet'
  name: string
  color?: string
  pattern?: string
  image_url?: string
}

export interface WallFinish {
  room_id: string
  wall_id: string
  material: Material
  applied_at: string
}

// Furniture
export interface Furniture {
  id: string
  name: string
  category: 'mehmonxona' | 'oshxona' | 'yotoqxona' | 'vanna'
  width: number // cm
  depth: number // cm
  height: number // cm
  image_url?: string
  colors: string[]
}

export interface PlacedFurniture {
  id: string
  room_id: string
  furniture_id: string
  position: { x: number; y: number }
  rotation: number // degrees
  color: string
  placed_at: string
}

// Electrical & Plumbing
export type DeviceType = 'box' | 'socket' | 'switch' | 'light' | 'plumbing'
export type DeviceVariant =
  | 'single_socket'
  | 'double_socket'
  | 'single_switch'
  | 'double_switch'
  | 'sensor_switch'
  | 'chandelier'
  | 'spot'
  | 'strip'
  | 'faucet'
  | 'toilet'
  | 'shower'

export interface ElectricalDevice {
  id: string
  room_id: string
  type: DeviceType
  variant?: DeviceVariant
  wall?: 'A' | 'B' | 'C' | 'D' | 'ceiling'
  height: number // cm from ground
  position: number // offset along wall (m)
  color?: string
  placed_at: string
}

export interface ElectricalPlan {
  room_id: string
  devices: ElectricalDevice[]
  total_wire_length: number // m
  wire_by_type: Record<string, number> // "socket" -> 71.82
  conduit_needed: number // m (gofra)
  device_count: number
  calculated_at: string
}

// Estimate / Cost
export interface EstimateLine {
  id: string
  description: string
  quantity: number
  unit: string
  unit_price: number // som
  total: number // som
}

export interface Estimate {
  room_id: string
  lines: EstimateLine[]
  subtotal: number
  tax?: number
  total: number
  created_at: string
}

// App State
export interface AppState {
  activeProjectId?: string
  activeRoomId?: string
  activeRoomState?: RoomState
  currentStage: number // 0-7 for decoration, 8 for electrical
}

// Stage tracking (for delta visualization)
export const STAGES = [
  { id: 0, name: 'Suvoq', uz: 'Suvoq' },
  { id: 1, name: 'Shpaklovka', uz: 'Shpaklovka' },
  { id: 2, name: 'Bo\'yoq/Oboi', uz: 'Bo\'yoq/Oboi' },
  { id: 3, name: 'Pol', uz: 'Pol' },
  { id: 4, name: 'Mebel', uz: 'Mebel' },
  { id: 5, name: 'Elektr', uz: 'Elektr' },
  { id: 6, name: 'Yorug\'lik', uz: 'Yorug\'lik' },
  { id: 7, name: 'Santexnika', uz: 'Santexnika' },
] as const
