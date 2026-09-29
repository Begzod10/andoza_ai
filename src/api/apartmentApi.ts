import apiClient from '../config/api'

export interface ApartmentRoom {
  id: string
  name: string
  floor_area: number | null
}

export interface Apartment {
  id: string
  name: string
  address: string | null
  developer: string | null
  created_at: string
  rooms?: ApartmentRoom[]
}

export interface CreateApartmentData {
  name: string
  address?: string
  developer?: string
}

/**
 * Get all apartments for current user
 */
export async function getApartments(includeDeleted: boolean = false): Promise<Apartment[]> {
  const url = `/apartments${includeDeleted ? '?include_deleted=true' : ''}`
  const response = await apiClient.get<Apartment[]>(url)
  return response.data
}

/**
 * Create new apartment
 */
export async function createApartment(data: CreateApartmentData): Promise<Apartment> {
  const response = await apiClient.post<Apartment>('/apartments', data)
  return response.data
}

/**
 * Get apartment details
 */
export async function getApartment(aptId: string): Promise<Apartment> {
  const response = await apiClient.get<Apartment>(`/apartments/${aptId}`)
  return response.data
}

/**
 * Update apartment details
 */
export async function updateApartment(
  aptId: string,
  data: Partial<CreateApartmentData>
): Promise<Apartment> {
  const response = await apiClient.patch<Apartment>(`/apartments/${aptId}`, data)
  return response.data
}

/**
 * Delete apartment
 */
export async function deleteApartment(aptId: string): Promise<void> {
  await apiClient.delete(`/apartments/${aptId}`)
}
