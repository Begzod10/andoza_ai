/**
 * Pipe risers found in a LiDAR scan, as boxes in the studio's scene.
 *
 * The backend reads them off the scan (`room_scan.features`, see
 * backend/app/services/service_features.py): a boxed-in plumbing riser comes
 * back from RoomPlan as a short piece of wall or a narrow, tall "storage" box
 * against a wall. This turns the ones worth showing into positions the 3D
 * scene can place.
 *
 * Frames: a feature's `x` / `y` are metres in the scan plane (bbox min corner
 * of the room at 0,0 — the same convention as `geometry.vertices`). The scene is
 * centred on the mean of those vertices (what `NWallRoomShell` does), so a box
 * sits at `x - centroidX`, `y - centroidZ`. `rotation_rad` is the scan's
 * atan2(m[2], m[0]); three.js turns about +Y the other way round, hence the
 * minus sign.
 */
export interface ServiceFeature {
  kind: 'riser' | 'wall_box'
  confidence: 'high' | 'medium' | 'low'
  source: 'short_wall' | 'storage'
  x: number
  y: number
  width: number
  depth: number | null
  height: number
  rotation_rad: number
}

export interface RiserBox {
  /** Scene position of the box's centre on the floor, metres. */
  x: number
  z: number
  /** Box size, metres. */
  width: number
  depth: number
  height: number
  /** three.js rotation about +Y. */
  rotationY: number
  confidence: 'high' | 'medium'
}

/** A piece of wall has no recorded depth; a riser box is roughly square, so it
 *  is drawn as deep as it is wide (but never a hairline). */
const MIN_DEPTH_M = 0.2

export function riserBoxes(
  features: readonly ServiceFeature[] | null | undefined,
  verticesMm: readonly (readonly [number, number])[] | null | undefined,
): RiserBox[] {
  if (!features?.length) return []
  const n = verticesMm?.length ?? 0
  const cx = n ? verticesMm!.reduce((s, [x]) => s + x, 0) / n / 1000 : 0
  const cz = n ? verticesMm!.reduce((s, [, z]) => s + z, 0) / n / 1000 : 0
  return features
    .filter((f) => f.kind === 'riser' && f.confidence !== 'low')
    .filter((f) => Number.isFinite(f.x) && Number.isFinite(f.y) && f.width > 0 && f.height > 0)
    .map((f) => ({
      x: f.x - cx,
      z: f.y - cz,
      width: f.width,
      depth: Math.max(f.depth ?? f.width, MIN_DEPTH_M),
      height: f.height,
      rotationY: -f.rotation_rad,
      confidence: f.confidence as 'high' | 'medium',
    }))
}
