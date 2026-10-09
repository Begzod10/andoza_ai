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
  const poly = n >= 3 ? verticesMm!.map(([x, z]) => [x / 1000 - cx, z / 1000 - cz] as const) : null
  return features
    .filter((f) => f.kind === 'riser' && f.confidence !== 'low')
    .filter((f) => Number.isFinite(f.x) && Number.isFinite(f.y) && f.width > 0 && f.height > 0)
    .map((f) => {
      const width = f.width
      const depth = Math.max(f.depth ?? f.width, MIN_DEPTH_M)
      const base = { width, depth, height: f.height, confidence: f.confidence as 'high' | 'medium' }
      const px = f.x - cx
      const pz = f.y - cz
      const placed = poly && againstNearestWall(poly, px, pz, width, depth)
      return placed
        ? { ...base, ...placed }
        : { ...base, x: px, z: pz, rotationY: -f.rotation_rad }
    })
}

/**
 * A riser stands against a wall, so rather than trust the scan's raw position
 * (which drifts when the outline is straightened or edited) put it flush
 * against the nearest wall of the room as it is drawn now, inside the room.
 */
function againstNearestWall(
  poly: readonly (readonly [number, number])[],
  px: number, pz: number, width: number, depth: number,
): { x: number; z: number; rotationY: number } | null {
  const n = poly.length
  let area2 = 0
  for (let i = 0; i < n; i++) {
    const [x1, z1] = poly[i]
    const [x2, z2] = poly[(i + 1) % n]
    area2 += x1 * z2 - x2 * z1
  }
  if (area2 === 0) return null
  const sign = area2 > 0 ? 1 : -1
  let best: { d: number; x: number; z: number; rotationY: number } | null = null
  for (let i = 0; i < n; i++) {
    const [x1, z1] = poly[i]
    const [x2, z2] = poly[(i + 1) % n]
    const ex = x2 - x1
    const ez = z2 - z1
    const len = Math.hypot(ex, ez)
    if (len < 1e-6) continue
    const ux = ex / len
    const uz = ez / len
    const half = Math.min(width / 2, len / 2)
    const t = Math.min(len - half, Math.max(half, (px - x1) * ux + (pz - z1) * uz))
    const wx = x1 + ux * t
    const wz = z1 + uz * t
    const d = Math.hypot(px - wx, pz - wz)
    if (!best || d < best.d) {
      // Inward normal: left of the edge for a counter-clockwise outline.
      const nx = -uz * sign
      const nz = ux * sign
      best = { d, x: wx + nx * depth / 2, z: wz + nz * depth / 2, rotationY: -Math.atan2(uz, ux) }
    }
  }
  return best && { x: best.x, z: best.z, rotationY: best.rotationY }
}
