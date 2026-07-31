/**
 * A finish has to still be on the wall after a reload, which means it has to
 * be in the draft snapshot — and that snapshot goes to localStorage, which has
 * a hard quota. `persistableDesignState` is the filter in between. Pin both
 * halves: an ordinary finish survives, and an oversized inline photo is
 * dropped rather than being allowed to blow up the whole write.
 */
import { describe, it, expect } from 'vitest'
import { persistableDesignState, DEFAULT_DESIGN_STATE } from '../../store/roomStore'
import type { DesignState, WallCovering } from '../../store/roomStore'
import { PLASTER_FINISHES, plasterTextureUrl } from '../plasterFinishes'

const concrete = PLASTER_FINISHES.find((f) => f.id === 'beton')!

function textured(url: string): WallCovering {
  return { kind: 'texture', url, color: '#ffffff', repeatX: 1, repeatY: 1, offsetX: 0, offsetY: 0, rotation: 0 }
}

function stateWith(coverings: Partial<Record<string, WallCovering>>, floorTexture?: string | null): DesignState {
  return {
    ...DEFAULT_DESIGN_STATE,
    wallCoverings: { ...DEFAULT_DESIGN_STATE.wallCoverings, ...coverings },
    floorTexture: floorTexture ?? null,
  }
}

describe('persistableDesignState', () => {
  it('keeps a generated concrete finish — the point of generating it', () => {
    const url = plasterTextureUrl(concrete)
    const out = persistableDesignState(stateWith({ ALL: textured(url) }))
    expect(out.wallCoverings.ALL).toEqual(textured(url))
  })

  it('keeps a short server-hosted URL', () => {
    const url = '/media/wallpapers/beton.jpg'
    const out = persistableDesignState(stateWith({ B: textured(url) }))
    expect((out.wallCoverings.B as { url: string }).url).toBe(url)
  })

  it('drops an oversized inline photo back to the default finish', () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(200_000)
    const out = persistableDesignState(stateWith({ ALL: textured(huge) }))

    expect(out.wallCoverings.ALL).toEqual(DEFAULT_DESIGN_STATE.wallCoverings.ALL)
    // and the snapshot is small enough to actually store
    expect(JSON.stringify(out).length).toBeLessThan(10_000)
  })

  it('keeps a server-hosted floor image — the normal upload path', () => {
    const url = 'http://localhost:8000/media/wallpapers/abc.jpg'
    expect(persistableDesignState(stateWith({}, url)).floorTexture).toBe(url)
  })

  it('drops an oversized inline floor photo but keeps a small one', () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(200_000)
    expect(persistableDesignState(stateWith({}, huge)).floorTexture).toBeNull()

    const small = 'data:image/png;base64,' + 'A'.repeat(100)
    expect(persistableDesignState(stateWith({}, small)).floorTexture).toBe(small)
  })

  it('leaves paint and wallpaper untouched', () => {
    const input = stateWith({
      A: { kind: 'paint', color: '#123456' },
      C: { kind: 'oboy', patternId: 'damask', baseColor: '#fff', accentColor: '#000' },
    })
    const out = persistableDesignState(input)
    expect(out.wallCoverings.A).toEqual(input.wallCoverings.A)
    expect(out.wallCoverings.C).toEqual(input.wallCoverings.C)
  })
})
