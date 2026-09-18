import { describe, it, expect } from 'vitest'
import type { CatalogFurniture } from '@/lib/api'
import {
  buildFurnitureGroups,
  SWAP_EXACT_HEADING,
  SWAP_RELATED_HEADING,
} from '@/lib/furnitureSwapGroups'

function f(
  name: string,
  category: string,
  room_type: string | null = null
): CatalogFurniture {
  return {
    id: name,
    store_id: null,
    store_name: null,
    category,
    room_type,
    placement: 'pol',
    name_uz: name,
    price_uzs: null,
    glb_url: null,
    thumbnail_url: null,
    footprint_w: null,
    footprint_d: null,
  }
}

// Mirrors the real production catalogue's shape: one lonely `stul`, a few
// real categories, and a fat `boshqa` bucket holding the armchairs.
const CATALOG: CatalogFurniture[] = [
  f('Stul 1', 'stul'),
  f('Stol 1', 'stol'),
  f('Stol 2', 'stol'),
  f('Divan 1', 'divan'),
  f('Kreslo 1', 'boshqa'),
  f('Kreslo 2', 'boshqa'),
  f('Gilam 1', 'boshqa'),
  f('Lampa 1', 'lampa'),
]

const names = (items: CatalogFurniture[]) => items.map((i) => i.name_uz)

describe('buildFurnitureGroups — swap mode', () => {
  it('keeps exact-category matches first and appends the boshqa bucket below', () => {
    const groups = buildFurnitureGroups(CATALOG, { isSwap: true, initialCategory: 'stul' })

    expect(groups).toHaveLength(2)
    expect(groups[0].key).toBe('exact')
    expect(groups[0].heading).toBe(SWAP_EXACT_HEADING)
    expect(names(groups[0].items)).toEqual(['Stul 1'])
    expect(groups[1].key).toBe('related')
    expect(groups[1].heading).toBe(SWAP_RELATED_HEADING)
    expect(names(groups[1].items)).toEqual(['Kreslo 1', 'Kreslo 2', 'Gilam 1'])
  })

  it('never lists a lamp — those belong to the "Chiroq" section', () => {
    const all = buildFurnitureGroups(CATALOG, { isSwap: true, initialCategory: 'stul' })
      .flatMap((g) => g.items)
    expect(names(all)).not.toContain('Lampa 1')

    const unfiltered = buildFurnitureGroups(CATALOG, { isSwap: true, initialCategory: null })
      .flatMap((g) => g.items)
    expect(names(unfiltered)).not.toContain('Lampa 1')
  })

  it('shows every (non-lamp) model, ungrouped, when the scan gave no category', () => {
    const groups = buildFurnitureGroups(CATALOG, { isSwap: true, initialCategory: null })
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('all')
    expect(groups[0].heading).toBeNull()
    expect(groups[0].items).toHaveLength(CATALOG.length - 1)
  })

  it('does not duplicate the boshqa rows when boshqa IS the exact category', () => {
    const groups = buildFurnitureGroups(CATALOG, { isSwap: true, initialCategory: 'boshqa' })
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('exact')
    expect(groups[0].heading).toBeNull()
    expect(names(groups[0].items)).toEqual(['Kreslo 1', 'Kreslo 2', 'Gilam 1'])
  })

  it('drops an empty exact group but keeps the labelled fallback group', () => {
    const groups = buildFurnitureGroups(CATALOG, { isSwap: true, initialCategory: 'karavot' })
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('related')
    expect(groups[0].heading).toBe(SWAP_RELATED_HEADING)
  })

  it('leaves a lone exact group unlabelled when there is nothing to contrast it with', () => {
    const noBoshqa = CATALOG.filter((i) => i.category !== 'boshqa')
    const groups = buildFurnitureGroups(noBoshqa, { isSwap: true, initialCategory: 'stul' })
    expect(groups).toHaveLength(1)
    expect(groups[0].heading).toBeNull()
  })

  it('returns no groups at all when the catalogue is empty', () => {
    expect(buildFurnitureGroups([], { isSwap: true, initialCategory: 'stul' })).toEqual([])
  })
})

describe('buildFurnitureGroups — browsing mode', () => {
  it('filters by room type and stays a single ungrouped list', () => {
    const catalog = [
      f('Universal stol', 'stol', null),
      f('Oshxona stoli', 'stol', 'oshxona'),
      f('Yotoq shkafi', 'shkaf', 'yotoqxona'),
      f('Lampa 1', 'lampa', null),
    ]
    const groups = buildFurnitureGroups(catalog, { isSwap: false, roomTypeKey: 'oshxona' })

    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('all')
    expect(groups[0].heading).toBeNull()
    expect(names(groups[0].items)).toEqual(['Universal stol', 'Oshxona stoli'])
  })

  it('ignores initialCategory outside swap mode', () => {
    const groups = buildFurnitureGroups(CATALOG, {
      isSwap: false,
      initialCategory: 'stul',
      roomTypeKey: 'mehmonxona',
    })
    expect(groups).toHaveLength(1)
    expect(groups[0].items).toHaveLength(CATALOG.length - 1)
  })
})
