/**
 * The convert-and-place step for the apartment's other rooms.
 *
 * Everything here is a units test in disguise. The API speaks metres with an
 * opening's position as a 0..1 CENTRE fraction; the store and every renderer
 * speak millimetres with the position measured to the opening's LEFT EDGE.
 * Getting that wrong is how a 4 m wall once came out 4 km and how a door
 * placed at a corner was silently re-centred, so the round trip is pinned
 * here rather than trusted to the one caller that used to own it.
 */
import { describe, expect, it } from 'vitest'
import type { Room } from '@/lib/api'
import {
  apiGeometryToStoreGeometry,
  roomScopedElementId,
} from '@/lib/apiRoomGeometry'
import {
  SIBLING_CULL_M,
  SIBLING_FULL_SHELL_ALWAYS,
  SIBLING_FULL_SHELL_RADIUS_M,
  siblingDesignState,
  siblingLodTier,
  siblingRoomView,
} from '@/lib/siblingRoomView'
import { DEFAULT_DESIGN_STATE } from '@/store/roomStore'

/** A saved apartment room as the rooms endpoint actually sends one: `ceiling_h`
 *  and `geometry`, with none of the synthetic fields StudioPage adds. */
function apiRoom(over: Partial<Room> = {}): Room {
  return {
    id: 'sib-1',
    apartment_id: 'apt-1',
    name: 'Yotoqxona',
    ceiling_h: 2.8,
    geometry: {
      walls: [
        { id: 'A', length: 4.2, elements: [] },
        { id: 'B', length: 3.1, elements: [] },
        { id: 'C', length: 4.2, elements: [] },
        { id: 'D', length: 3.1, elements: [] },
      ],
    },
    ...over,
  } as Room
}

describe('apiGeometryToStoreGeometry', () => {
  it('converts wall lengths from metres to millimetres', () => {
    const g = apiGeometryToStoreGeometry(apiRoom().geometry)!
    expect(g.walls.map((w) => w.length)).toEqual([4200, 3100, 4200, 3100])
  })

  it('turns an opening centre fraction into a left-edge millimetre position', () => {
    // A 0.9 m door centred at the middle of a 4 m wall: left edge at
    // 2000 - 450 = 1550 mm.
    const g = apiGeometryToStoreGeometry({
      walls: [{ id: 'A', length: 4, elements: [{ type: 'eshik', width: 0.9, height: 2.1, position: 0.5 }] }],
    })!
    const el = g.walls[0].elements[0]
    expect(el.position).toBe(1550)
    expect(el.width).toBe(900)
    expect(el.height).toBe(2100)
  })

  it('keeps a corner door at its negative left edge instead of re-centring it', () => {
    // The scan can see a door whose centre is less than half its width from
    // the corner. `positionAuto: false` is what stops resolveElementPositions'
    // legacy `position <= 0` fallback treating that as "never placed".
    const g = apiGeometryToStoreGeometry({
      walls: [{ id: 'A', length: 4, elements: [{ type: 'eshik', width: 0.9, height: 2.1, position: 0.1 }] }],
    })!
    const el = g.walls[0].elements[0]
    expect(el.position).toBe(-50)
    expect(el.positionAuto).toBe(false)
  })

  it('converts polygon vertices to millimetres', () => {
    const g = apiGeometryToStoreGeometry({
      walls: [{ id: '0', length: 3, elements: [] }],
      vertices: [[0, 0], [3, 0], [3, 2.5], [0, 2.5]],
    })!
    expect(g.vertices).toEqual([[0, 0], [3000, 0], [3000, 2500], [0, 2500]])
  })

  it('returns null when there is nothing to convert, so each caller picks its own fallback', () => {
    expect(apiGeometryToStoreGeometry(null)).toBeNull()
    expect(apiGeometryToStoreGeometry(undefined)).toBeNull()
    expect(apiGeometryToStoreGeometry({ walls: [] })).toBeNull()
  })

  it('mints element ids that are unique across rooms', () => {
    // Every ABCD room in a flat has a wall called "A", and the live
    // opening-drag channel matches on wallId + elId — so two rooms sharing an
    // element id would drag each other's doors.
    const walls = [{ id: 'A', length: 4, elements: [{ type: 'eshik', width: 0.9, height: 2.1, position: 0.5 }] }]
    const a = apiGeometryToStoreGeometry({ walls }, roomScopedElementId('room-a'))!
    const b = apiGeometryToStoreGeometry({ walls }, roomScopedElementId('room-b'))!
    expect(a.walls[0].elements[0].id).not.toBe(b.walls[0].elements[0].id)
  })

  it('mints the SAME id for the same element twice, so React keys survive a re-convert', () => {
    const walls = [{ id: 'A', length: 4, elements: [{ type: 'eshik', width: 0.9, height: 2.1, position: 0.5 }] }]
    const first = apiGeometryToStoreGeometry({ walls }, roomScopedElementId('room-a'))!
    const again = apiGeometryToStoreGeometry({ walls }, roomScopedElementId('room-a'))!
    expect(first.walls[0].elements[0].id).toBe(again.walls[0].elements[0].id)
  })
})

describe('siblingDesignState', () => {
  it('falls back to the studio default when the room has no saved blob', () => {
    expect(siblingDesignState(null)).toBe(DEFAULT_DESIGN_STATE)
    expect(siblingDesignState({})).toBe(DEFAULT_DESIGN_STATE)
  })

  it('backfills floorConfigured for a room designed before the flag existed', () => {
    // Without the backfill such a room renders the bare-screed placeholder
    // here while the studio shows it its real floor.
    // A genuinely legacy blob has no such key at all, so the spread default
    // survives — note that an explicit `undefined` would NOT, which is exactly
    // how `loadDraftState` behaves for the room being opened.
    const legacy = { ...DEFAULT_DESIGN_STATE } as Record<string, unknown>
    delete legacy.floorConfigured
    const d = siblingDesignState({ designState: legacy as never })
    expect(d.floorConfigured).toBe(true)
  })

  it('does not override an explicit floorConfigured: false', () => {
    const d = siblingDesignState({ designState: { ...DEFAULT_DESIGN_STATE, floorConfigured: false } })
    expect(d.floorConfigured).toBe(false)
  })

  it('reads each room its OWN finishes, so two siblings can differ', () => {
    const a = siblingDesignState({ designState: { ...DEFAULT_DESIGN_STATE, floorType: 'tile' } })
    const b = siblingDesignState({ designState: { ...DEFAULT_DESIGN_STATE, floorType: 'parquet' } })
    expect(a.floorType).toBe('tile')
    expect(b.floorType).toBe('parquet')
  })
})

describe('siblingRoomView', () => {
  it('fills in the synthetic fields the rooms endpoint does not send', () => {
    const v = siblingRoomView(apiRoom(), 3.52, 0)!
    expect(v.heightM).toBe(2.8)
    expect(v.room.ceiling_height).toBe(2.8)
    // length = wall A = X extent; width = wall B = Z extent (lib/roomDims).
    expect(v.room.length).toBeCloseTo(4.2)
    expect(v.room.width).toBeCloseTo(3.1)
  })

  it('reads extents off the walls rather than the API row', () => {
    const v = siblingRoomView(apiRoom(), 0, 0)!
    expect(v.widthM).toBeCloseTo(4.2)
    expect(v.depthM).toBeCloseTo(3.1)
  })

  it('defaults a missing ceiling height to the studio 2.7 m', () => {
    expect(siblingRoomView(apiRoom({ ceiling_h: null }), 0, 0)!.heightM).toBe(2.7)
    expect(siblingRoomView(apiRoom({ ceiling_h: 0 }), 0, 0)!.heightM).toBe(2.7)
  })

  it('carries the offset through and derives the distance from it', () => {
    const v = siblingRoomView(apiRoom(), 3, 4)!
    expect(v.offsetXM).toBe(3)
    expect(v.offsetZM).toBe(4)
    expect(v.distanceM).toBeCloseTo(5)
  })

  it('skips a room with no geometry rather than inventing a box in the flat', () => {
    expect(siblingRoomView(apiRoom({ geometry: null }), 0, 0)).toBeNull()
  })

  it('picks up the room\'s own furniture and lights', () => {
    const v = siblingRoomView(
      apiRoom({ state: { furniture: [{ id: 'f1' }], lights: [{ id: 'l1' }] } as unknown as Room['state'] }),
      0, 0,
    )!
    expect(v.furniture).toHaveLength(1)
    expect(v.lights).toHaveLength(1)
  })

  it('defaults furniture and lights to empty arrays for a room with no state blob', () => {
    const v = siblingRoomView(apiRoom(), 0, 0)!
    expect(v.furniture).toEqual([])
    expect(v.lights).toEqual([])
  })
})

describe('siblingLodTier', () => {
  it('gives every room the full shell in a normal-sized flat', () => {
    // The whole point of the feature is seeing the flat as one thing; a radius
    // rule that degraded a four-room apartment would fail at the size that
    // matters most.
    for (const d of [0.5, 5, 18, 40]) {
      expect(siblingLodTier(d, SIBLING_FULL_SHELL_ALWAYS)).toBe('full')
    }
  })

  it('spends the full shell on the near rooms once a flat is bigger', () => {
    const many = SIBLING_FULL_SHELL_ALWAYS + 1
    expect(siblingLodTier(0, many)).toBe('full')
    expect(siblingLodTier(SIBLING_FULL_SHELL_RADIUS_M, many)).toBe('full')
    expect(siblingLodTier(SIBLING_FULL_SHELL_RADIUS_M + 0.01, many)).toBe('block')
  })

  it('is monotone: a nearer room is never drawn at a lower tier than a further one', () => {
    const many = 14
    const rank = { full: 2, block: 1, hidden: 0 }
    let previous = 3
    for (let d = 0; d <= SIBLING_CULL_M + 10; d += 1) {
      const current = rank[siblingLodTier(d, many)]
      expect(current).toBeLessThanOrEqual(previous)
      previous = current
    }
  })

  it('draws nothing past the sanity limit, including for a broken position', () => {
    expect(siblingLodTier(SIBLING_CULL_M + 1, 2)).toBe('hidden')
    expect(siblingLodTier(Number.NaN, 2)).toBe('hidden')
    expect(siblingLodTier(Number.POSITIVE_INFINITY, 2)).toBe('hidden')
  })
})

/**
 * An assumption about three.js that the sibling pick box rests on, pinned here
 * so a three upgrade that changes it fails a test instead of silently making
 * every neighbouring room untappable.
 *
 * The box is the only part of a sibling room that takes part in picking (see
 * `SiblingPickBox`), and it is `visible={false}` so it costs nothing to render
 * and is excluded from both shadow passes. That only works because three's
 * raycaster does not test `visible` — `intersect()` checks layers and calls
 * `raycast()`, and `Mesh.raycast` checks only that a material exists.
 */
describe('the invisible pick box stays pickable', () => {
  it('raycasts a mesh with visible = false', async () => {
    const THREE = await import('three')
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial())
    mesh.visible = false
    mesh.updateMatrixWorld(true)
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(0, 0, 10),
      new THREE.Vector3(0, 0, -1),
    )
    expect(raycaster.intersectObjects([mesh], true)).toHaveLength(2)
  })
})
