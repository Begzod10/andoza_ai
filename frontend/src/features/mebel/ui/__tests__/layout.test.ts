import { describe, it, expect } from 'vitest'
import { nextX } from '../layout'
import type { CabinetSpec } from '@/features/mebel/engine'

const c = (type: CabinetSpec['type'], x: number, width = 600) => ({ type, position: { x, z: 0 }, width }) as CabinetSpec

describe('nextX', () => {
  it('floor cabinets (base and tall) continue one row', () => {
    expect(nextX([c('base', 0), c('tall', 600)], 'base')).toBe(1200)
  })
  it('wall cabinets make their own row, after any tall cabinet so they never hang inside one', () => {
    expect(nextX([c('base', 0), c('tall', 600)], 'wall')).toBe(1200)
    expect(nextX([c('base', 0), c('base', 600)], 'wall')).toBe(0)
    expect(nextX([c('base', 0), c('wall', 0), c('base', 600)], 'wall')).toBe(600)
  })
})
