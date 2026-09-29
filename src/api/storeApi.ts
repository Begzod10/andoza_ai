import apiClient from '../config/api'

export interface Store {
  id: string
  name: string
  address: string
  phone: string | null
  website: string | null
}

/**
 * Get all stores
 */
export async function getStores(): Promise<Store[]> {
  const response = await apiClient.get<Store[]>('/stores')
  return response.data
}

/**
 * Get single store
 */
export async function getStore(storeId: string): Promise<Store> {
  const response = await apiClient.get<Store>(`/stores/${storeId}`)
  return response.data
}
