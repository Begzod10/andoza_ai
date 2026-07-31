/**
 * The whole point of generating these finishes instead of shipping photos is
 * that they are small, deterministic and self-contained — that is what lets a
 * wall keep its surface across a reload. Pin those three properties.
 */
import { describe, it, expect } from 'vitest'
import {
  PLASTER_FINISHES,
  plasterTextureUrl,
  plasterRepeat,
} from '../plasterFinishes'

describe('plaster finishes', () => {
  it('offers a concrete finish', () => {
    expect(PLASTER_FINISHES.map((f) => f.id)).toContain('beton')
  })

  it('generates the same URL every time — so "is this applied?" can compare', () => {
    for (const f of PLASTER_FINISHES) {
      expect(plasterTextureUrl(f)).toBe(plasterTextureUrl(f))
    }
  })

  it('gives each finish a distinct surface', () => {
    const urls = new Set(PLASTER_FINISHES.map(plasterTextureUrl))
    expect(urls.size).toBe(PLASTER_FINISHES.length)
  })

  it('stays small enough to persist inline', () => {
    for (const f of PLASTER_FINISHES) {
      const url = plasterTextureUrl(f)
      expect(url.startsWith('data:image/svg+xml')).toBe(true)
      // Comfortably under the 64 KB inline cap the draft snapshot enforces
      expect(url.length).toBeLessThan(8 * 1024)
    }
  })

  it('has no external references — nothing to fetch after a reload', () => {
    for (const f of PLASTER_FINISHES) {
      const svg = decodeURIComponent(plasterTextureUrl(f).split(',')[1])
      expect(svg).not.toMatch(/href|src=|<script/i)
    }
  })

  it('repeats by physical wall size, so the grain does not stretch', () => {
    const f = PLASTER_FINISHES[0]
    const small = plasterRepeat(f, 2, 2.7)
    const wide = plasterRepeat(f, 8, 2.7)
    expect(wide.repeatX).toBeGreaterThan(small.repeatX)
    expect(wide.repeatY).toBeCloseTo(small.repeatY)
  })
})
