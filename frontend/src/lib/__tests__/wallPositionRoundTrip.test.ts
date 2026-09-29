/**
 * API ↔ studio round trip for `WallElement.position`.
 *
 * `wallPositionConvention.test.ts` pins down which END of a wall position is
 * measured from. This file pins down which POINT OF THE OPENING it marks, the
 * other half of the same contract and the half that was wrong:
 *
 *   API (backend/app/schemas/room.py)   the opening's CENTRE, 0..1 of length
 *   studio store (roomStore.ts)         the opening's LEFT EDGE, millimetres
 *
 * The studio used to read the fraction straight into its millimetre field and
 * then render `position + width/2`, i.e. half a width past where the scan
 * measured the opening: 450 mm for the shared fixture's 900 mm door. The two
 * numbers below are that fixture's real converter output, so this test fails
 * against the physical scan, not against a restatement of the frontend code.
 *
 * Every case is a full loop — load an API room, resolve and render it, save it
 * back — because the load and save halves can each be wrong on their own and
 * can also be wrong in opposite directions, which looks stable on a re-save
 * and still draws the opening in the wrong place.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useRoomStore, type WallElement } from '@/store/roomStore'
import { wallDefsFromVertices } from '../wallDefsFromVertices'
import { resolveElementPositions, wallElementsToApiPositions } from '../wallPositions'

type ApiElement = {
  type: 'eshik' | 'deraza'
  width: number
  height: number
  sill_height: number
  position: number
}

/** backend/tests/fixtures/captured_room_sample.json through
 *  `convert_captured_room`: a 4 × 3 m room whose door's true centre is 1.2 m
 *  along wall 0 (the scan's own `m[12] = -0.8`, 1.2 m from the merged corner)
 *  and whose window's true centre is 1.5 m along wall 2. */
const SAMPLE_VERTICES: [number, number][] = [
  [0, 0],
  [4, 0],
  [4, 3],
  [0, 3],
]
const SAMPLE_DOOR: ApiElement = {
  type: 'eshik', width: 0.9, height: 2.1, sill_height: 0, position: 0.3,
}
const SAMPLE_WINDOW: ApiElement = {
  type: 'deraza', width: 1.5, height: 1.2, sill_height: 0.85, position: 0.375,
}

/** backend/tests/fixtures/captured_room_real_scan2.json, converted. The door
 *  sits at 0.909 of a 6.696 m wall — its centre is 610 mm from that corner, so
 *  under a left-edge reading the leaf would hang 352 mm past the end of the
 *  wall. Nothing else in this suite exercises an opening that close to a
 *  corner, which is where the two conventions differ most visibly. */
const SCAN_VERTICES: [number, number][] = [
  [8.669, 4.926],
  [3.62, 7.788],
  [2.429, 7.58],
  [0, 3.316],
  [5.817, 0],
]
const SCAN_DOOR: ApiElement = {
  type: 'eshik', width: 0.962, height: 2.04, sill_height: 0, position: 0.909,
}

function apiRoom(
  vertices: [number, number][],
  elementsByWall: Record<number, ApiElement[]>,
) {
  const n = vertices.length
  return {
    id: 'round-trip-room',
    name: 'Xona',
    ceiling_h: 2.5,
    geometry: {
      walls: vertices.map((_, i) => ({
        id: String(i),
        length: Math.hypot(
          vertices[(i + 1) % n][0] - vertices[i][0],
          vertices[(i + 1) % n][1] - vertices[i][1],
        ),
        elements: elementsByWall[i] ?? [],
      })),
      vertices,
    },
  }
}

/** The physical point the API names, independent of any frontend code: a
 *  fraction of the way from `vertices[i]` to `vertices[i + 1]`, in metres. */
function apiCentreWorldM(
  vertices: [number, number][],
  wall: number,
  fraction: number,
): [number, number] {
  const n = vertices.length
  const [x1, z1] = vertices[wall]
  const [x2, z2] = vertices[(wall + 1) % n]
  return [x1 + (x2 - x1) * fraction, z1 + (z2 - z1) * fraction]
}

/** …the same point in the centroid-centred metres the 3D scene draws in. */
function toSceneM(
  vertices: [number, number][],
  [x, z]: [number, number],
): [number, number] {
  const n = vertices.length
  return [
    x - vertices.reduce((s, [vx]) => s + vx, 0) / n,
    z - vertices.reduce((s, [, vz]) => s + vz, 0) / n,
  ]
}

/** Where the studio actually draws an opening's centre, in scene metres.
 *  Mirrors NWallRoomShell / WallOpenings: `mid + dir * (along - length/2)`,
 *  with `along` the resolved left edge plus half the width. */
function renderedCentreM(
  vertices: [number, number][],
  wallIndex: number,
  elements: WallElement[],
  elementIndex: number,
): [number, number] {
  const store = useRoomStore.getState()
  const wall = store.geometry.walls[wallIndex]
  const defs = wallDefsFromVertices(
    store.geometry.vertices!,
    store.geometry.walls.map((w) => w.id),
  )
  const def = defs[wall.id]
  const el = resolveElementPositions(elements, wall.length)[elementIndex]
  const alongM = (el.position + el.width / 2) / 1000
  return [
    def.midX + def.dirX * (alongM - def.length / 2),
    def.midZ + def.dirZ * (alongM - def.length / 2),
  ]
}

/** One save, exactly as StudioPage/WizardPage build their geometry payload. */
function saveGeometry() {
  const { geometry } = useRoomStore.getState()
  return geometry.walls.map((w) => wallElementsToApiPositions(w.elements, w.length))
}

beforeEach(() => {
  useRoomStore.getState().resetRoom()
})

describe('WallElement.position round trip', () => {
  const cases = [
    { name: 'scanned door, mid-wall', verts: SAMPLE_VERTICES, wall: 0, el: SAMPLE_DOOR },
    { name: 'scanned window, mid-wall', verts: SAMPLE_VERTICES, wall: 2, el: SAMPLE_WINDOW },
    { name: 'scanned door, hard against a corner', verts: SCAN_VERTICES, wall: 3, el: SCAN_DOOR },
  ] as const

  for (const { name, verts, wall, el } of cases) {
    it(`draws the ${name} where the scan measured it`, () => {
      useRoomStore.getState().loadRoom(apiRoom(verts as [number, number][], { [wall]: [el] }))
      const elements = useRoomStore.getState().geometry.walls[wall].elements

      const drawn = renderedCentreM(verts as [number, number][], wall, elements, 0)
      const truth = toSceneM(
        verts as [number, number][],
        apiCentreWorldM(verts as [number, number][], wall, el.position),
      )
      // Sub-millimetre: the store rounds to whole millimetres on the way in.
      expect(drawn[0]).toBeCloseTo(truth[0], 3)
      expect(drawn[1]).toBeCloseTo(truth[1], 3)
    })

    it(`saves the ${name} back unchanged`, () => {
      useRoomStore.getState().loadRoom(apiRoom(verts as [number, number][], { [wall]: [el] }))
      const lengthM = useRoomStore.getState().geometry.walls[wall].length / 1000
      // Compared as a distance, not as a fraction: the store rounds to whole
      // millimetres, so the fraction's own tolerance depends on wall length.
      expect(Math.abs(saveGeometry()[wall][0] - el.position) * lengthM * 1000).toBeLessThan(1)
    })
  }

  it('does not drift over repeated save/reload cycles', () => {
    // The asymmetry that would compound: if load and save disagree by any
    // fixed amount, the stored fraction walks along the wall one cycle at a
    // time. Ten cycles turns a 1 mm-per-cycle asymmetry into a visible shift.
    let position = SAMPLE_DOOR.position
    for (let i = 0; i < 10; i++) {
      useRoomStore.getState().loadRoom(apiRoom(SAMPLE_VERTICES, { 0: [{ ...SAMPLE_DOOR, position }] }))
      position = saveGeometry()[0][0]
    }
    // 4 m wall, mm rounding: any real drift would be far past half a mm.
    expect(Math.abs(position - SAMPLE_DOOR.position) * 4000).toBeLessThan(0.5)
  })

  it('keeps a dragged opening where the user dropped it', () => {
    useRoomStore.getState().loadRoom(apiRoom(SAMPLE_VERTICES, { 0: [SAMPLE_DOOR] }))
    const store = useRoomStore.getState()
    const wall = store.geometry.walls[0]
    const el = wall.elements[0]
    // A drag writes the LEFT EDGE in store millimetres and marks the placement
    // explicit — the studio's own path, not the API's.
    store.updateElement(wall.id, el.id, { position: 2600, positionAuto: false })

    const dropped = renderedCentreM(
      SAMPLE_VERTICES, 0, useRoomStore.getState().geometry.walls[0].elements, 0,
    )
    const saved = saveGeometry()[0][0]
    useRoomStore.getState().loadRoom(apiRoom(SAMPLE_VERTICES, { 0: [{ ...SAMPLE_DOOR, position: saved }] }))
    const reloaded = renderedCentreM(
      SAMPLE_VERTICES, 0, useRoomStore.getState().geometry.walls[0].elements, 0,
    )

    expect(reloaded[0]).toBeCloseTo(dropped[0], 3)
    expect(reloaded[1]).toBeCloseTo(dropped[1], 3)
  })

  it('keeps two auto-placed openings on one wall apart across a save', () => {
    // Auto placeholders (`position: 0`, `positionAuto: true` — what
    // RoomSettingsSheet adds) render spread along the wall, but used to be
    // saved as the literal 0.5 the old shortcut wrote for any position ≤ 0.
    // Both then reloaded onto the wall's midpoint, stacked on top of each
    // other, and the spread was gone for good.
    useRoomStore.getState().loadRoom(apiRoom(SAMPLE_VERTICES, {}))
    const store = useRoomStore.getState()
    const wallId = store.geometry.walls[0].id
    store.addElement(wallId, { type: 'deraza', width: 900, height: 1200, sill_height: 800, position: 0, positionAuto: true })
    store.addElement(wallId, { type: 'deraza', width: 900, height: 1200, sill_height: 800, position: 0, positionAuto: true })

    const wall = useRoomStore.getState().geometry.walls[0]
    const before = [0, 1].map((i) =>
      renderedCentreM(SAMPLE_VERTICES, 0, wall.elements, i),
    )
    expect(before[0][0]).not.toBeCloseTo(before[1][0], 3)

    const saved = saveGeometry()[0]
    useRoomStore.getState().loadRoom(
      apiRoom(SAMPLE_VERTICES, {
        0: saved.map((position) => ({
          type: 'deraza' as const, width: 0.9, height: 1.2, sill_height: 0.8, position,
        })),
      }),
    )
    const after = [0, 1].map((i) =>
      renderedCentreM(SAMPLE_VERTICES, 0, useRoomStore.getState().geometry.walls[0].elements, i),
    )
    for (const i of [0, 1]) {
      expect(after[i][0]).toBeCloseTo(before[i][0], 3)
      expect(after[i][1]).toBeCloseTo(before[i][1], 3)
    }
  })
})
