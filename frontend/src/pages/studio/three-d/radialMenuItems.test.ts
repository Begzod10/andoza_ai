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
import { FLOOR_PATTERN_DEFS } from '@/lib/floorGeometry'
import type { RadialState } from './useSurfaceRadialMenu'

type Call = [string, ...unknown[]]

function harness() {
  const calls: Call[] = []
  return {
    calls,
    deps: {
      setSelectedWall: (id: string | null) => calls.push(['selectWall', id]),
      setActivePhase: (p: string) => calls.push(['phase', p]),
      setShowPanel: (v: boolean) => calls.push(['panel', v]),
      createOpening: (w: string, p: unknown, t: string) => calls.push(['opening', w, t]),
      setShowAddSheet: (v: boolean) => calls.push(['addSheet', v]),
      placeElectrical: (w: string, p: unknown, t: string, h: number) => calls.push(['electrical', w, t, h]),
      placeLight: (p: unknown, t: string) => calls.push(['light', t]),
      setCornice: (trim: { id: string; heightMm: number; widthMm: number }) =>
        calls.push(['cornice', trim.id, trim.heightMm, trim.widthMm]),
      wallpapers: [{ id: 7, name: 'Oq gul', url: '/media/oq-gul.jpg' }],
      applyWallpaper: (url: string) => calls.push(['paper', url]),
      createWindowStyled: (w: string, p: unknown, styleId: string) =>
        calls.push(['window', w, styleId]),
      setSkirting: (trim: { id: string }) => calls.push(['skirting', trim.id]),
      setFloorPattern: (floorType: string, patternId: string, st: { plankLengthCm?: number; plankWidthCm?: number }) =>
        calls.push(['floor', floorType, patternId, st.plankLengthCm, st.plankWidthCm]),
    },
  }
}

const WALL: RadialState = { surface: 'wall', wallId: 'A', point: { x: 0.4, y: 1.2, z: -1.5 } }
const CEILING: RadialState = { surface: 'ceiling', point: { x: 0.4, y: 2.6, z: -0.8 } }
const FLOOR: RadialState = { surface: 'floor', point: { x: 0.4, y: 0, z: -0.8 } }

describe('tapping a wall', () => {
  it('offers paint, a window, a door and the electrics', () => {
    const { deps } = harness()
    expect(buildRadialItems(WALL!, deps as never).map((i) => i.label))
      .toEqual(['Rang', 'Oyna', 'Eshik', 'Elektr'])
  })

  it('papers the wall from the ring, without a trip to the panel', () => {
    const { calls, deps } = harness()
    const rang = buildRadialItems(WALL!, deps as never).find((i) => i.key === 'paint')!
    rang.children!.find((c) => c.key === 'wp:7')!.onSelect()
    expect(calls).toContainEqual(['paper', '/media/oq-gul.jpg'])
    expect(calls.some((c) => c[0] === 'panel')).toBe(false)
  })

  it('still offers the panel, which is where a new paper comes from', () => {
    // The ring can only show what has been uploaded; with nothing uploaded it
    // would otherwise be an empty ring and a dead end.
    const { calls, deps } = harness()
    const rang = buildRadialItems(WALL!, deps as never).find((i) => i.key === 'paint')!
    rang.children![rang.children!.length - 1].onSelect()
    expect(calls).toContainEqual(['panel', true])
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
    // The whole T-series sheet, not a handful of them.
    expect(karniz.children!.length).toBe(trimProfilesOf('cornice').length)
    expect(karniz.children!.map((c) => c.label)).toContain('T 140')
  })

  it("previews each profile with the catalogue's own drawing", () => {
    // A flat silhouette loses the milled detail that tells one profile from
    // another, which is the whole basis for picking one.
    const { deps } = harness()
    const karniz = buildRadialItems(CEILING!, deps as never).find((i) => i.key === 'karniz')!
    const withDrawings = trimProfilesOf('cornice').filter((d) => d.previewUrl)
    expect(withDrawings.length).toBeGreaterThan(0)
    expect(karniz.children!.every((c) => c.fill != null)).toBe(true)
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

  it('still offers the ceiling type picker', () => {
    const { deps } = harness()
    expect(buildRadialItems(CEILING!, deps as never).map((i) => i.label)).toContain('Shift turi')
  })
})

describe('tapping the floor', () => {
  it('offers an object, the two floor materials and the finish panel', () => {
    const { deps } = harness()
    expect(buildRadialItems(FLOOR!, deps as never).map((i) => i.key))
      .toEqual(['object', 'parket', 'kafel', 'floor'])
  })

  it('lays the picked parquet pattern at its own plank size', () => {
    const { calls, deps } = harness()
    const parket = buildRadialItems(FLOOR!, deps as never).find((i) => i.key === 'parket')!
    const def = FLOOR_PATTERN_DEFS.find((d) => d.id === 'chevron')!
    parket.children!.find((c) => c.key === 'parket:chevron')!.onSelect()
    expect(calls).toContainEqual(['floor', 'parquet', 'chevron', def.defaultLengthCm, def.defaultWidthCm])
  })

  it('offers the tile sizes, 600x600 first', () => {
    const { calls, deps } = harness()
    const kafel = buildRadialItems(FLOOR!, deps as never).find((i) => i.key === 'kafel')!
    expect(kafel.children!.map((c) => c.label))
      .toEqual(['600×600', '300×600', '1200×600', '400×400'])
    kafel.children![0].onSelect()
    // Tile is always the same stack bond; the size is what is being chosen.
    expect(calls).toContainEqual(['floor', 'tile', 'stake_bond', 60, 60])
  })

  it('lays a 300x600 tile the long way along the floor', () => {
    const { calls, deps } = harness()
    const kafel = buildRadialItems(FLOOR!, deps as never).find((i) => i.key === 'kafel')!
    kafel.children!.find((c) => c.label === '300×600')!.onSelect()
    expect(calls).toContainEqual(['floor', 'tile', 'stake_bond', 60, 30])
  })
})

describe('tapping a trim run', () => {
  const SKIRTING: RadialState = { surface: 'skirting', point: { x: 0.4, y: 0.05, z: -1.5 } }
  const CORNICE: RadialState = { surface: 'cornice', point: { x: 0.4, y: 2.5, z: -1.5 } }

  it('goes straight to the boards — the tap already said which run', () => {
    const { deps } = harness()
    const items = buildRadialItems(SKIRTING!, deps as never)
    expect(items.length).toBe(trimProfilesOf('skirting').length)
    // No drilling: these ARE the choices.
    expect(items.every((i) => i.children == null)).toBe(true)
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
    items[0].onSelect()
    expect(calls.some((c) => c[0] === 'cornice')).toBe(true)
    expect(calls.some((c) => c[0] === 'skirting')).toBe(false)
  })
})
