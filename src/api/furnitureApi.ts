import apiClient from '../config/api'

export interface Furniture {
  id: string
  name: string
  category: string
  width: number
  depth: number
  height: number
  model_url: string | null
  thumbnail_url: string | null
  price: number
}

export interface FurnitureParams {
  category?: string
  search?: string
  page?: number
  page_size?: number
}

/**
 * Get furniture with optional filtering and pagination
 */
export async function getFurniture(params: FurnitureParams = {}): Promise<Furniture[]> {
  const query = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    )
  ).toString()

  const response = await apiClient.get<Furniture[]>(
    `/furniture${query ? `?${query}` : ''}`
  )
  return response.data
}

/**
 * Get furniture by category
 */
export async function getFurnitureByCategory(category: string): Promise<Furniture[]> {
  return getFurniture({ category })
}

/**
 * Search furniture by name
 */
export async function searchFurniture(query: string): Promise<Furniture[]> {
  return getFurniture({ search: query })
}

/**
 * Get single furniture item
 */
export async function getFurnitureItem(furnitureId: string): Promise<Furniture> {
  const response = await apiClient.get<Furniture>(`/furniture/${furnitureId}`)
  return response.data
}
