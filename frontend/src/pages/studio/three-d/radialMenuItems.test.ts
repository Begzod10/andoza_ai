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

  it('still offers the ceiling type picker', () => {
    const { deps } = harness()
    expect(buildRadialItems(CEILING!, deps as never).map((i) => i.label)).toContain('Shift turi')
  })
})

describe('tapping the floor', () => {
  it('offers an object and the floor finish', () => {
    const { deps } = harness()
    expect(buildRadialItems(FLOOR!, deps as never).map((i) => i.key)).toEqual(['object', 'floor'])
  })
})
