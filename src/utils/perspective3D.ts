/**
 * 3D perspective and transform utilities
 */

export interface Transform3D {
  perspective: number
  rotateX: string
  rotateY: string
  scale: number
}

/**
 * Calculate CSS 3D transform based on camera rotation and zoom
 */
export function calculateTransform3D(
  rotationX: number,
  rotationY: number,
  zoom: number
): Transform3D {
  return {
    perspective: 1200,
    rotateX: `${rotationX}deg`,
    rotateY: `${rotationY}deg`,
    scale: zoom,
  }
}

/**
 * Get wall color based on room state
 */
export function getWallColor(state: string): string {
  const stateColors: Record<string, string> = {
    korobka: '#D1D5DB', // Gray - raw concrete
    suvoq: '#E8D4C8', // Beige - dried plaster
    shpaklovka: '#F5F3F0', // Off-white - spackled
  }
  return stateColors[state] || '#FFFFFF'
}

/**
 * Get wall texture pattern based on state
 */
export function getWallTexturePattern(state: string): string {
  const patterns: Record<string, string> = {
    korobka: 'radial-gradient(circle, rgba(0,0,0,0.1) 1px, transparent 1px)',
    suvoq: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.05) 0, rgba(0,0,0,0.05) 2px, transparent 2px, transparent 4px)',
    shpaklovka: 'repeating-linear-gradient(90deg, rgba(0,0,0,0.02) 0, rgba(0,0,0,0.02) 1px, transparent 1px, transparent 3px)',
  }
  return patterns[state] || 'none'
}

/**
 * Floor texture based on state
 */
export function getFloorTexture(state: string): string {
  const textures: Record<string, string> = {
    korobka: 'linear-gradient(45deg, #8B8680 25%, transparent 25%, transparent 75%, #8B8680 75%, #8B8680), linear-gradient(45deg, #8B8680 25%, transparent 25%, transparent 75%, #8B8680 75%, #8B8680)',
    suvoq: 'linear-gradient(90deg, #D4A574 0%, #E5B89B 50%, #D4A574 100%)',
    shpaklovka: 'linear-gradient(90deg, #E8E3D8 0%, #F5F0E8 50%, #E8E3D8 100%)',
  }
  return textures[state] || '#D4A574'
}

/**
 * Clamp angle to 0-360 range
 */
export function normalizeAngle(angle: number): number {
  let normalized = angle % 360
  if (normalized < 0) normalized += 360
  return normalized
}

/**
 * Clamp rotation values for realistic camera movement
 */
export function clampRotation(angle: number, max: number): number {
  return Math.max(-max, Math.min(max, angle))
}
