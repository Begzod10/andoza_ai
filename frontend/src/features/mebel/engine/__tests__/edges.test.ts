import { describe, it, expect } from 'vitest'
import { cutSize } from '../edges'
import { newProject } from '../model'
import type { Part } from '../model'

describe('cutSize', () => {
  it('L edges shrink width, W edges shrink length', () => {
    const e: Part['edges'] = { L1: { band: 'visible', thickness: 2 }, L2: null, W1: { band: 'hidden', thickness: 0.4 }, W2: null }
    expect(cutSize({ length: 720, width: 556 }, e, false)).toEqual({ length: 719.6, width: 554 })
  })

  it('premilled keeps the finished size', () => {
    const e: Part['edges'] = { L1: { band: 'visible', thickness: 2 }, L2: { band: 'visible', thickness: 2 }, W1: null, W2: null }
    expect(cutSize({ length: 500, width: 300 }, e, true)).toEqual({ length: 500, width: 300 })
  })

  it('a zero-thickness band changes nothing', () => {
    const e: Part['edges'] = { L1: { band: 'visible', thickness: 0 }, L2: null, W1: null, W2: null }
    expect(cutSize({ length: 500, width: 300 }, e, false)).toEqual({ length: 500, width: 300 })
  })
})

describe('newProject', () => {
  it('has one default cabinet and the spec defaults', () => {
    const p = newProject('Test')
    expect(p.schemaVersion).toBe(1)
    expect(p.cabinets).toHaveLength(1)
    expect(p.cabinets[0]).toMatchObject({ label: 'M1', type: 'base', width: 600, height: 720, depth: 560, shelves: 1 })
    expect(p.defaults.board.thickness).toBe(18)
    expect(p.defaults.edge.visible.thickness).toBe(2)
    expect(p.defaults.edge.hidden.thickness).toBe(0.4)
    expect(p.defaults.sheet).toEqual({ length: 2800, width: 2070 })
  })
})
