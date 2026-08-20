/**
 * The six ceiling profiles, checked where they can actually go wrong: a border
 * wider than the room, a strip that appears in a design with no cove to hide
 * it, or a part that ends up above the slab it is supposed to hang below.
 */
import { describe, it, expect } from 'vitest'
import {
  CEILING_DESIGNS,
  CEILING_SETTING_RANGE,
  buildCeilingParts,
  ceilingDesign,
  resolveCeilingSettings,
  type CeilingDesignId,
} from '../ceilingDesigns'

const W = 5
const D = 4
const H = 2.8

function partsFor(id: CeilingDesignId, overrides = {}) {
  const design = ceilingDesign(id)
  return buildCeilingParts(design, resolveCeilingSettings(design, overrides), W, D, H)
}

const ALL_IDS = CEILING_DESIGNS.map((d) => d.id)

describe('the catalogue', () => {
  it('has the six profiles, each with lighting to go with it', () => {
    expect(ALL_IDS).toEqual(['flat', 'double_layer', 'floating', 'border', 'non_drop', 'recessed'])
    for (const d of CEILING_DESIGNS) {
      expect(d.lighting.length).toBeGreaterThan(0)
      expect(d.label).not.toBe('')
      expect(d.hint).not.toBe('')
    }
  })

  it('falls back rather than throwing on an unknown id', () => {
    expect(ceilingDesign('nonesuch').id).toBe('non_drop')
    expect(ceilingDesign(undefined).id).toBe('non_drop')
  })

  it('only offers sliders for settings a design actually uses', () => {
    for (const d of CEILING_DESIGNS) {
      for (const key of d.uses) {
        if (key === 'strip' || key === 'color') continue
        expect(CEILING_SETTING_RANGE[key], `${d.id} uses ${key}`).toBeDefined()
      }
    }
  })

  it('layers defaults: global, then design, then saved', () => {
    const floating = ceilingDesign('floating')
    expect(resolveCeilingSettings(floating).border).toBe(500) // design's own
    expect(resolveCeilingSettings(floating).stripK).toBe(3000) // global
    expect(resolveCeilingSettings(floating, { border: 700 }).border).toBe(700)
  })
})

describe('buildCeilingParts', () => {
  it('builds nothing for the non-drop — the slab IS the ceiling', () => {
    expect(partsFor('non_drop')).toEqual([])
  })

  it('builds something for every other profile', () => {
    for (const id of ALL_IDS.filter((i) => i !== 'non_drop')) {
      expect(partsFor(id).length, id).toBeGreaterThan(0)
    }
  })

  it('hangs everything below the slab and above head height', () => {
    for (const id of ALL_IDS) {
      for (const p of partsFor(id)) {
        const top = p.position[1] + p.size[1] / 2
        expect(top, `${id} pokes through the slab`).toBeLessThanOrEqual(H + 1e-9)
        expect(p.position[1] - p.size[1] / 2, `${id} hangs too low`).toBeGreaterThan(H - 0.7)
      }
    }
  })

  it('never emits a part with a negative or zero dimension', () => {
    for (const id of ALL_IDS) {
      for (const p of partsFor(id)) {
        for (const dim of p.size) expect(dim, id).toBeGreaterThan(0)
      }
    }
  })

  it('keeps parts inside the room', () => {
    for (const id of ALL_IDS) {
      for (const p of partsFor(id)) {
        expect(Math.abs(p.position[0]) + p.size[0] / 2).toBeLessThanOrEqual(W / 2 + 1e-9)
        expect(Math.abs(p.position[2]) + p.size[2] / 2).toBeLessThanOrEqual(D / 2 + 1e-9)
      }
    }
  })

  it('survives a border wider than the room', () => {
    // The ring's inner span goes negative if the border is not clamped, which
    // is a box with a negative dimension and a renderer full of NaN.
    for (const id of ALL_IDS) {
      const parts = partsFor(id, { border: 5000 })
      for (const p of parts) for (const dim of p.size) expect(dim, id).toBeGreaterThan(0)
    }
  })

  it('survives a room narrower than the smallest border', () => {
    const design = ceilingDesign('border')
    const parts = buildCeilingParts(design, resolveCeilingSettings(design), 1.2, 1.2, 2.4)
    for (const p of parts) for (const dim of p.size) expect(dim).toBeGreaterThan(0)
  })

  it('drops the strip when it is switched off', () => {
    for (const id of ALL_IDS) {
      expect(partsFor(id, { strip: false }).some((p) => p.kind === 'strip'), id).toBe(false)
    }
  })

  it('lights the cove only in the designs that have one', () => {
    for (const d of CEILING_DESIGNS) {
      const hasStrip = partsFor(d.id, { strip: true }).some((p) => p.kind === 'strip')
      expect(hasStrip, d.id).toBe(d.uses.includes('strip'))
    }
  })

  it('lowers the whole ceiling for a flat one, and only the edge for a border', () => {
    const flat = partsFor('flat', { strip: false })
    expect(flat).toHaveLength(1)
    expect(flat[0].size[0]).toBeCloseTo(W, 6)
    expect(flat[0].size[2]).toBeCloseTo(D, 6)

    // A border leaves the middle open — nothing spans the room.
    for (const p of partsFor('border')) {
      expect(p.size[0] < W - 0.01 || p.size[2] < D - 0.01).toBe(true)
    }
  })

  it('floats its panel clear of every wall', () => {
    const panel = partsFor('floating').find((p) => p.kind === 'panel')!
    expect(panel.size[0]).toBeLessThan(W - 0.5)
    expect(panel.size[2]).toBeLessThan(D - 0.5)
  })

  it('drops the second layer below the first', () => {
    const parts = partsFor('double_layer', { strip: false })
    const levels = parts.map((p) => p.position[1] - p.size[1] / 2)
    expect(Math.max(...levels) - Math.min(...levels)).toBeGreaterThan(0.05)
  })

  it('tracks the drop setting', () => {
    const shallow = partsFor('flat', { drop: 60, strip: false })[0].position[1]
    const deep = partsFor('flat', { drop: 300, strip: false })[0].position[1]
    expect(deep).toBeLessThan(shallow)
    expect(shallow - deep).toBeCloseTo(0.24, 5)
  })
})
