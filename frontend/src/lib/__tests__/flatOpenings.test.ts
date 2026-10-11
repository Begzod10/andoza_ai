/**
 * "when door is created on the wall between 2 rooms … that door between should
 * be visible in both rooms because it connects rooms to each other."
 *
 * The approved design: a doorway through a shared partition is drawn ONCE for
 * the whole flat — one lining spanning the measured gap, one leaf, and an
 * architrave on EACH face — and it looks the same whichever room is being
 * edited: the owner, the neighbour, or a third room.
 *
 * Fixtures start from the user's real pair (apartment 0cda3742…, read from
 * production on 2026-10-11): room 215919f0 is 4 × 3 m at layout (0, 0) with a
 * 900 mm door on wall B whose centre is at 0.4155 of the wall; room 49678d4b
 * is 3.5 × 3 m at (3.85, 0), so its wall D stands 100 mm east of that wall B
 * (0 + 2 + 0.1 = 3.85 − 1.75). Both carry the CCW `vertices` the server fills
 * in for every four-wall room. The other doors are deliberately off-centre or
 * hard against a corner, on walls C and D, where the legacy rectangle's
 * from-the-minimum convention and the CCW loop disagree.
 */
import { describe, expect, it } from 'vitest'
import { flatRenderPlan, hiddenByCamera, openingInventory, physicalKey } from '@/lib/flatOpenings'
import { apiGeometryToStoreGeometry, roomScopedElementId } from '@/lib/apiRoomGeometry'
import { placedSiblingRooms } from '@/pages/studio/three-d/helpers'
import type { PlacedRoom } from '@/lib/borrowedOpenings'
import type { Room } from '@/lib/api'
import type { RoomGeometry, WallElement } from '@/store/roomStore'

const OWNER = '215919f0-a85e-4e16-abeb-93dd01bed0f1'
const NEIGHBOUR = '49678d4b-9769-49ee-9b03-e5655bfeabf9'
const THIRD = 'third-room'

/** The two rooms exactly as GET /apartments/0cda3742…/rooms returned them. */
const realRooms: Room[] = [
  {
    id: OWNER, apartment_id: 'apt', name: 'Xona', ceiling_h: 3,
    geometry: {
      walls: [
        { id: 'A', length: 4, elements: [] },
        { id: 'B', length: 3, elements: [{ id: 'd95c', type: 'eshik', width: 0.9, height: 2.1, sashes: null, position: 0.41552481060484237, style_id: 'p009', sill_height: 0 }] },
        { id: 'C', length: 4, elements: [] },
        { id: 'D', length: 3, elements: [] },
      ],
      vertices: [[0, 0], [4, 0], [4, 3], [0, 3]],
    },
    state: { layoutPos: { x: 0, z: 0 } },
  },
  {
    id: NEIGHBOUR, apartment_id: 'apt', name: 'Xona', ceiling_h: 3,
    geometry: {
      walls: [
        { id: 'A', length: 3.5, elements: [] },
        { id: 'B', length: 3, elements: [] },
        { id: 'C', length: 3.5, elements: [] },
        { id: 'D', length: 3, elements: [] },
      ],
      vertices: [[0, 0], [3.5, 0], [3.5, 3], [0, 3]],
    },
    state: { layoutPos: { x: 3.85, z: 0 } },
  },
] as unknown as Room[]

/** The plan exactly as the studio builds it with `activeId` open: the active
 *  room from its store geometry at the origin, the rest through
 *  `placedSiblingRooms` (the real layout pass). */
function planFor(rooms: Room[], activeId: string) {
  const r = rooms.find((x) => x.id === activeId)!
  const geometry = apiGeometryToStoreGeometry(r.geometry, roomScopedElementId(r.id))!
  const W = geometry.walls[0].length / 1000
  const D = geometry.walls[1].length / 1000
  const pos = (r.state as { layoutPos: { x: number; z: number } }).layoutPos
  const siblings = placedSiblingRooms(rooms, activeId, W, D, pos)
  return flatRenderPlan({ id: activeId, geometry, offsetXM: 0, offsetZM: 0 }, siblings)
}

function rect(wMm: number, dMm: number, els: Partial<Record<'A' | 'B' | 'C' | 'D', WallElement[]>> = {}): RoomGeometry {
  return {
    walls: (['A', 'B', 'C', 'D'] as const).map((id) => ({
      id, length: id === 'A' || id === 'C' ? wMm : dMm, elements: els[id] ?? [],
    })),
    vertices: [[0, 0], [wMm, 0], [wMm, dMm], [0, dMm]],
  }
}
function door(id: string, position: number, extra: Partial<WallElement> = {}): WallElement {
  return { id, type: 'eshik', width: 900, height: 2100, sill_height: 0, position, positionAuto: false, ...extra }
}
/** The plan with `activeId` at the origin; offsets re-based on it. */
function planOf(rooms: PlacedRoom[], activeId: string) {
  const a = rooms.find((r) => r.id === activeId)!
  const rebased = rooms.map((r) => ({ ...r, offsetXM: r.offsetXM - a.offsetXM, offsetZM: r.offsetZM - a.offsetZM }))
  return flatRenderPlan(rebased.find((r) => r.id === activeId)!, rebased.filter((r) => r.id !== activeId))
}

const ONE_DOORWAY = { linings: 1, leaves: 1, architraves: 2 }

describe('the user\'s real pair: one doorway, drawn once, trimmed on both faces', () => {
  const key = `${OWNER}:${OWNER}:B:0`
  for (const active of [OWNER, NEIGHBOUR]) {
    it(`with ${active === OWNER ? 'the owner' : 'the neighbour'} open`, () => {
      expect(openingInventory(planFor(realRooms, active)).get(key)).toEqual(ONE_DOORWAY)
    })
  }

  it('is a hole in both rooms\' walls, at the same physical place', () => {
    for (const active of [OWNER, NEIGHBOUR]) {
      const plan = planFor(realRooms, active)
      const ownerShell = active === OWNER ? plan.active.shell : plan.siblings.get(OWNER)!.shell
      const nbShell = active === NEIGHBOUR ? plan.active.shell : plan.siblings.get(NEIGHBOUR)!.shell
      // 0.4155 × 3000 − 450 = 796.6 mm from wall B's −z end; wall D of the
      // neighbour also runs from −z (legacy rectangle), from the same z.
      expect(ownerShell.walls.find((w) => w.id === 'B')!.elements.map((e) => Math.round(e.position))).toEqual([797])
      const hole = nbShell.walls.find((w) => w.id === 'D')!.elements
      expect(hole.map((e) => e.position)).toEqual([797])
      expect(physicalKey(NEIGHBOUR, hole[0])).toBe(key)
    }
  })

  it('is editable only from the owner, and only once', () => {
    const editable = (active: string) => planFor(realRooms, active).active.leaves
      .filter((l) => l.interactive)
      .flatMap((l) => l.geometry.walls.flatMap((w) => w.elements.filter((e) => !e.bare).map((e) => physicalKey(active, e))))
    expect(editable(OWNER)).toEqual([key])
    expect(editable(NEIGHBOUR)).toEqual([])
  })
})

describe('a door hard against a corner, owned by either side, seen from any room', () => {
  // Owner 4 × 3 at (0, 0). East: 3.5 × 3 at 100 mm (the real pair's gap).
  // South: 3 × 3 at 200 mm, shifted 0.5 m east, so its wall A spans x −1.0 … 2.0.
  // North: a third room, 150 mm away, with no opening towards anyone.
  const scene = (els: { owner?: Parameters<typeof rect>[2]; east?: Parameters<typeof rect>[2]; south?: Parameters<typeof rect>[2] }): PlacedRoom[] => [
    { id: 'owner', geometry: rect(4000, 3000, els.owner), offsetXM: 0, offsetZM: 0 },
    { id: 'east', geometry: rect(3500, 3000, els.east), offsetXM: 3.85, offsetZM: 0 },
    { id: 'south', geometry: rect(3000, 3000, els.south), offsetXM: 0.5, offsetZM: 3.2 },
    { id: 'north', geometry: rect(4000, 3000), offsetXM: 0, offsetZM: -3.15 },
  ]
  const everyActive = ['owner', 'east', 'south', 'north']

  it('on the east neighbour\'s wall D, flush in its −z corner', () => {
    const rooms = scene({ east: { D: [door('d1', 0, { hinge: 'right', openAngle: 30 })] } })
    for (const active of everyActive) {
      expect(openingInventory(planOf(rooms, active)).get('east:d1'), `active ${active}`).toEqual(ONE_DOORWAY)
    }
  })

  it('on the owner\'s wall C, flush against its +x corner and the south room\'s', () => {
    // 3100 + 900 = 4000: the door's right jamb is the owner's corner, and on
    // the south room's wall A (from x = −1.0) it is 2100 … 3000, its corner.
    const rooms = scene({ owner: { C: [door('c1', 3100)] } })
    for (const active of everyActive) {
      const plan = planOf(rooms, active)
      expect(openingInventory(plan).get('owner:c1'), `active ${active}`).toEqual(ONE_DOORWAY)
      const south = active === 'south' ? plan.active.shell : plan.siblings.get('south')!.shell
      expect(south.walls.find((w) => w.id === 'A')!.elements.map((e) => e.position)).toEqual([2100])
    }
  })

  it('a door that already exists on both sides is still one doorway', () => {
    // Rooms created through a wall carry a real copy of its door
    // (lib/sharedOpenings): two stored openings, one physical hole.
    const rooms = scene({ owner: { B: [door('b1', 600)] }, east: { D: [door('d1', 600)] } })
    for (const active of everyActive) {
      const inv = openingInventory(planOf(rooms, active))
      const a = inv.get('owner:b1')!
      const b = inv.get('east:d1')!
      expect({ linings: a.linings + b.linings, leaves: a.leaves + b.leaves, architraves: a.architraves + b.architraves },
        `active ${active}`).toEqual(ONE_DOORWAY)
    }
    // Whichever of the two is open keeps its own copy editable.
    for (const [active, key] of [['owner', 'owner:b1'], ['east', 'east:d1']]) {
      const editable = planOf(rooms, active).active.leaves.filter((l) => l.interactive)
        .flatMap((l) => l.geometry.walls.flatMap((w) => w.elements.filter((e) => !e.bare).map((e) => physicalKey(active, e))))
      expect(editable).toEqual([key])
    }
  })

  it('a door to nowhere keeps its one architrave', () => {
    // Wall A of the south room faces the owner, but its west door is past the
    // owner's corner (x −1.0 … −0.1 is inside the owner's span; at −2.4 it is not).
    const rooms = scene({ owner: { D: [door('w1', 1000)] } })
    for (const active of everyActive) {
      expect(openingInventory(planOf(rooms, active)).get('owner:w1')).toEqual({ linings: 1, leaves: 1, architraves: 1 })
    }
  })
})

describe('a shared doorway seen from behind its owner wall', () => {
  // "now there is hole but no door … from behind, in front there is door":
  // orbiting round to the neighbour's side puts the camera behind the owner's
  // wall, and the cutaway hid that wall's door with it — leaving only the
  // neighbour's bare hole. The neighbour's wall is still standing there, so
  // the one drawing of the doorway has to stay.
  const own = { id: 'e1', type: 'eshik', width: 900, height: 2100, position: 1000, sill_height: 0 } as WallElement
  const shared = { ...own, sharedPartition: true } as WallElement
  it('keeps a shared-partition opening when its wall is behind the camera', () => {
    expect(hiddenByCamera(shared, 'B', new Set(['B']))).toBe(false)
  })
  it('still hides an ordinary opening with its wall', () => {
    expect(hiddenByCamera(own, 'B', new Set(['B']))).toBe(true)
    expect(hiddenByCamera(own, 'B', new Set(['A']))).toBe(false)
    expect(hiddenByCamera(own, 'B', undefined)).toBe(false)
  })
})
