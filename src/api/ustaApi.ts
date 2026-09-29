import apiClient from '../config/api'

export interface Usta {
  id: string
  name: string
  phone: string
  telegram: string | null
  category: string
  district: string
  rating: number
  jobs_count: number
  price_min: number
  price_max: number
  verified: boolean
  avatar_url?: string | null
}

export interface UstalarParams {
  specialization?: string
  region?: string
  sort?: 'rating' | 'price_asc' | 'price_desc'
  page?: number
  page_size?: number
}

/**
 * Get contractors (ustalar) with optional filtering
 */
export async function getUstalar(params: UstalarParams = {}): Promise<Usta[]> {
  const query = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    )
  ).toString()

  const response = await apiClient.get<Usta[]>(
    `/ustalar${query ? `?${query}` : ''}`
  )
  return response.data
}

/**
 * Get contractors by specialization
 */
export async function getUstalarBySpecialization(specialization: string): Promise<Usta[]> {
  return getUstalar({ specialization })
}

/**
 * Get contractors by region
 */
export async function getUstalarByRegion(region: string): Promise<Usta[]> {
  return getUstalar({ region })
}

/**
 * Get single contractor
 */
export async function getUsta(ustaId: string): Promise<Usta> {
  const response = await apiClient.get<Usta>(`/ustalar/${ustaId}`)
  return response.data
}
