/**
 * The ring wired to the real store, rather than to spies: picking a colour or
 * a paper has to come out the other end as the wall's covering, on the wall
 * that was tapped. The spy tests above prove the menu calls what it says it
 * calls; this proves the call lands.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { buildRadialItems } from './radialMenuItems'
import type { RadialState } from './useSurfaceRadialMenu'
import { useRoomStore } from '@/store/roomStore'
import { resolveTargetWall } from '@/components/studio/design-panel/shared'
import { WALL_COLORS } from '@/lib/wallPalette'

const PAPER = { id: 3, name: 'Gul', url: '/media/gul.jpg' }

/** The same wiring ThreeDPage passes, for the parts under test. */
function realDeps(wallId: string | undefined) {
  const noop = () => {}
  return {
    setSelectedWall: noop,
    setActivePhase: noop,
    setShowPanel: noop,
    createOpening: noop,
    setShowAddSheet: noop,
    placeElectrical: noop,
    placeLight: noop,
    setCornice: noop,
    setSkirting: (trim: { id: string; heightMm: number; widthMm: number }) =>
      useRoomStore.getState().setDesignState({ skirting: trim }),
    wallpapers: [PAPER],
    applyWallpaper: (url: string) =>
      useRoomStore.getState().setWallCovering(resolveTargetWall(wallId ?? null), {
        kind: 'texture', url, color: '#ffffff',
        repeatX: 1, repeatY: 1, offsetX: 0, offsetY: 0, rotation: 0,
      }),
    applyWallColor: (hex: string) =>
      useRoomStore.getState().setWallCovering(resolveTargetWall(wallId ?? null), { kind: 'paint', color: hex }),
    createWindowStyled: noop,
    setFloorPattern: (floorType: 'parquet' | 'tile', id: string, settings: object) =>
      useRoomStore.getState().setDesignState({
        floorType,
        floorPattern: { id: id as never, settings },
        floorConfigured: true,
      }),
  }
}

const wallTap = (wallId: string): NonNullable<RadialState> =>
  ({ surface: 'wall', wallId, point: { x: 0, y: 1.2, z: -1.5 } }) as NonNullable<RadialState>

function pick(state: NonNullable<RadialState>, itemKey: string, childKey: string) {
  const deps = realDeps(state.wallId)
  const item = buildRadialItems(state, deps as never).find((i) => i.key === itemKey)!
  item.children!.find((c) => c.key === childKey)!.onSelect()
}

describe('the wall ring, against the real store', () => {
  beforeEach(() => { useRoomStore.getState().resetDesignState() })

  it('paints the wall that was tapped, and only that wall', () => {
    pick(wallTap('B'), 'paint', `color:${WALL_COLORS[0]}`)
    const coverings = useRoomStore.getState().designState.wallCoverings
    expect(coverings.B).toEqual({ kind: 'paint', color: WALL_COLORS[0] })
    expect(coverings.A).toBeUndefined()
  })

  it('papers it, as a texture the wall renderer understands', () => {
    pick(wallTap('A'), 'oboy', 'wp:3')
    expect(useRoomStore.getState().designState.wallCoverings.A)
      .toMatchObject({ kind: 'texture', url: PAPER.url })
  })

  it('paints over a paper on the same wall, rather than layering', () => {
    pick(wallTap('A'), 'oboy', 'wp:3')
    pick(wallTap('A'), 'paint', `color:${WALL_COLORS[1]}`)
    expect(useRoomStore.getState().designState.wallCoverings.A)
      .toEqual({ kind: 'paint', color: WALL_COLORS[1] })
  })
})

describe('the floor and trim rings, against the real store', () => {
  beforeEach(() => { useRoomStore.getState().resetDesignState() })

  it('lays the tile at the size and face that were picked', () => {
    const floor = { surface: 'floor', point: { x: 0, y: 0, z: 0 } } as NonNullable<RadialState>
    const deps = realDeps(undefined)
    const kafel = buildRadialItems(floor, deps as never).find((i) => i.key === 'kafel')!
    const size = kafel.children!.find((c) => c.label === '600×600')!
    size.children!.find((c) => c.label === 'Marmar qora')!.onSelect()

    const d = useRoomStore.getState().designState
    expect(d.floorType).toBe('tile')
    expect(d.floorConfigured).toBe(true)
    expect(d.floorPattern).toMatchObject({
      id: 'stake_bond',
      settings: { plankLengthCm: 60, plankWidthCm: 60, textureUrl: '/floor/tile/marble-black.jpg' },
    })
  })

  it('changes the skirting to the board that was tapped, at its real height', () => {
    const skirting = { surface: 'skirting', point: { x: 0, y: 0.05, z: 0 } } as NonNullable<RadialState>
    const deps = realDeps(undefined)
    const items = buildRadialItems(skirting, deps as never)
    items.find((i) => i.key === 'skirting:b053')!.onSelect()

    const trim = useRoomStore.getState().designState.skirting
    expect(trim).toMatchObject({ id: 'b053' })
    // A skirting board is 119-168 mm tall. Anything near 40 is a bead, and
    // read as a thin line in the room.
    expect(trim!.heightMm).toBeGreaterThanOrEqual(119)
  })
})
