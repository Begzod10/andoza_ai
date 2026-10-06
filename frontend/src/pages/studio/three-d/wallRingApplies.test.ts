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
    setCeilingDesign: (id: string) =>
      useRoomStore.getState().setDesignState({
        ceiling: { design: id as never, settings: useRoomStore.getState().designState.ceiling?.settings },
      }),
    setSkirting: (trim: { id: string; heightMm: number; widthMm: number }) =>
      useRoomStore.getState().setDesignState({ skirting: trim }),
    wallpapers: [PAPER],
    applyWallpaper: (url: string, allWalls?: boolean) =>
      useRoomStore.getState().setWallCovering(allWalls ? 'ALL' : resolveTargetWall(wallId ?? null), {
        kind: 'texture', url, color: '#ffffff',
        repeatX: 1, repeatY: 1, offsetX: 0, offsetY: 0, rotation: 0,
      }),
    applyWallColor: (hex: string, allWalls?: boolean) =>
      useRoomStore.getState().setWallCovering(
        allWalls ? 'ALL' : resolveTargetWall(wallId ?? null), { kind: 'paint', color: hex },
      ),
    applyWallTile: (_size: unknown, _face: unknown, allWalls?: boolean) =>
      useRoomStore.getState().setWallCovering(
        allWalls ? 'ALL' : resolveTargetWall(wallId ?? null), { kind: 'paint', color: '#TILE' },
      ),
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

  it('reshapes the ceiling from the ring', () => {
    const ceiling = { surface: 'ceiling', point: { x: 0, y: 2.6, z: 0 } } as NonNullable<RadialState>
    const deps = realDeps(undefined)
    const shift = buildRadialItems(ceiling, deps as never).find((i) => i.key === 'ceiling')!
    shift.children!.find((c) => c.key === 'ceil:floating')!.onSelect()
    expect(useRoomStore.getState().designState.ceiling?.design).toBe('floating')
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

describe('the second tap carries a finish to every wall', () => {
  beforeEach(() => { useRoomStore.getState().resetDesignState() })

  /** The three wall finishes that offer it, and how to reach one from the ring. */
  const FINISHES = [
    { parent: 'paint', child: (items: ReturnType<typeof buildRadialItems>) =>
        items.find((i) => i.key === 'paint')!.children!.find((c) => c.key === `color:${WALL_COLORS[1]}`)! },
    { parent: 'oboy', child: (items: ReturnType<typeof buildRadialItems>) =>
        items.find((i) => i.key === 'oboy')!.children![0] },
    { parent: 'wall-kafel', child: (items: ReturnType<typeof buildRadialItems>) =>
        items.find((i) => i.key === 'wall-kafel')!.children![0].children![1] },
  ]

  it('offers it on all three, and only where there is a choice to carry', () => {
    const items = buildRadialItems(wallTap('B'), realDeps('B') as never)
    for (const f of FINISHES) {
      expect(typeof f.child(items).onSelectAll).toBe('function')
    }
    // The parents open a submenu; there is nothing for a second tap to apply.
    for (const key of ['paint', 'oboy', 'wall-kafel']) {
      expect(items.find((i) => i.key === key)!.onSelectAll).toBeUndefined()
    }
  })

  it('paints only the tapped wall on one tap, and every wall on two', () => {
    const items = buildRadialItems(wallTap('B'), realDeps('B') as never)
    const swatch = FINISHES[0].child(items)

    swatch.onSelect()
    const after = useRoomStore.getState().designState.wallCoverings
    expect(after.B).toEqual({ kind: 'paint', color: WALL_COLORS[1] })

    swatch.onSelectAll!()
    const all = useRoomStore.getState().designState.wallCoverings.ALL
    expect(all).toEqual({ kind: 'paint', color: WALL_COLORS[1] })
  })

  it('papers every wall on the second tap', () => {
    const items = buildRadialItems(wallTap('C'), realDeps('C') as never)
    FINISHES[1].child(items).onSelectAll!()
    const all = useRoomStore.getState().designState.wallCoverings.ALL
    expect(all?.kind).toBe('texture')
    if (all?.kind === 'texture') expect(all.url).toBe(PAPER.url)
  })
})
