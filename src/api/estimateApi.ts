import apiClient from '../config/api'

export interface EstimateLine {
  label: string
  formula: string
  quantity: number
  unit: string
  unit_price: number
  total_uzs: number
  is_approximate: boolean
  store_id: string | null
  category?: string
}

export interface EstimateResponse {
  id: string
  room_id: string
  lines: EstimateLine[]
  total_uzs: number
  total_min: number
  total_max: number
  created_at: string
  has_electrical: boolean
}

/**
 * Create estimate for room
 */
export async function createEstimate(roomId: string): Promise<EstimateResponse> {
  const response = await apiClient.post<EstimateResponse>(`/rooms/${roomId}/estimate`)
  return response.data
}

/**
 * Preview estimate without saving
 */
export async function previewEstimate(roomId: string): Promise<EstimateResponse> {
  const response = await apiClient.post<EstimateResponse>(`/rooms/${roomId}/estimate/preview`)
  return response.data
}

/**
 * Get estimate PDF (returns blob)
 */
export async function getEstimatePDF(roomId: string): Promise<Blob> {
  const response = await apiClient.get<Blob>(`/rooms/${roomId}/estimate/pdf`, {
    responseType: 'blob',
  })
  return response.data
}

/**
 * Get estimate by ID
 */
export async function getEstimate(estimateId: string): Promise<EstimateResponse> {
  const response = await apiClient.get<EstimateResponse>(`/estimates/${estimateId}`)
  return response.data
}

/**
 * Get all estimates for room
 */
export async function getRoomEstimates(roomId: string): Promise<EstimateResponse[]> {
  const response = await apiClient.get<EstimateResponse[]>(`/rooms/${roomId}/estimates`)
  return response.data
}
