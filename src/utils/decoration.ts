/**
 * Decoration workflow utilities
 */

/**
 * Format currency to Uzbek Som format
 */
export const formatSom = (amount: number): string => {
  return amount.toLocaleString('uz-UZ', {
    style: 'currency',
    currency: 'UZS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).replace('UZS', 'so\'m').trim()
}

/**
 * Calculate total material cost
 */
export const calculateMaterialCost = (
  materials: any[],
  area?: number,
  coverage?: number
): number => {
  return materials.reduce((sum, material) => {
    const price = material.price || 0
    if (area && coverage) {
      // Calculate needed quantity based on area and coverage
      const quantity = Math.ceil(area / coverage)
      return sum + price * quantity
    }
    return sum + price
  }, 0)
}

/**
 * Validate material selection
 */
export const validateMaterialSelection = (selectedMaterial: any): { valid: boolean; error?: string } => {
  if (!selectedMaterial) {
    return { valid: false, error: 'Material tanlanmagan' }
  }

  if (!selectedMaterial.id) {
    return { valid: false, error: 'Material ID topilmadi' }
  }

  if (!selectedMaterial.name) {
    return { valid: false, error: 'Material nomi topilmadi' }
  }

  return { valid: true }
}

/**
 * Get wall name in Uzbek
 */
export const getWallNameUz = (wallId: string): string => {
  const wallNames: Record<string, string> = {
    A: 'A devari',
    B: 'B devari',
    C: 'C devari',
    D: 'D devari',
    floor: 'Pol',
  }
  return wallNames[wallId] || wallId
}

/**
 * Get material type name in Uzbek
 */
export const getMaterialTypeUz = (type: string): string => {
  const typeNames: Record<string, string> = {
    paint: 'Bo\'yoq',
    wallpaper: 'Oboi',
    tile: 'Plitka',
    laminate: 'Laminat',
    parquet: 'Parchis',
    wood: 'Yog\'och',
  }
  return typeNames[type] || type
}

/**
 * Group materials by type
 */
export const groupMaterialsByType = (materials: any[]): Record<string, any[]> => {
  return materials.reduce((acc, material) => {
    const type = material.type || 'unknown'
    if (!acc[type]) {
      acc[type] = []
    }
    acc[type].push(material)
    return acc
  }, {})
}

/**
 * Sort materials by price
 */
export const sortMaterialsByPrice = (
  materials: any[],
  order: 'asc' | 'desc' = 'asc'
): any[] => {
  return [...materials].sort((a, b) => {
    const priceA = a.price || 0
    const priceB = b.price || 0
    return order === 'asc' ? priceA - priceB : priceB - priceA
  })
}

/**
 * Filter materials by price range
 */
export const filterMaterialsByPrice = (
  materials: any[],
  minPrice: number,
  maxPrice: number
): any[] => {
  return materials.filter((material) => {
    const price = material.price || 0
    return price >= minPrice && price <= maxPrice
  })
}

/**
 * Calculate material quantity needed
 */
export const calculateQuantityNeeded = (
  area: number,
  coveragePerUnit: number
): number => {
  return Math.ceil(area / coveragePerUnit)
}

/**
 * Convert cm to m
 */
export const cmToM = (cm: number): number => cm / 100

/**
 * Convert m to cm
 */
export const mToCm = (m: number): number => m * 100

/**
 * Parse tile size string (e.g., "30x30" -> { width: 30, height: 30 })
 */
export const parseTileSize = (size: string): { width: number; height: number } | null => {
  const match = size.match(/(\d+)x(\d+)/)
  if (match) {
    return {
      width: parseInt(match[1], 10),
      height: parseInt(match[2], 10),
    }
  }
  return null
}

/**
 * Calculate tiles needed for area
 */
export const calculateTilesNeeded = (
  areaInM2: number,
  tileSizeInCm: string
): number => {
  const tileSize = parseTileSize(tileSizeInCm)
  if (!tileSize) return 0

  const tileSizeInM = (tileSize.width / 100) * (tileSize.height / 100)
  return Math.ceil(areaInM2 / tileSizeInM)
}

/**
 * Format date to Uzbek format
 */
export const formatDateUz = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('uz-UZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Format time in Uzbek format
 */
export const formatTimeUz = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('uz-UZ', {
    hour: '2-digit',
    minute: '2-digit',
  })
}
