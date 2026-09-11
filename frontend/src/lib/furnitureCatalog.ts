import type { CatalogFurniture } from '@/lib/api'

export interface MaterialSlot {
  /** Internal GLB material name */
  name: string
  /** Human-readable label shown in UI */
  label: string
}

export type FurnitureCategory =
  | 'divan'
  | 'stol'
  | 'stul'
  | 'karavot'
  | 'shkaf'
  | 'lampa'
  | 'boshqa'

export const CATEGORY_LABELS: Record<FurnitureCategory, string> = {
  divan:  'Divan',
  stol:   'Stol',
  stul:   "Stul",
  karavot:'Karavot',
  shkaf:  'Shkaf',
  lampa:  'Lampa',
  boshqa: 'Boshqa',
}

/** Where a model sits once placed in the room. Matches the admin catalog's
 * pol/devor/shift vocabulary (backend Furniture.placement). */
export type FurniturePlacement = 'pol' | 'devor' | 'shift'

export const PLACEMENT_LABELS: Record<FurniturePlacement, string> = {
  pol:   'Polda',
  devor: 'Devorda',
  shift: 'Shiftda',
}

/**
 * Rough starting price (so'm) by category for a freshly-imported user model —
 * a placeholder the user edits in the panel, not a real market quote. Used
 * so an uploaded model gets a category-appropriate default instead of one
 * flat number for every kind of furniture.
 */
const DEFAULT_PRICE_BY_CATEGORY_UZS: Record<FurnitureCategory, number> = {
  divan:   6_000_000,
  stol:    3_500_000,
  stul:    1_200_000,
  karavot: 5_000_000,
  shkaf:   4_000_000,
  lampa:     900_000,
  boshqa:  1_500_000,
}

export function estimateFurniturePriceUzs(category?: FurnitureCategory): number {
  return DEFAULT_PRICE_BY_CATEGORY_UZS[category ?? 'boshqa']
}

export interface FurnitureCatalogEntry {
  id: string
  name: string
  emoji: string
  modelPath: string
  dracoPath: string
  scale: number
  sizeM: { w: number; d: number; h: number }
  category: FurnitureCategory
  /** Named material slots for per-material color overrides */
  materialSlots?: MaterialSlot[]
}

export const FURNITURE_CATALOG: FurnitureCatalogEntry[] = [
  {
    id: 'boconcept_hauge_table',
    name: "Bo Concept Hauge stol to'plami",
    emoji: '🍽️',
    modelPath: '/models/table_boconcept_hauge.glb',
    dracoPath: '',
    scale: 0.001,
    sizeM: { w: 1.84, d: 1.83, h: 0.82 },
    category: 'stol',
    materialSlots: [
      { name: 'wire_115115115', label: "Yog'och" },
      { name: 'wire_088144225', label: 'Mato' },
      { name: 'wire_086086086', label: 'Metal' },
    ],
  },
  {
    id: 'couch_84',
    name: "Uch o'rinli divan",
    emoji: '🛋️',
    modelPath: '/models/couch_84.glb',
    dracoPath: '',
    scale: 1,
    sizeM: { w: 2.10, d: 0.90, h: 0.80 },
    category: 'divan',
    materialSlots: [
      { name: 'Fabric', label: 'Mato' },
      { name: 'Wood', label: "Yog'och" },
    ],
  },
]

/** A do'kon (shop) catalog model resolved to the shape every furniture
 *  consumer (3D viewport, 2D plan) already understands. Shared by
 *  ThreeDPage.tsx and PlanFurniture.tsx so there is exactly one definition
 *  of "what a shop entry looks like before its real geometry is known". */
export interface ResolvedCatalogEntry {
  id: string
  name: string
  emoji: string
  modelPath: string
  scale: number
  sizeM: { w: number; d: number; h: number }
  /** No authored scale exists for a shop upload — true tells every renderer
   *  to auto-detect it from the loaded GLB's own geometry once available
   *  (see extractSceneInfo in modelConverter.ts), same as a fresh user import. */
  autoScale: true
}

/** Undefined for a shop listing with no GLB yet (admin created the entry
 *  before uploading a model) — not placeable, same as a still-loading upload. */
export function catalogToFurnitureEntry(f: CatalogFurniture | undefined): ResolvedCatalogEntry | undefined {
  if (!f?.glb_url) return undefined
  return {
    id: f.id,
    name: f.name_uz,
    emoji: '🏪',
    modelPath: f.glb_url,
    scale: 1,
    sizeM: { w: (f.footprint_w ?? 0) / 100, d: (f.footprint_d ?? 0) / 100, h: 0 },
    autoScale: true,
  }
}
