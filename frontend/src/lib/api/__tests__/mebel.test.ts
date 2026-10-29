import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getCatalogMaterials } from '../mebel'
import { getMaterials } from '../materials'

vi.mock('../materials', () => ({ getMaterials: vi.fn() }))

const page = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ id: `m${from + i}` }))

describe('getCatalogMaterials', () => {
  beforeEach(() => vi.mocked(getMaterials).mockReset())

  it('reads every page, not just the first 100', async () => {
    vi.mocked(getMaterials)
      .mockResolvedValueOnce(page(100) as never)
      .mockResolvedValueOnce(page(100, 100) as never)
      .mockResolvedValueOnce(page(7, 200) as never)
    const all = await getCatalogMaterials('ldsp')
    expect(all).toHaveLength(207)
    expect(vi.mocked(getMaterials).mock.calls.map(c => c[0])).toEqual([
      { category: 'ldsp', per_page: 100, page: 1 },
      { category: 'ldsp', per_page: 100, page: 2 },
      { category: 'ldsp', per_page: 100, page: 3 },
    ])
  })

  it('stops at 500 products', async () => {
    vi.mocked(getMaterials).mockImplementation(async (p) => page(100, ((p?.page ?? 1) - 1) * 100) as never)
    expect(await getCatalogMaterials('kromka')).toHaveLength(500)
    expect(getMaterials).toHaveBeenCalledTimes(5)
  })
})
