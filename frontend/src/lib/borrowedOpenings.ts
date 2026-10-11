/**
 * One hole through one partition, seen from both rooms.
 *
 * The user's words: "this door should work for the wall of another room". Room
 * 1 had a door in its wall; from the room next door the wall they share was
 * solid. Two rooms that adjoin are, in this data model, two widthless wall
 * planes a partition's thickness apart, and each room only ever cut the
 * openings stored in its OWN `elements`. A doorway drawn in one of them was
 * therefore a hole in one face of the partition and solid plaster in the other.
 *
 * `sharedOpenings.ts` fixed that for exactly one case: a room created THROUGH a
 * wall gets real copies of that wall's doors, once, at creation. Doors added
 * afterwards, rooms that were made separately and merely happen to adjoin
 * (wizard, scan, drawn), and any door later moved, resized or deleted were all
 * still one-sided. The rule the user needs is general: wherever two rooms'
 * walls face each other across a partition, an opening in either one is an
 * opening in both.
 *
 * ## Borrowed at render time, never written
 *
 * The other way to get there — copy each opening into the neighbour's geometry
 * when it is drawn — gives every doorway two stored copies, in two rooms saved
 * separately, one of which is not even loaded in the editor. Every move,
 * resize, restyle and delete then has to reach both, and the first one that
 * does not is a door in one room and a different door, or none, in the other.
 * So an opening belongs to exactly one room, the one it was drawn in, and
 * every room that RENDERS a wall also cuts the openings of the neighbours whose
 * walls lie against it, mapped into its own wall's coordinates. Moving or
 * deleting the door moves or removes both faces at once, because there is only
 * one door. Nothing borrowed is ever written to a room's geometry, so it is
 * never saved, never counted by the smeta (backend/app/services/smeta.py reads
 * the stored `eshik` elements), and never offered to the editor.
 *
 * Every opening type is borrowed — doors, windows and balcony doors alike.
 * `sharedOpenings` deliberately copies doors only, because there the question
 * is whether to WRITE a new opening into a room the user is creating, and
 * inventing an interior window nobody drew is a surprise. Here nothing is
 * invented: the opening already exists in the neighbour's wall, the renderer
 * already cuts it, and you can already see straight through it from that side
 * (the wall planes are single-sided). Leaving this side solid would draw one
 * partition as see-through from one room and solid from the other, which is
 * the very bug being fixed. The user's real flat has exactly that: two windows
 * drawn in a partition between two 3 m rooms 20 mm apart.
 *
 * ## Units and conventions
 *
 * Positions on walls are the STORE's: millimetres to the opening's LEFT EDGE,
 * measured from the wall's position-0 end. Where that end is depends on the
 * room, and it is the trap three recent bugs fell into: on a legacy A-B-C-D
 * rectangle every wall measures from its along-axis MINIMUM (walls A and C
 * from −x, B and D from −z), whereas on a polygon edge it is `vertices[i]` and
 * position grows toward `vertices[i + 1]`. The server fills `vertices` in for
 * every four-wall room as a CCW loop whose edges C and D run the decreasing
 * way, so polygon code that does not check for the rectangle first mirrors
 * every C/D opening. This module therefore decides the convention exactly the
 * way the RENDERER does (`rendersAsAbcdRectangle`, the same test `RoomScene`
 * branches on) and, for polygons, reads `wallDefsFromVertices`, which carries
 * the `legacyAbcd` guard and is what the polygon shell's frames are built
 * from. Nothing here re-derives a position direction.
 *
 * Everything is worked in ONE frame: metres, the shared layout frame
 * `SiblingRooms` places each room's group in (the active room at the origin).
 * A room is drawn centred on its own origin there — a rectangle on its W/D
 * centre, a polygon on the mean of its vertices, as `NWallRoomShell` does — so
 * a wall's world line is that room-local line plus the room's offset. Each
 * opening's centre goes out to world space on its own wall and comes back by
 * projection onto the receiving wall; signs and mirrored directions fall out of
 * the dot products instead of being written down per wall.
 */
import { roomExtents } from '@/lib/roomDims'
import { wallDefsFromVertices } from '@/lib/wallDefsFromVertices'
import { resolveElementPositions } from '@/lib/wallPositions'
import { NEW_ROOM_LIMITS_MM } from '@/lib/newRoomFromWall'
import type { RoomGeometry, WallElement } from '@/store/roomStore'

/** One room of the flat, where it stands. Geometry in STORE units
 *  (millimetres, left-edge positions); offset in METRES from the active room's
 *  centre, the frame `SiblingRooms` positions each sibling group in. */
export interface PlacedRoom {
  id: string
  geometry: RoomGeometry
  offsetXM: number
  offsetZM: number
}

// ─── The coincidence rule ────────────────────────────────────────────────────

/**
 * How far from exactly opposite two walls' inward normals may be and still be
 * two faces of one partition: 2°. Wizard and added rooms are axis-aligned to
 * the float, so this only matters for a scanned or hand-drawn outline, where a
 * wall a degree off square is still plainly the same partition; past a couple
 * of degrees the two faces diverge by tens of millimetres along a door's width
 * and the "same hole" stops being a meaningful idea.
 */
const PARALLEL_COS = Math.cos((2 * Math.PI) / 180)

/**
 * The widest partition this treats as shared, millimetres: the largest wall
 * thickness the new-room sheet accepts (`NEW_ROOM_LIMITS_MM.wallThickness`).
 * Rooms are placed 20 mm (wizard, `ROOM_LAYOUT_GAP_M`), 100 mm (older added
 * rooms) or `DOOR_JAMB_DEPTH_MM` (200 mm, the current default) apart, and the
 * user may type anything up to this. A corridor between two rooms is several
 * times wider, so it can never be mistaken for a partition.
 */
export const MAX_PARTITION_GAP_MM = NEW_ROOM_LIMITS_MM.wallThickness.max

/**
 * How far two rooms may OVERLAP and still be read as sharing a wall,
 * millimetres. Layout positions are stored in floating-point metres and two
 * rooms meant to touch can come back a hair inside each other; a deeper
 * overlap than this is a layout bug, not a partition, and pairing walls across
 * it would cut doors into the middle of a room.
 */
const MAX_OVERLAP_MM = 50

/** Rounding slack at a wall's ends, millimetres — the same allowance, for the
 *  same reason, as `FIT_TOLERANCE_MM` in sharedOpenings.ts. */
const FIT_TOLERANCE_MM = 1

/**
 * The shallowest lining a shared doorway is given, millimetres.
 *
 * A shared doorway's lining spans the MEASURED gap between the two faces (see
 * `revealDepthMm` on `WallElement`), but the wizard places rooms only 20 mm
 * apart, and a door leaf is a 40 mm slab hung inside the lining. A 20 mm
 * lining would leave the leaf standing proud of the wall in the room you are
 * in. 60 mm holds the leaf and its frame; in a 20 mm gap the lining then
 * reaches 40 mm past the far face, which is on the far side of the partition
 * from the room drawing it and is hidden in the neighbour (its partition
 * chrome is not drawn there; see `siblingWallsInActiveRoom`).
 */
export const MIN_SHARED_LINING_MM = 60

function liningDepthMm(gapMm: number): number {
  return Math.round(Math.min(MAX_PARTITION_GAP_MM, Math.max(MIN_SHARED_LINING_MM, gapMm)))
}

// ─── Walls in the flat's frame ───────────────────────────────────────────────

/**
 * Whether `RoomScene` draws this room through its legacy A-B-C-D branch.
 *
 * Deliberately the RENDERER's test, ids in order, and not `isAbcdRoom`'s
 * order-free one: what decides where a hole is cut is which branch of
 * `RoomScene` draws the wall, and that branch is chosen by exactly this. For
 * every room the backend saves the two agree (`_normalize_polygon` keeps the
 * walls in A, B, C, D order); were they ever to disagree, matching the
 * renderer is what keeps a borrowed hole on the hole it borrows. `RoomScene`
 * imports it from here so the two cannot drift.
 */
export function rendersAsAbcdRectangle(geometry: RoomGeometry): boolean {
  return (
    geometry.walls.length === 4 &&
    geometry.walls[0]?.id === 'A' &&
    geometry.walls[1]?.id === 'B' &&
    geometry.walls[2]?.id === 'C' &&
    geometry.walls[3]?.id === 'D'
  )
}

/** One wall as a line in the flat's frame. */
export interface WallLine {
  wallId: string
  /** The wall's position-0 end, METRES, flat frame. */
  x0M: number
  z0M: number
  /** Unit vector the way `position` grows. */
  uX: number
  uZ: number
  /** Unit normal pointing INTO this wall's own room. */
  nX: number
  nZ: number
  /** The length the renderer measures this wall's positions against, mm. */
  lengthMm: number
  /** The wall's own openings, auto placeholders resolved to where they are
   *  drawn (left edges, mm, against `lengthMm`). */
  elements: WallElement[]
}

/**
 * Every wall of a room as a line in the flat's frame, in the convention its
 * own renderer uses — or none, for a room the renderer would not draw.
 *
 * Legacy rectangle: the table `RoomScene` hardcodes (A at −z, B at +x, C at +z,
 * D at −x; A and C measured from −x, B and D from −z; lengths W and D from
 * `roomExtents`, which is what the renderer resolves positions against).
 * Polygon: `wallDefsFromVertices`, centred on the vertex mean exactly like
 * `NWallRoomShell`, with each edge's own length.
 */
export function wallLinesOf(room: PlacedRoom): WallLine[] {
  const { geometry, offsetXM: ox, offsetZM: oz } = room
  const lines: WallLine[] = []
  const push = (
    wallId: string, x0M: number, z0M: number,
    uX: number, uZ: number, nX: number, nZ: number, lengthMm: number,
  ) => {
    const wall = geometry.walls.find((w) => w.id === wallId)
    if (!wall || !(lengthMm > 0)) return
    lines.push({
      wallId, x0M: x0M + ox, z0M: z0M + oz, uX, uZ, nX, nZ, lengthMm,
      elements: resolveElementPositions(wall.elements, lengthMm),
    })
  }

  if (rendersAsAbcdRectangle(geometry)) {
    const { W, D } = roomExtents(geometry)
    push('A', -W / 2, -D / 2, 1, 0, 0, 1, W * 1000)
    push('B', W / 2, -D / 2, 0, 1, -1, 0, D * 1000)
    push('C', -W / 2, D / 2, 1, 0, 0, -1, W * 1000)
    push('D', -W / 2, -D / 2, 0, 1, 1, 0, D * 1000)
    return lines
  }

  const verts = geometry.vertices
  if (!verts || verts.length < 3) return lines
  const defs = wallDefsFromVertices(verts, geometry.walls.map((w) => w.id))
  for (const w of geometry.walls) {
    const d = defs[w.id]
    if (!d) continue
    push(
      w.id,
      d.midX - (d.dirX * d.length) / 2,
      d.midZ - (d.dirZ * d.length) / 2,
      d.dirX, d.dirZ, d.normal.x, d.normal.z,
      d.length * 1000,
    )
  }
  return lines
}

/** Where an opening's centre is, flat frame, metres. */
function centreOf(line: WallLine, el: WallElement): { xM: number; zM: number } {
  const alongM = (el.position + el.width / 2) / 1000
  return { xM: line.x0M + line.uX * alongM, zM: line.z0M + line.uZ * alongM }
}

/** Distance from `line`'s face OUT to a point, mm — positive behind the wall,
 *  i.e. on the far side from its own room. */
function depthBehindMm(line: WallLine, p: { xM: number; zM: number }): number {
  return -((p.xM - line.x0M) * line.nX + (p.zM - line.z0M) * line.nZ) * 1000
}

/** A point's position along `line`, mm from its position-0 end. */
function alongMm(line: WallLine, p: { xM: number; zM: number }): number {
  return ((p.xM - line.x0M) * line.uX + (p.zM - line.z0M) * line.uZ) * 1000
}

/** Two walls face each other: parallel, and their rooms on opposite sides. */
function facing(a: WallLine, b: WallLine): boolean {
  return a.nX * b.nX + a.nZ * b.nZ <= -PARALLEL_COS
}

function gapIsPartition(gapMm: number): boolean {
  return gapMm >= -MAX_OVERLAP_MM && gapMm <= MAX_PARTITION_GAP_MM
}

function spansOverlap(aLeft: number, aWidth: number, bLeft: number, bWidth: number): boolean {
  return Math.min(aLeft + aWidth, bLeft + bWidth) - Math.max(aLeft, bLeft) > FIT_TOLERANCE_MM
}

// ─── What a room borrows ─────────────────────────────────────────────────────

export interface NeighbourOpenings {
  /** Per receiving wall id: the neighbours' openings that come through it, in
   *  the RECEIVING wall's store convention (mm, left edge, from that wall's own
   *  position-0 end), each marked with `borrowedFrom`. */
  borrowed: Record<string, WallElement[]>
  /** The receiving room's OWN openings that sit in a shared partition, by
   *  element id → the measured lining depth, mm. Their lining should span the
   *  partition rather than the default `OPENING_REVEAL_D`. */
  sharedDepthMm: Record<string, number>
  /** Neighbours' openings that lie across this room's wall but overhang its
   *  end, and so are not cut here. See the fit rule in `neighbourOpenings`. */
  dropped: number
}

const EMPTY: NeighbourOpenings = { borrowed: {}, sharedDepthMm: {}, dropped: 0 }

/**
 * The openings `receiver` must cut because a neighbour's wall lies against one
 * of its own, and which of its own openings sit in such a shared partition.
 *
 * ## The coincidence rule
 *
 * A receiving wall R and a neighbour's wall S are two faces of one partition
 * for an opening of S when, all in the flat's frame:
 *   - they are parallel and face opposite ways — inward normals within 2° of
 *     opposite (`PARALLEL_COS`), so each room is on its own side;
 *   - the opening's centre on S lies BEHIND R's face by no more than
 *     `MAX_PARTITION_GAP_MM` (500 mm, the thickest wall the sheet allows) and
 *     no less than −`MAX_OVERLAP_MM` (−50 mm of float drift);
 *   - its span projected onto R overlaps R at all — the "overlap along their
 *     length" test, done per opening, because only the stretch of S that the
 *     opening is in matters.
 * Rooms that merely share a corner fail the first test (their walls are
 * perpendicular); two rooms stacked at the same layout position fail it too,
 * because their coinciding walls face the SAME way.
 *
 * ## When it does not fit — dropped, not slid
 *
 * An opening whose span reaches past either end of R is not cut into R, and is
 * counted in `dropped`, for the reason `sharedOpeningsFor` gives: sliding it
 * back onto R would put the two faces of one doorway in different places — a
 * working door in one room and blank wall behind it in the other — and a
 * doorway across a room's corner is not something that can be built.
 *
 * ## When this side already has one there
 *
 * Rooms created through a wall got REAL copies of its doors (sharedOpenings),
 * and the user has hand-drawn matching doors on both sides in places. A
 * borrowed opening whose span overlaps any opening this wall already has is
 * not added: the room's own one is the hole, and adding the borrowed one too
 * would cut it twice and line it twice. Overlapping at all, not merely
 * coinciding, because two casings crossing each other is the same defect at a
 * smaller offset. The room's own opening is then recorded in `sharedDepthMm`
 * like any other in a shared partition, which is also how the existing
 * duplicated pairs get a lining that spans their partition.
 *
 * Neighbours' openings are also kept apart from each other: a wall that two
 * neighbours both lie against (or two rooms stacked at one layout position,
 * which this flat has) takes the first and skips any later one that would
 * overlap it.
 *
 * `neighbours` may include the receiver itself; it is skipped.
 */
export function neighbourOpenings(receiver: PlacedRoom, neighbours: readonly PlacedRoom[]): NeighbourOpenings {
  const recvLines = wallLinesOf(receiver)
  if (recvLines.length === 0) return EMPTY

  const borrowed: Record<string, WallElement[]> = {}
  const sharedDepthMm: Record<string, number> = {}
  let dropped = 0

  for (const nb of neighbours) {
    if (nb.id === receiver.id) continue
    const nbLines = wallLinesOf(nb)
    for (const R of recvLines) {
      for (const S of nbLines) {
        if (!facing(R, S)) continue

        // This room's own openings that a neighbour's wall lies against: they
        // are the near half of a shared doorway, and their lining should
        // reach the far face. Measured from S, at the opening's own centre.
        for (const own of R.elements) {
          const c = centreOf(R, own)
          const gapMm = depthBehindMm(S, c)
          const onS = alongMm(S, c)
          if (!gapIsPartition(gapMm) || onS < 0 || onS > S.lengthMm) continue
          if (sharedDepthMm[own.id] === undefined) sharedDepthMm[own.id] = liningDepthMm(gapMm)
        }

        for (const el of S.elements) {
          const c = centreOf(S, el)
          const gapMm = depthBehindMm(R, c)
          if (!gapIsPartition(gapMm)) continue
          // Mapped through the world point, so R and S running the same way,
          // opposite ways, or either one under the legacy rectangle's
          // from-the-minimum rule all come out of the same two dot products.
          const centreOnRMm = alongMm(R, c)
          const leftOnRMm = centreOnRMm - el.width / 2
          // Not on this stretch of R at all: a different part of S faces
          // something else. Not a drop — it was never this wall's opening.
          if (leftOnRMm + el.width <= 0 || leftOnRMm >= R.lengthMm) continue
          if (leftOnRMm < -FIT_TOLERANCE_MM || leftOnRMm + el.width > R.lengthMm + FIT_TOLERANCE_MM) {
            dropped += 1
            continue
          }

          const here = (borrowed[R.wallId] ??= [])
          const ownHit = R.elements.find((o) => spansOverlap(o.position, o.width, leftOnRMm, el.width))
          if (ownHit) {
            if (sharedDepthMm[ownHit.id] === undefined) sharedDepthMm[ownHit.id] = liningDepthMm(gapMm)
            continue
          }
          if (here.some((b) => spansOverlap(b.position, b.width, leftOnRMm, el.width))) continue

          here.push(borrowedCopy(el, nb.id, Math.round(leftOnRMm), liningDepthMm(gapMm)))
        }
      }
    }
  }

  for (const id of Object.keys(borrowed)) if (borrowed[id].length === 0) delete borrowed[id]
  return { borrowed, sharedDepthMm, dropped }
}

/**
 * The receiving side's copy of a neighbour's opening — render-only.
 *
 * Its id is derived from the owner's (`borrowed:<room>:<element>`), so it is
 * stable across re-renders and cannot collide with any id of the receiving
 * room, which matters to React keys and to the live-drag channel that matches
 * frames by element id.
 *
 * Hinge and swing are turned round, because "left" and "into the room" are
 * stated in each wall's own frame and the two faces of a partition look at
 * each other: the hinge jamb a person in the owner's room sees on their left is
 * on the right seen from this side, and a leaf that opens into the owner's
 * room opens AWAY from this one. Turning both keeps the leaf on the same
 * physical jamb, swinging into the same physical room, whichever side hangs
 * it (see `withNeighbourOpenings` for which side that is).
 */
function borrowedCopy(el: WallElement, ownerRoomId: string, leftMm: number, depthMm: number): WallElement {
  const copy: WallElement = {
    id: `borrowed:${ownerRoomId}:${el.id}`,
    type: el.type,
    width: el.width,
    height: el.height,
    sill_height: el.sill_height,
    position: leftMm,
    positionAuto: false,
    borrowedFrom: ownerRoomId,
    revealDepthMm: depthMm,
  }
  if (el.type === 'eshik') {
    copy.hinge = (el.hinge ?? 'left') === 'left' ? 'right' : 'left'
    if (el.openAngle) copy.openAngle = -el.openAngle
  }
  if (el.leafColor) copy.leafColor = el.leafColor
  if (el.styleId) copy.styleId = el.styleId
  if (el.sashes) copy.sashes = el.sashes
  return copy
}

/**
 * `geometry` with its neighbours' openings cut in — the geometry to RENDER the
 * room's shell from, never to store.
 *
 * `lineBorrowed` says which side of each shared opening draws its lining (the
 * reveal, frame and architrave) and hangs its leaf. Exactly one side must,
 * because the lining is built as a reveal reaching out from one face across
 * the partition to the other: drawn from both faces it is two coincident
 * tunnels and two leaves in one opening, which z-fight, and drawn from
 * neither it is a bare slot. The rule:
 *
 *  - The ACTIVE room lines everything in its walls, borrowed or not (pass
 *    `true`). Its siblings already skip all chrome on the partition they share
 *    with it (`siblingWallsInActiveRoom`), so from the room the user is
 *    standing in each doorway has exactly one lining, spanning the partition.
 *  - A SIBLING borrows bare (pass `false`): it cuts the hole — that is what
 *    its own face of the partition was missing — and leaves the lining to the
 *    room that owns the opening. Between two siblings that is the owner;
 *    between a sibling and the active room the sibling's partition chrome is
 *    off either way.
 *
 * A wall that receives borrowed openings has its own openings handed over
 * already resolved and marked explicit. Otherwise the extra element would
 * change how `resolveElementPositions` lays out the wall's auto-placed
 * openings (one auto opening is centred; two are grouped), and borrowing a
 * door would quietly move this room's own one.
 *
 * Returns `geometry` itself when there is nothing to add, so memoized
 * consumers see no change.
 */
export function withNeighbourOpenings(
  geometry: RoomGeometry,
  found: NeighbourOpenings,
  { lineBorrowed }: { lineBorrowed: boolean },
): RoomGeometry {
  const anyBorrowed = Object.keys(found.borrowed).length > 0
  const anyShared = Object.keys(found.sharedDepthMm).length > 0
  if (!anyBorrowed && !anyShared) return geometry

  const lines = new Map(wallLinesOf({ id: '', geometry, offsetXM: 0, offsetZM: 0 }).map((l) => [l.wallId, l]))
  const annotate = (el: WallElement): WallElement => {
    const depth = found.sharedDepthMm[el.id]
    return depth === undefined ? el : { ...el, revealDepthMm: depth }
  }

  return {
    ...geometry,
    walls: geometry.walls.map((wall) => {
      const extra = found.borrowed[wall.id]
      const line = lines.get(wall.id)
      if (extra?.length && line) {
        const own = line.elements.map((el) => annotate({ ...el, positionAuto: false }))
        const theirs = lineBorrowed ? extra : extra.map((el) => ({ ...el, bare: true as const }))
        return { ...wall, elements: [...own, ...theirs] }
      }
      if (!wall.elements.some((el) => found.sharedDepthMm[el.id] !== undefined)) return wall
      return { ...wall, elements: wall.elements.map(annotate) }
    }),
  }
}

/** The room's own openings only — what an editable or leaf layer is given,
 *  since a borrowed opening is not editable from the borrowing side. */
export function ownOpeningsOnly(geometry: RoomGeometry): RoomGeometry {
  if (!geometry.walls.some((w) => w.elements.some((el) => el.borrowedFrom))) return geometry
  return {
    ...geometry,
    walls: geometry.walls.map((w) => ({ ...w, elements: w.elements.filter((el) => !el.borrowedFrom) })),
  }
}

/** The borrowed openings this side LINES only — what the active room hangs
 *  leaves and sashes in, as scenery (see `withNeighbourOpenings`). */
export function linedBorrowedOpeningsOnly(geometry: RoomGeometry): RoomGeometry {
  return {
    ...geometry,
    walls: geometry.walls.map((w) => ({
      ...w,
      elements: w.elements.filter((el) => el.borrowedFrom && !el.bare),
    })),
  }
}

/**
 * Which of `room`'s walls lie against one of `other`'s across a partition —
 * by the same coincidence rule as above, for the whole wall rather than one
 * opening. The sibling layer uses it to switch off a sibling's chrome on the
 * partition it shares with the active room for a drawn or scanned room too,
 * whose walls `siblingWallsInActiveRoom` (rectangles only, by A-B-C-D name)
 * cannot see.
 */
export function wallsAgainst(room: PlacedRoom, other: PlacedRoom): Set<string> {
  const out = new Set<string>()
  const theirs = wallLinesOf(other)
  for (const R of wallLinesOf(room)) {
    for (const S of theirs) {
      if (!facing(R, S)) continue
      const sStart = { xM: S.x0M, zM: S.z0M }
      const sEnd = { xM: S.x0M + (S.uX * S.lengthMm) / 1000, zM: S.z0M + (S.uZ * S.lengthMm) / 1000 }
      const a = alongMm(R, sStart)
      const b = alongMm(R, sEnd)
      const lo = Math.max(0, Math.min(a, b))
      const hi = Math.min(R.lengthMm, Math.max(a, b))
      if (hi - lo <= FIT_TOLERANCE_MM) continue
      const mid = { xM: R.x0M + (R.uX * (lo + hi)) / 2000, zM: R.z0M + (R.uZ * (lo + hi)) / 2000 }
      // Measured from S back to R's midpoint of the overlap: "is R's face
      // within a partition of S", the mirror of the per-opening test.
      if (gapIsPartition(depthBehindMm(S, mid))) out.add(R.wallId)
    }
  }
  return out
}
