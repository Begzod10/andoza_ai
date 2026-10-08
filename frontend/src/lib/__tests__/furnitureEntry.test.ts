import { describe, expect, it } from 'vitest'
import type { CatalogFurniture } from '@/lib/api'
import { resolveCatalogEntry } from '@/lib/furnitureEntry'

function row(over: Partial<CatalogFurniture> = {}): CatalogFurniture {
  return {
    id: 'shop-chair',
    name_uz: 'Stul',
    glb_url: '/chair.glb',
    footprint_w: 50,
    footprint_d: 50,
    price_uzs: 100000,
    ...over,
  } as CatalogFurniture
}

describe('resolveCatalogEntry', () => {
  it('returns the same object for the same catalogue row', () => {
    const r = row()
    // Referential, not structural: StudioFurniture feeds this entry to the
    // useMemo that holds the model's scene clone, and a new entry per render
    // means a new THREE.Object3D per render — which is how a tap on a model
    // ended up opening the wall's ring. See furnitureEntry.ts.
    expect(resolveCatalogEntry(r)).toBe(resolveCatalogEntry(r))
  })

  it('still resolves a refreshed catalogue to a fresh entry', () => {
    const first = resolveCatalogEntry(row())
    const second = resolveCatalogEntry(row({ glb_url: '/chair-v2.glb' }))
    expect(first).not.toBe(second)
    expect(second?.modelPath).toBe('/chair-v2.glb')
  })

  it('has no entry for a row with no model', () => {
    expect(resolveCatalogEntry(row({ glb_url: undefined }))).toBeUndefined()
    expect(resolveCatalogEntry(undefined)).toBeUndefined()
  })
})
