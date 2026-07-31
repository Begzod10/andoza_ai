/**
 * Footprint helpers shared by the 2D plan.
 *
 * The plan symbol itself is traced from the model in `modelTopView`; this
 * module holds the plain-geometry bits around it — the stand-in rectangle for
 * a model that hasn't loaded, and the extents used to keep an item inside the
 * room while it is dragged.
 *
 * Coordinates are model space [x, z], matching how `FurnitureItem` places a
 * model: `position = [x, _, y]` with no re-centring, then `rotation.y`.
 */

/** Outline as [x, z] pairs, model space. */
export type Hull = Array<[number, number]>

/** Axis-aligned rectangle, centred on the origin — the fallback shape. */
export function rectHull(w: number, d: number): Hull {
  const hw = Math.max(w, 0.05) / 2
  const hd = Math.max(d, 0.05) / 2
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ]
}

/**
 * Extents of an outline around the model origin after a yaw rotation and
 * scale. Asymmetric on purpose: a model whose origin is not its centre must
 * still be clamped by its real edges.
 */
export function hullBounds(
  hull: Hull,
  rotation: number,
  scale: number,
): { minX: number; maxX: number; minZ: number; maxZ: number } {
  // Matches THREE's rotation about +Y: (x,z) → (x·cos + z·sin, −x·sin + z·cos)
  const c = Math.cos(rotation)
  const s = Math.sin(rotation)
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const [x, z] of hull) {
    const rx = (x * c + z * s) * scale
    const rz = (-x * s + z * c) * scale
    if (rx < minX) minX = rx
    if (rx > maxX) maxX = rx
    if (rz < minZ) minZ = rz
    if (rz > maxZ) maxZ = rz
  }
  if (!isFinite(minX)) return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }
  return { minX, maxX, minZ, maxZ }
}
