import apiClient from '../config/api'

export interface Material {
  id: string
  store_id: string
  category: string
  name_uz: string
  unit: string
  price_uzs: number
  color_hex: string | null
  texture_key: string | null
  pbr_roughness: number
}

export interface MaterialsPage {
  items: Material[]
  total: number
  page: number
  per_page: number
}

export interface MaterialParams {
  category?: string
  store?: string
  page?: number
  per_page?: number
}

/**
 * Get materials with optional filtering and pagination
 */
export async function getMaterials(params: MaterialParams = {}): Promise<Material[]> {
  const query = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    )
  ).toString()

  const response = await apiClient.get<MaterialsPage>(
    `/materials${query ? `?${query}` : ''}`
  )
  return response.data.items
}

/**
 * Get paginated materials
 */
export async function getMaterialsPage(params: MaterialParams = {}): Promise<MaterialsPage> {
  const query = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    )
  ).toString()

  const response = await apiClient.get<MaterialsPage>(
    `/materials${query ? `?${query}` : ''}`
  )
  return response.data
}

/**
 * Get material by category
 */
export async function getMaterialsByCategory(category: string): Promise<Material[]> {
  return getMaterials({ category })
}
