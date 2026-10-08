import type { CatalogFurniture } from '@/lib/api'
import { catalogToFurnitureEntry, type ResolvedCatalogEntry } from '@/lib/furnitureCatalog'

/**
 * `catalogToFurnitureEntry` for a do'kon (shop) row, returning the SAME entry
 * object every time it is asked about the same row.
 *
 * Why the identity matters, and the bug it comes from: a tap on a model
 * standing in front of a wall opened the WALL's radial menu ("Devor") instead
 * of selecting the model. `catalogToFurnitureEntry` builds a fresh object on
 * every call, so `useFurnitureEntry` handed StudioFurniture a new `entry`
 * reference on every render, which invalidated the `useMemo` that holds the
 * model's `scene.clone(true)` — a new THREE.Object3D per render. The press
 * selects the item, the selection re-renders the furniture layer, the clone is
 * replaced, and react-three-fiber then reconstructs the `<primitive>` around
 * the new object.
 *
 * That matters because r3f gates click handlers on object IDENTITY: a
 * pointerdown records `internal.initialHits` (the objects the press hit), and
 * for a `click` it only calls a handler when `initialHits.includes(eventObject)`
 * (see node_modules/@react-three/fiber/dist/events-*.js, `onIntersect`). The
 * object raycast by the trailing click was no longer the object the press had
 * recorded, so the model's `swallowPickClick` was skipped, the click carried on
 * to the wall behind, and the wall's ring opened.
 *
 * Keyed on the row object, so a refreshed catalogue (new row objects) still
 * produces fresh entries — only a re-render with unchanged data is stabilised.
 */
const entryByRow = new WeakMap<CatalogFurniture, ResolvedCatalogEntry | undefined>()

export function resolveCatalogEntry(
  row: CatalogFurniture | undefined,
): ResolvedCatalogEntry | undefined {
  if (!row) return undefined
  if (entryByRow.has(row)) return entryByRow.get(row)
  const entry = catalogToFurnitureEntry(row)
  entryByRow.set(row, entry)
  return entry
}
