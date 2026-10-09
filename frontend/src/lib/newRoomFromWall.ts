/**
 * Adding a room through the wall you are standing in front of.
 *
 * The apartment has always been able to grow — but only from the top-down
 * view, where four "+" buttons float off the room's four sides, and only by
 * leaving the studio for the wizard. Standing inside the room looking at a
 * wall, the thing a person actually wants is "put the next room through
 * THERE", and the wall they are looking at already says which side that is.
 *
 * So this turns a tapped wall into the side it faces, and a few dimensions
 * into the room that goes there. It is the same placement arithmetic the
 * wizard does when it lands with `?side=…` in the URL — kept in one place and
 * tested, because two copies of it is how adjacent rooms ended up overlapping
 * once already (see the comment in WizardPage's persistLayoutPos).
 *
 * Units are the project's usual split and the usual trap: the STORE works in
 * millimetres, the API in metres. Everything here is named `…Mm` or `…M` for
 * that reason.
 */
import { planPolygon } from '@/lib/planPolygon'
import type { WallElement as ApiWallElement } from '@/lib/api/rooms'
import type { RoomGeometry } from '@/store/roomStore'

/** Matches `RoomSide` in pages/studio/three-d/constants.ts — the same four
 *  strings, declared here so this module owes nothing to the page layer. */
export type RoomSide = 'north' | 'south' | 'east' | 'west'

/** What a new room starts as, millimetres. A bedroom-ish 3.5 x 3.0 under a
 *  2.7 m ceiling — the sizes the wizard already defaults to, so a room added
 *  from the wall is the same room you would have got the long way round. */
export const NEW_ROOM_DEFAULT_MM = { width: 3500, depth: 3000, height: 2700, wallThickness: 100 }

/** What the dimension fields accept, millimetres. Wide enough for a corridor
 *  at one end and a hall at the other; narrow enough that a stray keystroke
 *  cannot produce a room the camera has to fly for a minute to cross. */
export const NEW_ROOM_LIMITS_MM = {
  width: { min: 1200, max: 12000 },
  depth: { min: 1200, max: 12000 },
  height: { min: 2000, max: 4500 },
  /** A single partition at the thin end, a structural external wall at the
   *  thick. 100 mm is the ordinary plastered block partition between two
   *  rooms of one flat. */
  wallThickness: { min: 50, max: 500 },
}

export type RoomDimensionKey = keyof typeof NEW_ROOM_LIMITS_MM

/** Hold a typed dimension inside its limits, in millimetres. */
export function clampRoomDimension(mm: number, key: RoomDimensionKey): number {
  const { min, max } = NEW_ROOM_LIMITS_MM[key]
  if (!Number.isFinite(mm)) return NEW_ROOM_DEFAULT_MM[key]
  return Math.min(max, Math.max(min, Math.round(mm)))
}

/**
 * Which side of the room a wall faces, or null if it cannot be told.
 *
 * The plan frame has +x east and +z south — the same convention
 * `computeOccupiedSides` reads sibling offsets in, so a side derived here
 * lands the new room where the top-down "+" button would have put it.
 *
 * A wall is assigned to the compass direction its OUTWARD normal points most
 * nearly along. `planPolygon`'s normals point inward, hence the negation. A
 * slanted wall in a drawn room still resolves — it goes to whichever of the
 * four it leans towards, which is the only answer a four-sided layout model
 * can give.
 */
export function wallSideOf(geometry: RoomGeometry, wallId: string): RoomSide | null {
  const poly = planPolygon(geometry)
  if (poly) {
    const edge = poly.edges.find((e) => e.id === wallId)
    if (!edge) return null
    // Outward = away from the room's inside.
    const ox = -edge.nx
    const oz = -edge.nz
    if (Math.abs(ox) >= Math.abs(oz)) return ox >= 0 ? 'east' : 'west'
    return oz >= 0 ? 'south' : 'north'
  }
  // Legacy A-B-C-D room: no outline to read, but the four ids are laid out to
  // a fixed convention — A at -z, B at +x, C at +z, D at -x.
  return LEGACY_WALL_SIDE[wallId] ?? null
}

/** The legacy rectangle's four walls and the side each one faces: A at -z, B at
 *  +x, C at +z, D at -x. Exported because `sharedOpenings.ts` has to run it
 *  BACKWARDS — "the new room is to the east, so which of its walls faces back
 *  west?" — and a second hand-written copy of this map is exactly the kind of
 *  thing that drifts and silently puts the shared door in the wrong wall. */
export const LEGACY_WALL_SIDE: Record<string, RoomSide> = {
  A: 'north', B: 'east', C: 'south', D: 'west',
}

/**
 * Where the new room's centre goes, in the apartment's shared layout frame
 * (metres), given where this room sits and how big both are.
 *
 * The distance between them is the WALL between them — that is what the gap
 * is, and why it is a dimension the user can set rather than a constant. The
 * wizard's `persistLayoutPos` uses 20 mm as a stand-in for "two walls meet
 * here"; a room created with a stated thickness uses that instead, so a
 * 100 mm partition really does put the two rooms' inner faces 100 mm apart.
 * (The 150 mm this once used read as a dead strip of floor between rooms — a
 * rendering bug, not an architectural boundary.)
 */
export const ROOM_LAYOUT_GAP_M = 0.02

export function newRoomLayoutPos(
  anchor: { x: number; z: number },
  side: RoomSide,
  self: { widthM: number; depthM: number },
  added: { widthM: number; depthM: number },
  gapM: number = ROOM_LAYOUT_GAP_M,
): { x: number; z: number } {
  const g = Math.max(0, gapM)
  switch (side) {
    case 'east': return { x: anchor.x + self.widthM / 2 + g + added.widthM / 2, z: anchor.z }
    case 'west': return { x: anchor.x - self.widthM / 2 - g - added.widthM / 2, z: anchor.z }
    case 'north': return { x: anchor.x, z: anchor.z - self.depthM / 2 - g - added.depthM / 2 }
    case 'south': return { x: anchor.x, z: anchor.z + self.depthM / 2 + g + added.depthM / 2 }
  }
}

/**
 * The new room as the API wants it: four walls, lengths in METRES, and
 * whatever openings it inherits from the wall it was created through.
 *
 * Wall ids follow the legacy A-B-C-D convention and the order the rest of the
 * app reads them in — A and C run along the width, B and D along the depth.
 * No `vertices`: a plain rectangle is exactly the case the outline is omitted
 * for, and sending one would push every consumer down the drawn-room path for
 * a room that is not drawn.
 *
 * `openings` is the one wall that is NOT blank. A room created through a wall
 * that already has a door in it has to repeat that door in the wall it shares,
 * or the single door ends up opening onto a solid partition and the new room is
 * sealed off — see `sharedOpeningsFor` in lib/sharedOpenings.ts, which works
 * out which wall and where along it. Its elements are already in API units, so
 * they are passed through untouched.
 */
export function newRoomGeometry(
  widthMm: number,
  depthMm: number,
  openings?: { wallId: string; elements: ApiWallElement[] } | null,
): {
  walls: { id: string; length: number; elements: ApiWallElement[] }[]
} {
  const w = clampRoomDimension(widthMm, 'width') / 1000
  const d = clampRoomDimension(depthMm, 'depth') / 1000
  // A fresh array per wall: handing the same `[]` to all four would let any
  // later in-place push land on every wall of the room at once.
  const on = (id: string): ApiWallElement[] =>
    openings && openings.wallId === id ? [...openings.elements] : []
  return {
    walls: [
      { id: 'A', length: w, elements: on('A') },
      { id: 'B', length: d, elements: on('B') },
      { id: 'C', length: w, elements: on('C') },
      { id: 'D', length: d, elements: on('D') },
    ],
  }
}

/** The three visible faces of an isometric box, as SVG `points` strings. */
export interface IsometricRoom {
  top: string
  /** Drawn on the left of the frame: the wall that runs along the WIDTH. */
  left: string
  /** Drawn on the right: the wall that runs along the DEPTH. */
  right: string
  viewBox: string
}

/**
 * A room drawn as an isometric box, sized to its real proportions.
 *
 * The preview's whole job is to answer "is that the shape I meant" before the
 * room exists, so the drawing has to be in PROPORTION — a fixed cube with the
 * numbers printed beside it would show a 6 x 2 m corridor as a square and
 * teach the user nothing. It is scaled to fit the frame rather than drawn to
 * a fixed scale, so a small room is not a dot and a big one does not spill.
 *
 * Standard isometric: the two floor axes run 30 degrees above the horizontal,
 * one to each side, and height is straight up the page. The faces returned are
 * the three a viewer above and in front can see; the other three are behind
 * them and never drawn.
 */
export function isometricRoom(
  widthMm: number,
  depthMm: number,
  heightMm: number,
  frame: { width: number; height: number; padding?: number } = { width: 240, height: 180 },
): IsometricRoom {
  const w = Math.max(widthMm, 1)
  const d = Math.max(depthMm, 1)
  const h = Math.max(heightMm, 1)
  const pad = frame.padding ?? 12

  const COS30 = Math.cos(Math.PI / 6)
  const SIN30 = 0.5
  // x runs down-right, z runs down-left, y straight up.
  const project = (x: number, y: number, z: number): [number, number] => [
    (x - z) * COS30,
    (x + z) * SIN30 - y,
  ]

  const corners = {
    topNW: project(0, h, 0), topNE: project(w, h, 0),
    topSE: project(w, h, d), topSW: project(0, h, d),
    botNE: project(w, 0, 0), botSE: project(w, 0, d), botSW: project(0, 0, d),
  }
  const all = Object.values(corners)

  const minX = Math.min(...all.map((p) => p[0]))
  const maxX = Math.max(...all.map((p) => p[0]))
  const minY = Math.min(...all.map((p) => p[1]))
  const maxY = Math.max(...all.map((p) => p[1]))
  const scale = Math.min(
    (frame.width - pad * 2) / Math.max(maxX - minX, 1e-6),
    (frame.height - pad * 2) / Math.max(maxY - minY, 1e-6),
  )

  // Centred in the frame, so changing a dimension grows the box about the
  // middle instead of sliding it off one edge.
  const offX = (frame.width - (maxX - minX) * scale) / 2 - minX * scale
  const offY = (frame.height - (maxY - minY) * scale) / 2 - minY * scale
  const at = ([x, y]: [number, number]) =>
    `${(x * scale + offX).toFixed(1)},${(y * scale + offY).toFixed(1)}`
  const poly = (...pts: [number, number][]) => pts.map(at).join(' ')

  return {
    top: poly(corners.topNW, corners.topNE, corners.topSE, corners.topSW),
    left: poly(corners.topSW, corners.topSE, corners.botSE, corners.botSW),
    right: poly(corners.topNE, corners.topSE, corners.botSE, corners.botNE),
    viewBox: `0 0 ${frame.width} ${frame.height}`,
  }
}

/** Where a wall sits in its room, and which way it faces out. */
export interface WallAnchor {
  /** The wall this was read off, as `geometry.walls[].id` spells it — 'A'..'D'
   *  for the legacy rectangle, the polygon edge's id otherwise. Carried along
   *  because the anchor outlives the tap: it sits in React state while the
   *  dimensions sheet is open, and the openings this wall already has can only
   *  be looked up again from the store by id. */
  wallId: string
  /** Midpoint of the wall, metres, in the room's own centred frame. */
  midXM: number
  midZM: number
  /** Unit outward normal, snapped to the axis it leans towards — the layout
   *  frame is four-sided, and a new room is an axis-aligned rectangle, so a
   *  diagonal offset would set it askew to the wall it is supposed to meet. */
  outX: number
  outZ: number
  side: RoomSide
}

/**
 * The wall as something to hang a room off: its middle, and the way out.
 *
 * Using the wall's OWN midpoint rather than the room's centre is what makes
 * the new room line up with the wall that was tapped. For a plain rectangle
 * the two agree — the midpoint of the east wall is straight out from the
 * middle of the room — so this changes nothing there. For any other outline
 * they do not agree at all, and offsetting from the room's centre put the new
 * room beside the wall instead of against it.
 */
export function wallAnchorOf(geometry: RoomGeometry, wallId: string): WallAnchor | null {
  const side = wallSideOf(geometry, wallId)
  if (!side) return null
  const [outX, outZ] =
    side === 'east' ? [1, 0] : side === 'west' ? [-1, 0] : side === 'south' ? [0, 1] : [0, -1]

  const poly = planPolygon(geometry)
  if (!poly) {
    // Legacy A-B-C-D: the walls ARE the bounding box, so each one's midpoint
    // is half the room out along its own normal.
    const w = (geometry.walls.find((x) => x.id === 'A')?.length ?? 4000) / 1000
    const d = (geometry.walls.find((x) => x.id === 'B')?.length ?? 3000) / 1000
    return { wallId, midXM: outX * (w / 2), midZM: outZ * (d / 2), outX, outZ, side }
  }

  const edge = poly.edges.find((e) => e.id === wallId)
  if (!edge) return null
  // Plan millimetres from the room's corner → metres about its centre, the
  // frame the 3D scene and the layout positions both use.
  return {
    wallId,
    midXM: ((edge.x1 + edge.x2) / 2 - poly.W / 2) / 1000,
    midZM: ((edge.z1 + edge.z2) / 2 - poly.D / 2) / 1000,
    outX, outZ, side,
  }
}

/**
 * Where the new room's centre goes: centred on the wall, one wall thickness
 * beyond it.
 *
 * This replaces offsetting from the room's own centre by half of each room.
 * That arithmetic only ever described two rectangles sharing a full-width
 * wall, and it ignored WHICH wall was tapped — so every room added to a flat
 * marched along the same axis from the same origin instead of landing against
 * the wall the user was looking at.
 *
 * The offset is the thickness itself, not half of it: the new room's inner
 * face ends up exactly one wall away from this room's inner face, which is
 * what a shared wall of that thickness means.
 */
export function newRoomCentreFromWall(
  anchor: { x: number; z: number },
  wall: WallAnchor,
  added: { widthM: number; depthM: number },
  thicknessM: number,
): { x: number; z: number } {
  const t = Math.max(0, thicknessM)
  // How far the new room reaches along the direction it is being pushed.
  const half = wall.outX !== 0 ? added.widthM / 2 : added.depthM / 2
  const push = t + half
  return {
    x: anchor.x + wall.midXM + wall.outX * push,
    z: anchor.z + wall.midZM + wall.outZ * push,
  }
}

/** A room's footprint in the apartment's shared layout frame: centre and
 *  extents, all METRES — the frame `layoutPos` and `computeAbsolutePositions`
 *  both speak. */
export interface LayoutRect {
  x: number
  z: number
  widthM: number
  depthM: number
}

/**
 * Whether two rooms occupy the same floor.
 *
 * Two rooms a partition apart do NOT overlap — the gap is the wall, so their
 * footprints are disjoint and this is false, which is the whole point of
 * testing areas rather than distances. Rooms that touch exactly are not
 * overlapping either.
 */
export function roomsOverlap(a: LayoutRect, b: LayoutRect): boolean {
  const EPS_M = 0.001 // a millimetre: below this it is two rooms meeting, not overlapping
  const overlapX = Math.min(a.x + a.widthM / 2, b.x + b.widthM / 2)
    - Math.max(a.x - a.widthM / 2, b.x - b.widthM / 2)
  const overlapZ = Math.min(a.z + a.depthM / 2, b.z + b.depthM / 2)
    - Math.max(a.z - a.depthM / 2, b.z - b.depthM / 2)
  return overlapX > EPS_M && overlapZ > EPS_M
}
