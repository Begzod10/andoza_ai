import { describe, it, expect } from 'vitest'
import { meshSpecs, COLORS } from './CabinetView'
import { baseCabinetParts, DEFAULTS } from '@/features/mebel/engine'

const cab = { id: 'c1', type: 'base' as const, label: 'M1', width: 600, height: 720, depth: 560, shelves: 1, position: { x: 0, z: 0 } }
const parts = baseCabinetParts(cab, DEFAULTS)

describe('meshSpecs', () => {
  it('one box per part, in metres, from the engine placement', () => {
    const specs = meshSpecs(parts, null)
    expect(specs).toHaveLength(parts.length)
    const side = specs.find(s => s.id === 'M1-01')!
    expect(side.size).toEqual([0.018, 0.72, 0.556])
    expect(side.position).toEqual([0.009, 0.36, 0.282])
  })

  it('board, back and the selected part have their own colour', () => {
    const specs = meshSpecs(parts, 'M1-03')
    expect(specs.find(s => s.id === 'M1-01')!.color).toBe(COLORS.board)
    expect(specs.find(s => s.id === 'M1-07')!.color).toBe(COLORS.back)
    expect(specs.find(s => s.id === 'M1-03')!.color).toBe(COLORS.selected)
  })

  it('centres the row on the origin so the camera frames it', () => {
    const two = [...parts, ...baseCabinetParts({ ...cab, id: 'c2', label: 'M2', position: { x: 600, z: 0 } }, DEFAULTS)]
    const xs = meshSpecs(two, null, { center: true }).flatMap(s => [s.position[0] - s.size[0] / 2, s.position[0] + s.size[0] / 2])
    expect(Math.min(...xs)).toBeCloseTo(-0.6, 6)
    expect(Math.max(...xs)).toBeCloseTo(0.6, 6)
  })
})
