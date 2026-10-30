import { describe, it, expect } from 'vitest'
import { nextX } from './layout'
import { newCabinet } from '@/features/mebel/engine'
import type { CabinetSpec } from '@/features/mebel/engine'

const cab = (type: CabinetSpec['type'], x: number, width = 600): CabinetSpec => ({ ...newCabinet('M', x, type), width })

describe('nextX', () => {
  it('base and tall cabinets continue the floor row', () => {
    expect(nextX([cab('base', 0), cab('tall', 600)], 'base', 600)).toBe(1200)
  })

  it('wall cabinets hang over the base cabinets, from the start of the wall', () => {
    // the AI kitchen: 600 + 600 base, a tall one at the end
    const row = [cab('base', 0), cab('base', 600), cab('tall', 1200)]
    expect(nextX(row, 'wall', 600)).toBe(0)
    expect(nextX([...row, cab('wall', 0)], 'wall', 600)).toBe(600)
    // the next one would run into the tall cabinet: it goes past it
    expect(nextX([...row, cab('wall', 0), cab('wall', 600)], 'wall', 600)).toBe(1800)
  })

  it('a wall cabinet takes the first gap wide enough for it', () => {
    const row = [cab('tall', 0), cab('base', 600), cab('base', 1200), cab('tall', 1800)]
    expect(nextX(row, 'wall', 600)).toBe(600)
    expect(nextX(row, 'wall', 1200)).toBe(600)
    expect(nextX(row, 'wall', 1300)).toBe(2400)
  })
})
