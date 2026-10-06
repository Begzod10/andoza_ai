import { describe, it, expect } from 'vitest'
import type { EstimateLine } from '../api'
import { GROUP_ORDER, formatQuantity, formatShare, groupEstimateLines, groupKeyFor, totalsFor } from '../smetaGroups'

const line = (category: string | undefined, total: number, label = category ?? 'x'): EstimateLine => ({
  label, formula: '', quantity: 1, unit: 'dona', unit_price: total, total_uzs: total,
  is_approximate: false, store_id: null, category,
})

describe('groupKeyFor', () => {
  it.each([
    ['suvoq', 'tayyorlash'], ['grunt', 'tayyorlash'], ['shpatlyovka', 'tayyorlash'],
    ['boyoq', 'pardoz'], ['oboy', 'pardoz'], ['texture', 'pardoz'],
    ['laminat', 'pol'], ['plitka', 'pol'], ['plintus', 'pol'],
    ['shift', 'shift'], ['elektr', 'elektr'], ['chiroq', 'elektr'], ['jihoz', 'jihoz'],
  ])('%s goes to %s', (category, group) => {
    expect(groupKeyFor(category)).toBe(group)
  })

  it('sends an unknown, empty or missing category to "boshqa", whatever its case', () => {
    expect(groupKeyFor('mebel')).toBe('boshqa')
    expect(groupKeyFor('')).toBe('boshqa')
    expect(groupKeyFor(undefined)).toBe('boshqa')
    expect(groupKeyFor(null)).toBe('boshqa')
    expect(groupKeyFor('  BOYOQ ')).toBe('pardoz')
  })
})

describe('groupEstimateLines', () => {
  it('returns nothing for no lines', () => {
    expect(groupEstimateLines([])).toEqual([])
  })

  it('keeps the fixed order of the work, not the order the lines came in, and leaves empty groups out', () => {
    const groups = groupEstimateLines([line('jihoz', 1), line('suvoq', 1), line('elektr', 1), line('boyoq', 1)])
    expect(groups.map((g) => g.key)).toEqual(['tayyorlash', 'pardoz', 'elektr', 'jihoz'])
    expect(GROUP_ORDER.indexOf('boshqa')).toBe(GROUP_ORDER.length - 1) // the catch-all is last
  })

  it('sums each group and works out its share of the whole', () => {
    const groups = groupEstimateLines([line('suvoq', 750), line('grunt', 250), line('boyoq', 1000)])
    const prep = groups.find((g) => g.key === 'tayyorlash')!
    expect(prep.subtotal).toBe(1000)
    expect(prep.share).toBeCloseTo(0.5)
    expect(groups.reduce((sum, g) => sum + g.share, 0)).toBeCloseTo(1)
  })

  it("remembers each line's position in the estimate (the AI helper points at lines by it) and keeps their order inside a group", () => {
    const lines = [line('boyoq', 1, 'a'), line('suvoq', 1, 'b'), line('oboy', 1, 'c'), line('grunt', 1, 'd')]
    const groups = groupEstimateLines(lines)
    expect(groups.find((g) => g.key === 'pardoz')!.items.map((i) => [i.line.label, i.index])).toEqual([['a', 0], ['c', 2]])
    expect(groups.find((g) => g.key === 'tayyorlash')!.items.map((i) => [i.line.label, i.index])).toEqual([['b', 1], ['d', 3]])
  })

  it('has a share of 0, not NaN, when every line is free', () => {
    const [group] = groupEstimateLines([line('suvoq', 0)])
    expect(group.share).toBe(0)
    expect(group.subtotal).toBe(0)
  })
})

describe('formatShare / formatQuantity', () => {
  it('rounds a share to a whole percent, and says "<1%" for a sliver that is not zero', () => {
    expect(formatShare(0.374)).toBe('37%')
    expect(formatShare(0.005)).toBe('<1%')
    expect(formatShare(0)).toBe('0%')
    expect(formatShare(1)).toBe('100%')
  })

  it('drops trailing zeros from a quantity', () => {
    expect(formatQuantity(15)).toBe('15')
    expect(formatQuantity(34.48)).toBe('34.48')
    expect(formatQuantity(8.5)).toBe('8.5')
    expect(formatQuantity(2.004)).toBe('2')
  })
})

describe('leaving a group out of the headline figure', () => {
  const lines = [
    { label: 'Suvoq', formula: '', quantity: 1, unit: 'qop', unit_price: 100_000, total_uzs: 100_000, is_approximate: false, store_id: null, category: 'suvoq' },
    { label: 'Elektr', formula: '', quantity: 1, unit: 'm', unit_price: 100_000, total_uzs: 100_000, is_approximate: true, store_id: null, category: 'elektr' },
    { label: 'Divan', formula: '', quantity: 1, unit: 'dona', unit_price: 800_000, total_uzs: 800_000, is_approximate: false, store_id: null, category: 'jihoz' },
  ]

  it('drops the group and recomputes the shares without it', () => {
    const groups = groupEstimateLines(lines, new Set(['jihoz']))
    expect(groups.map((g) => g.key)).toEqual(['tayyorlash', 'elektr'])
    expect(groups.map((g) => g.share)).toEqual([0.5, 0.5])
  })

  it('keeps every line at its position in the original array', () => {
    const groups = groupEstimateLines(lines, new Set(['tayyorlash']))
    expect(groups.find((g) => g.key === 'jihoz')!.items[0].index).toBe(2)
  })

  it('totals by the server formula: 10% under, 30% on the approximate part plus 10% over', () => {
    expect(totalsFor(lines)).toEqual({ total: 1_000_000, min: 900_000, max: Math.floor((900_000 + 100_000 * 1.3) * 1.1), approx: 100_000 })
    expect(totalsFor(lines, new Set(['jihoz']))).toEqual({ total: 200_000, min: 180_000, max: Math.floor((100_000 + 100_000 * 1.3) * 1.1), approx: 100_000 })
  })

  it('is zero for no lines', () => {
    expect(totalsFor([])).toEqual({ total: 0, min: 0, max: 0, approx: 0 })
  })
})
