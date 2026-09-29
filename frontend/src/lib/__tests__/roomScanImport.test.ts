/**
 * Units at the LiDAR → store boundary.
 *
 * `scanToApiGeometry` is the only producer of a room from a RoomPlan scan, and
 * its only consumer is `loadRoom`, which takes the API's units: METRES, with
 * each opening's CENTRE as a 0..1 fraction of its wall. The converter used to
 * return the store's own shape instead — millimetres, measured to the left
 * edge — which `loadRoom` then multiplied by 1000 again, so a scanned 4 m wall
 * reached the studio as 4,000,000 mm (4 km).
 *
 * The two shapes are structurally identical, so nothing but a test catches the
 * swap. These assert on the numbers the studio ends up with, not on the
 * converter's intermediate output, because that is where the 1000× showed up.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useRoomStore } from '@/store/roomStore'
import { scanToApiGeometry, type ScannedRoom } from '../roomScanImport'

/** A plain 4 × 3 m room, 2.7 m ceiling, with a 0.9 m door on the back wall
 *  whose left edge is 1.5 m from the left corner (centre at 1.95 m), and a
 *  1.5 m window on the right wall sill-mounted at 0.85 m. */
const SCAN: ScannedRoom = {
  ceilingHeight: 2.7,
  walls: [
    {
      startX: 0, startZ: 0, endX: 4, endZ: 0, heightM: 2.7,
      openings: [{ type: 'eshik', offsetM: 1.5, widthM: 0.9, heightM: 2.1, sillM: 0 }],
    },
    {
      startX: 4, startZ: 0, endX: 4, endZ: 3, heightM: 2.7,
      openings: [{ type: 'deraza', offsetM: 0.75, widthM: 1.5, heightM: 1.2, sillM: 0.85 }],
    },
    { startX: 4, startZ: 3, endX: 0, endZ: 3, heightM: 2.7, openings: [] },
    { startX: 0, startZ: 3, endX: 0, endZ: 0, heightM: 2.7, openings: [] },
  ],
}

describe('scanToApiGeometry', () => {
  it('reports every distance in metres, not millimetres', () => {
    const { geometry, ceilingM } = scanToApiGeometry(SCAN)

    expect(geometry.walls.map((w) => w.length)).toEqual([4, 3, 4, 3])
    expect(ceilingM).toBe(2.7)

    const door = geometry.walls[0].elements![0]
    expect(door.width).toBe(0.9)
    expect(door.height).toBe(2.1)
    expect(door.sill_height).toBe(0)

    const window = geometry.walls[1].elements![0]
    expect(window.width).toBe(1.5)
    expect(window.sill_height).toBe(0.85)
  })

  it('reports opening positions as 0..1 centre fractions', () => {
    const { geometry } = scanToApiGeometry(SCAN)

    // Door centre 1.5 + 0.9/2 = 1.95 m along a 4 m wall.
    expect(geometry.walls[0].elements![0].position).toBeCloseTo(1.95 / 4, 6)
    // Window centre 0.75 + 1.5/2 = 1.5 m along the 3 m wall.
    expect(geometry.walls[1].elements![0].position).toBeCloseTo(1.5 / 3, 6)

    for (const wall of geometry.walls) {
      for (const el of wall.elements ?? []) {
        expect(el.position).toBeGreaterThanOrEqual(0)
        expect(el.position).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('scan → loadRoom (the path LidarPage takes)', () => {
  beforeEach(() => {
    useRoomStore.getState().resetRoom()
  })

  it('puts a scanned 4 m wall into the store as 4000 mm', () => {
    const { geometry, ceilingM } = scanToApiGeometry(SCAN)
    useRoomStore.getState().loadRoom({ geometry, ceiling_h: ceilingM })

    const walls = useRoomStore.getState().geometry.walls
    expect(walls.map((w) => w.length)).toEqual([4000, 3000, 4000, 3000])
    expect(useRoomStore.getState().ceilingHeight).toBe(2700)

    // Every wall stays inside the backend's 25 m limit — the 1000× bug blew
    // straight past it and the room could not be saved at all.
    for (const w of walls) expect(w.length).toBeLessThan(25_000)
  })

  it('puts the scanned door back where the scan measured it', () => {
    const { geometry, ceilingM } = scanToApiGeometry(SCAN)
    useRoomStore.getState().loadRoom({ geometry, ceiling_h: ceilingM })

    const door = useRoomStore.getState().geometry.walls[0].elements[0]
    expect(door.width).toBe(900)
    expect(door.height).toBe(2100)
    // Store position is the LEFT EDGE in mm — the scan's own offsetM × 1000,
    // round-tripped through the API's centre fraction.
    expect(door.position).toBe(1500)
    // Explicit, not a placeholder: resolveElementPositions must not re-centre it.
    expect(door.positionAuto).toBe(false)

    const window = useRoomStore.getState().geometry.walls[1].elements[0]
    expect(window.width).toBe(1500)
    expect(window.sill_height).toBe(850)
    expect(window.position).toBe(750)
  })

  it('keeps a corner-flush door in the corner', () => {
    // position 0 is the case the legacy `position <= 0` auto-placement
    // fallback would silently re-centre.
    const corner: ScannedRoom = {
      ...SCAN,
      walls: SCAN.walls.map((w, i) =>
        i === 0
          ? { ...w, openings: [{ type: 'eshik' as const, offsetM: 0, widthM: 0.9, heightM: 2.1, sillM: 0 }] }
          : { ...w, openings: [] },
      ),
    }
    const { geometry, ceilingM } = scanToApiGeometry(corner)
    useRoomStore.getState().loadRoom({ geometry, ceiling_h: ceilingM })

    const door = useRoomStore.getState().geometry.walls[0].elements[0]
    expect(door.position).toBe(0)
  })
})
