/**
 * What each surface offers when it is tapped, and what picking one does.
 *
 * Two of these encode decisions that were made deliberately and would be easy
 * to undo by accident: sockets belong to the wall that was tapped (not the
 * corner menu, which knew neither wall nor spot), and the ceiling's fixtures
 * fan out in the ring rather than sending the user to the design panel — a
 * ceiling tap already says where the light goes, and the panel threw that away.
 */
import { describe, it, expect } from 'vitest'
import { buildRadialItems } from './radialMenuItems'
import { trimProfilesOf } from '@/lib/trimProfiles'
import { WINDOW_STYLES } from '@/lib/windowStyles'
import { DOOR_STYLES } from '@/lib/doorStyles'
import { FLOOR_PATTERN_DEFS } from '@/lib/floorGeometry'
import { TILE_SIZES, TILE_FACES } from '@/lib/tileCatalog'
import { WALL_COLORS } from '@/lib/wallPalette'
import { CEILING_DESIGNS } from '@/lib/ceilingDesigns'
import type { RadialState } from './useSurfaceRadialMenu'

type Call = [string, ...unknown[]]

function harness() {
  const calls: Call[] = []
  const settings: Record<string, unknown>[] = []
  return {
    calls,
    settings,
    deps: {
      setSelectedWall: (id: string | null) => calls.push(['selectWall', id]),
      setActivePhase: (p: string) => calls.push(['phase', p]),
      setShowPanel: (v: boolean) => calls.push(['panel', v]),
      createOpening: (w: string, p: unknown, t: string) => calls.push(['opening', w, t]),
      setShowAddSheet: (v: boolean) => calls.push(['addSheet', v]),
      placeElectrical: (w: string, p: unknown, t: string, h: number) => calls.push(['electrical', w, t, h]),
      placeLight: (p: unknown, t: string) => calls.push(['light', t]),
      setCornice: (trim: { id: string; heightMm: number; widthMm: number } | null) =>
        calls.push(trim ? ['cornice', trim.id, trim.heightMm, trim.widthMm] : ['cornice', null]),
      wallpapers: [{ id: 7, name: 'Oq gul', url: '/media/oq-gul.jpg' }],
      applyWallpaper: (url: string) => calls.push(['paper', url]),
      applyWallColor: (hex: string) => calls.push(['color', hex]),
      applyWallTile: (size: { label: string }, face: { slug: string }) =>
        calls.push(['wallTile', size.label, face.slug]),
      createWindowStyled: (w: string, p: unknown, styleId: string) =>
        calls.push(['window', w, styleId]),
      createDoorStyled: (w: string, p: unknown, styleId: string) =>
        calls.push(['door', w, styleId]),
      restyleOpening: (w: string, elId: string, styleId: string) =>
        calls.push(['restyle', w, elId, styleId]),
      setSkirting: (trim: { id: string } | null) => calls.push(['skirting', trim?.id ?? null]),
      setCeilingDesign: (id: string) => calls.push(['ceiling', id]),
      setFloorPattern: (floorType: string, patternId: string, st: Record<string, unknown>) => {
        settings.push(st)
        calls.push(['floor', floorType, patternId, st.plankLengthCm, st.plankWidthCm])
      },
    },
  }
}

const WALL: RadialState = { surface: 'wall', wallId: 'A', point: { x: 0.4, y: 1.2, z: -1.5 } }
const CEILING: RadialState = { surface: 'ceiling', point: { x: 0.4, y: 2.6, z: -0.8 } }
const FLOOR: RadialState = { surface: 'floor', point: { x: 0.4, y: 0, z: -0.8 } }

describe('tapping a wall', () => {
  it('offers paint, paper, tile, a window, a door and the electrics', () => {
    const { deps } = harness()
    expect(buildRadialItems(WALL!, deps as never).map((i) => i.label))
      .toEqual(['Rang', 'Oboy', 'Kafel', 'Oyna', 'Eshik', 'Elektr'])
  })

  it('tiles the wall with the size and the face that were picked', () => {
    const { calls, deps } = harness()
    const kafel = buildRadialItems(WALL!, deps as never).find((i) => i.key === 'wall-kafel')!
    // Every size leads on to every face: a tile is both, and half of one is
    // not a choice.
    expect(kafel.children!.map((c) => c.label)).toEqual(TILE_SIZES.map((t) => t.label))
    for (const size of kafel.children!) {
      expect(size.children!.map((c) => c.label)).toEqual(TILE_FACES.map((f) => f.label))
    }
    kafel.children![1].children![2].onSelect()
    expect(calls).toContainEqual(['wallTile', TILE_SIZES[1].label, TILE_FACES[2].slug])
  })

  it('keeps Rang to colours — every one of them, and nothing else', () => {
    const { deps } = harness()
    const rang = buildRadialItems(WALL!, deps as never).find((i) => i.key === 'paint')!
    const colours = rang.children!.filter((c) => c.key.startsWith('color:') && c.key !== 'color:panel')
    expect(colours.map((c) => c.key.slice('color:'.length))).toEqual([...WALL_COLORS])
    expect(rang.children!.some((c) => c.key.startsWith('wp:'))).toBe(false)
  })

  it('paints the wall the colour that was tapped', () => {
    const { calls, deps } = harness()
    const rang = buildRadialItems(WALL!, deps as never).find((i) => i.key === 'paint')!
    rang.children!.find((c) => c.key === `color:${WALL_COLORS[2]}`)!.onSelect()
    expect(calls).toContainEqual(['color', WALL_COLORS[2]])
  })

  it('keeps Oboy to the papers', () => {
    const { calls, deps } = harness()
    const oboy = buildRadialItems(WALL!, deps as never).find((i) => i.key === 'oboy')!
    expect(oboy.children!.some((c) => c.key.startsWith('color:'))).toBe(false)
    oboy.children!.find((c) => c.key === 'wp:7')!.onSelect()
    expect(calls).toContainEqual(['paper', '/media/oq-gul.jpg'])
  })

  it('papers the wall from the ring, without a trip to the panel', () => {
    const { calls, deps } = harness()
    const oboy = buildRadialItems(WALL!, deps as never).find((i) => i.key === 'oboy')!
    oboy.children!.find((c) => c.key === 'wp:7')!.onSelect()
    expect(calls).toContainEqual(['paper', '/media/oq-gul.jpg'])
    expect(calls.some((c) => c[0] === 'panel')).toBe(false)
  })

  it('offers the panel only when there is no paper to show', () => {
    // With papers, the ring is papers and nothing else. With none it would be
    // an empty ring and a dead end, so it points at where papers come from.
    const withPapers = harness()
    const oboy = buildRadialItems(WALL!, withPapers.deps as never).find((i) => i.key === 'oboy')!
    expect(oboy.children!.some((c) => c.key === 'wp:panel')).toBe(false)

    const bare = harness()
    bare.deps.wallpapers = []
    const empty = buildRadialItems(WALL!, bare.deps as never).find((i) => i.key === 'oboy')!
    expect(empty.children!.map((c) => c.key)).toEqual(['wp:panel'])
    empty.children![0].onSelect()
    expect(bare.calls).toContainEqual(['panel', true])
  })

  it('keeps the colours to colours, with no way out to the panel', () => {
    const { deps } = harness()
    const rang = buildRadialItems(WALL!, deps as never).find((i) => i.key === 'paint')!
    expect(rang.children!.every((c) => c.key.startsWith('color:'))).toBe(true)
    expect(rang.children!.some((c) => c.key === 'color:panel')).toBe(false)
  })

  it('offers the leaf designs, and hangs the picked one on the tapped wall', () => {
    const { calls, deps } = harness()
    const eshik = buildRadialItems(WALL!, deps as never).find((i) => i.key === 'door')!
    expect(eshik.children!.length).toBe(DOOR_STYLES.length)
    // Drawn, not iconised — the panel layout is the whole choice.
    expect(eshik.children!.every((c) => c.fill != null)).toBe(true)
    eshik.children!.find((c) => c.key === 'door:p032')!.onSelect()
    expect(calls).toContainEqual(['door', 'A', 'p032'])
  })

  it('draws every window style, rather than one grid icon eighteen times', () => {
    const { deps } = harness()
    const oyna = buildRadialItems(WALL!, deps as never).find((i) => i.key === 'window')!
    const styles = oyna.children!.filter((c) => c.key !== 'win:custom')
    expect(styles.every((c) => c.fill != null)).toBe(true)
  })

  it('offers the window styles, and puts the picked one on the tapped wall', () => {
    const { calls, deps } = harness()
    const oyna = buildRadialItems(WALL!, deps as never).find((i) => i.key === 'window')!
    expect(oyna.children!.length).toBeGreaterThan(WINDOW_STYLES.length - 1)
    oyna.children!.find((c) => c.key === 'win:double')!.onSelect()
    expect(calls).toContainEqual(['window', 'A', 'double'])
  })

  it('keeps the sheet for a window that has to be exact', () => {
    // Style alone does not fix width, height or colour, so the long way in
    // must not disappear behind the shortcut.
    const { calls, deps } = harness()
    const oyna = buildRadialItems(WALL!, deps as never).find((i) => i.key === 'window')!
    oyna.children!.find((c) => c.key === 'win:custom')!.onSelect()
    expect(calls).toContainEqual(['opening', 'A', 'deraza'])
  })

  it('puts a device on the wall that was tapped, at its catalogue height', () => {
    const { calls, deps } = harness()
    const elektr = buildRadialItems(WALL!, deps as never).find((i) => i.key === 'elektr')!
    const socket = elektr.children!.find((c) => c.key === 'el:socket1')!
    socket.onSelect()
    expect(calls).toContainEqual(['electrical', 'A', 'socket1', 300])
  })

  it('draws each fitting, rather than one socket icon seven times', () => {
    const { deps } = harness()
    const elektr = buildRadialItems(WALL!, deps as never).find((i) => i.key === 'elektr')!
    expect(elektr.children!.every((c) => c.fill != null)).toBe(true)
  })

  it('offers the air conditioner, at the height it hangs', () => {
    const { calls, deps } = harness()
    const elektr = buildRadialItems(WALL!, deps as never).find((i) => i.key === 'elektr')!
    expect(elektr.children!.map((c) => c.label)).toContain('Konditsioner')
    elektr.children!.find((c) => c.key === 'el:ac')!.onSelect()
    expect(calls).toContainEqual(['electrical', 'A', 'ac', 2400])
  })
})

describe('tapping the ceiling', () => {
  it('fans the fixtures out rather than opening the design panel', () => {
    const { calls, deps } = harness()
    const chiroq = buildRadialItems(CEILING!, deps as never).find((i) => i.key === 'light')!
    expect(chiroq.children!.length).toBeGreaterThan(5)
    chiroq.children![0].onSelect()
    expect(calls.some((c) => c[0] === 'light')).toBe(true)
    expect(calls.some((c) => c[0] === 'panel'), 'must not jump to the panel').toBe(false)
  })

  it('hangs the fixture that was actually picked', () => {
    const { calls, deps } = harness()
    const chiroq = buildRadialItems(CEILING!, deps as never).find((i) => i.key === 'light')!
    const chandelier = chiroq.children!.find((c) => c.key === 'light:chandelier')!
    chandelier.onSelect()
    expect(calls).toContainEqual(['light', 'chandelier'])
  })

  it('offers the cornice profiles, since the cornice runs along the ceiling edge', () => {
    const { deps } = harness()
    const karniz = buildRadialItems(CEILING!, deps as never).find((i) => i.key === 'karniz')!
    expect(karniz.label).toBe('Karniz')
    // The whole T-series sheet, not a handful of them — plus the way out.
    expect(karniz.children!.length).toBe(trimProfilesOf('cornice').length + 1)
    expect(karniz.children![0].key).toBe('cornice:none')
    expect(karniz.children!.map((c) => c.label)).toContain('T 140')
  })

  it("previews each profile with the catalogue's own drawing", () => {
    // A flat silhouette loses the milled detail that tells one profile from
    // another, which is the whole basis for picking one.
    const { deps } = harness()
    const karniz = buildRadialItems(CEILING!, deps as never).find((i) => i.key === 'karniz')!
    const withDrawings = trimProfilesOf('cornice').filter((d) => d.previewUrl)
    expect(withDrawings.length).toBeGreaterThan(0)
    // "Yo'q" is not a profile and has nothing to draw.
    expect(karniz.children!.slice(1).every((c) => c.fill != null)).toBe(true)
  })

  it('runs the picked profile at its own catalogue size', () => {
    // Adopting the profile's sizes is what the panel and the corner menu do;
    // keeping the previous profile's numbers would render the wrong section.
    const { calls, deps } = harness()
    const karniz = buildRadialItems(CEILING!, deps as never).find((i) => i.key === 'karniz')!
    const def = trimProfilesOf('cornice')[3]
    karniz.children!.find((c) => c.key === `cornice:${def.id}`)!.onSelect()
    expect(calls).toContainEqual(['cornice', def.id, def.defaultHeightMm, def.defaultWidthMm])
  })

  it('picks a cornice without sending the user to the panel', () => {
    const { calls, deps } = harness()
    const karniz = buildRadialItems(CEILING!, deps as never).find((i) => i.key === 'karniz')!
    karniz.children![0].onSelect()
    expect(calls.some((c) => c[0] === 'panel')).toBe(false)
  })

  it('gives every fixture its own drawing, not one lamp icon repeated', () => {
    const { deps } = harness()
    const chiroq = buildRadialItems(CEILING!, deps as never).find((i) => i.key === 'light')!
    expect(chiroq.children!.every((c) => c.fill != null)).toBe(true)
  })

  it('fans the ceiling profiles out too, drawings only', () => {
    const { calls, deps } = harness()
    const shift = buildRadialItems(CEILING!, deps as never).find((i) => i.key === 'ceiling')!
    expect(shift.label).toBe('Shift turi')
    const profiles = shift.children!
    expect(profiles.length).toBe(CEILING_DESIGNS.length)
    // No panel escape: the shape is the whole choice here.
    expect(profiles.some((c) => c.key === 'ceil:panel')).toBe(false)
    // Picked by eye: the drawing carries it, a name under each is noise.
    expect(profiles.every((c) => c.hideLabel && c.fill != null)).toBe(true)
    profiles.find((c) => c.key === 'ceil:floating')!.onSelect()
    expect(calls).toContainEqual(['ceiling', 'floating'])
    expect(calls.some((c) => c[0] === 'panel')).toBe(false)
  })
})

describe('tapping the floor', () => {
  it('offers the two materials a floor is, and nothing else', () => {
    const { deps } = harness()
    expect(buildRadialItems(FLOOR!, deps as never).map((i) => i.key))
      .toEqual(['parket', 'kafel'])
  })

  it('lays the picked parquet pattern with the pattern\'s own numbers', () => {
    // No overrides from the ring: the sizes, the arris and the tone variation
    // all belong to the pattern now, so passing any of them here would only
    // be a chance to disagree with it.
    const { calls, settings, deps } = harness()
    const parket = buildRadialItems(FLOOR!, deps as never).find((i) => i.key === 'parket')!
    parket.children!.find((c) => c.key === 'parket:chevron')!.onSelect()
    expect(calls).toContainEqual(['floor', 'parquet', 'chevron', undefined, undefined])
    expect(settings[0]).toEqual({})
  })

  it('offers the tile sizes, 600x600 first', () => {
    const { deps } = harness()
    const kafel = buildRadialItems(FLOOR!, deps as never).find((i) => i.key === 'kafel')!
    expect(kafel.children!.map((c) => c.label))
      .toEqual(['600×600', '300×600', '1200×600', '400×400'])
  })

  it('lays the tile once its face is picked — size and face are one choice', () => {
    const { calls, deps } = harness()
    const kafel = buildRadialItems(FLOOR!, deps as never).find((i) => i.key === 'kafel')!
    const size = kafel.children!.find((c) => c.label === '300×600')!
    // The size alone does nothing: it leads on to the face.
    size.onSelect()
    expect(calls).toEqual([])
    size.children!.find((c) => c.label === 'Oddiy')!.onSelect()
    // Tile is always the same stack bond; size and face are the choices.
    expect(calls).toContainEqual(['floor', 'tile', 'stake_bond', 60, 30])
  })

  it('offers a plain tile and the three marbles for every size', () => {
    const { deps } = harness()
    const kafel = buildRadialItems(FLOOR!, deps as never).find((i) => i.key === 'kafel')!
    for (const size of kafel.children!) {
      expect(size.children!.map((c) => c.label))
        .toEqual(['Oddiy', 'Marmar oq', 'Marmar qora', 'Marmar kulrang'])
    }
  })

  it('lets the marble keep its own colours', () => {
    // Multiplied by the tile grey, a white marble comes out grey.
    const { settings, deps } = harness()
    const kafel = buildRadialItems(FLOOR!, deps as never).find((i) => i.key === 'kafel')!
    kafel.children![0].children!.find((c) => c.label === 'Marmar oq')!.onSelect()
    expect(settings[0].textureUrl).toBe('/floor/tile/marble-white.jpg')
    expect(settings[0].baseColor).toBe('#ffffff')
  })

  it('runs the veining down a long tile, not across it', () => {
    const { settings, deps } = harness()
    const kafel = buildRadialItems(FLOOR!, deps as never).find((i) => i.key === 'kafel')!
    const long = kafel.children!.find((c) => c.label === '1200×600')!
    long.children!.find((c) => c.label === 'Marmar kulrang')!.onSelect()
    expect(settings[0].textureRotation).toBe(90)
    const square = kafel.children!.find((c) => c.label === '600×600')!
    square.children!.find((c) => c.label === 'Marmar kulrang')!.onSelect()
    expect(settings[1].textureRotation).toBe(0)
  })
})

describe('staying open', () => {
  // Picking a finish is a matter of trying a few: a ring that shut after every
  // pick had to be reopened for each one.
  it('keeps every finish choice open', () => {
    const { deps } = harness()
    const items = [
      ...buildRadialItems(WALL!, deps as never),
      ...buildRadialItems(CEILING!, deps as never),
      ...buildRadialItems(FLOOR!, deps as never),
    ]
    const finishes = items
      .flatMap((i) => i.children ?? [])
      .filter((c) => !c.key.endsWith(':panel') && c.key !== 'win:custom')
    expect(finishes.length).toBeGreaterThan(20)
    expect(finishes.some((c) => c.closesMenu)).toBe(false)
  })

  it('closes for the ones that open a panel or a sheet behind it', () => {
    const { deps } = harness()
    const wall = buildRadialItems(WALL!, deps as never)
    const bare = harness()
    bare.deps.wallpapers = []
    const panels = [
      wall.find((i) => i.key === 'window')!.children!.find((c) => c.key === 'win:custom')!,
      buildRadialItems(WALL!, bare.deps as never)
        .find((i) => i.key === 'oboy')!.children!.find((c) => c.key === 'wp:panel')!,
    ]
    expect(panels.every((c) => c.closesMenu)).toBe(true)
  })
})

describe('tapping an opening', () => {
  const DOOR: RadialState = { surface: 'door', wallId: 'B', elId: 'e9', point: { x: 0, y: 1, z: 0 } }
  const WIN: RadialState = { surface: 'window', wallId: 'B', elId: 'e4', point: { x: 0, y: 1.4, z: 0 } }

  it('offers the leaf designs for the door that was tapped', () => {
    const { calls, deps } = harness()
    const items = buildRadialItems(DOOR!, deps as never)
    expect(items.length).toBe(DOOR_STYLES.length)
    expect(items.every((i) => i.fill != null)).toBe(true)
    items.find((i) => i.key === 'door:p034')!.onSelect()
    // Changes THAT door — it does not hang another one beside it.
    expect(calls).toEqual([['restyle', 'B', 'e9', 'p034']])
  })

  it('offers the sash layouts for a tapped window', () => {
    const { calls, deps } = harness()
    const items = buildRadialItems(WIN!, deps as never)
    expect(items.length).toBe(WINDOW_STYLES.length)
    items.find((i) => i.key === 'win:triple')!.onSelect()
    expect(calls).toEqual([['restyle', 'B', 'e4', 'triple']])
  })

  it('does nothing when the ring somehow has no opening to change', () => {
    const { calls, deps } = harness()
    const orphan = { surface: 'door', wallId: 'B', point: { x: 0, y: 1, z: 0 } } as NonNullable<RadialState>
    buildRadialItems(orphan, deps as never)[0].onSelect()
    expect(calls).toEqual([])
  })
})

describe('tapping a trim run', () => {
  const SKIRTING: RadialState = { surface: 'skirting', point: { x: 0.4, y: 0.05, z: -1.5 } }
  const CORNICE: RadialState = { surface: 'cornice', point: { x: 0.4, y: 2.5, z: -1.5 } }

  it('goes straight to the boards — the tap already said which run', () => {
    const { deps } = harness()
    const items = buildRadialItems(SKIRTING!, deps as never)
    expect(items.length).toBe(trimProfilesOf('skirting').length + 1)
    // No drilling: these ARE the choices.
    expect(items.every((i) => i.children == null)).toBe(true)
  })

  it('offers taking the run out, first, on both trims', () => {
    // A room can have no cornice, and a user who added one needs a way back.
    const { calls, deps } = harness()
    const skirting = buildRadialItems(SKIRTING!, deps as never)
    expect(skirting[0].key).toBe('skirting:none')
    skirting[0].onSelect()
    expect(calls).toContainEqual(['skirting', null])

    const cornice = buildRadialItems(CORNICE!, deps as never)
    expect(cornice[0].key).toBe('cornice:none')
    cornice[0].onSelect()
    expect(calls).toContainEqual(['cornice', null])
  })

  it('changes the skirting to the board that was picked', () => {
    const { calls, deps } = harness()
    const def = trimProfilesOf('skirting')[1]
    buildRadialItems(SKIRTING!, deps as never).find((i) => i.key === `skirting:${def.id}`)!.onSelect()
    expect(calls).toContainEqual(['skirting', def.id])
  })

  it('offers cornice profiles for the cornice, not skirting boards', () => {
    const { calls, deps } = harness()
    const items = buildRadialItems(CORNICE!, deps as never)
    expect(items.map((i) => i.label)).toContain('T 140')
    items[1].onSelect()
    expect(calls.some((c) => c[0] === 'cornice')).toBe(true)
    expect(calls.some((c) => c[0] === 'skirting')).toBe(false)
  })
})
