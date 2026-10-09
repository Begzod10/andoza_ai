/**
 * Every other room of the apartment, converted into exactly what the real
 * room shell wants.
 *
 * The user's standing requirement, in their own words: "main purpose of
 * creating a new room inside 1 project is to make whole apartment design and
 * see them in 1". A room that is not the one being edited still has to LOOK
 * like a room — the same walls and coverings, the same laid floor, the same
 * ceiling and its design, the same skirting and cornice, the same doors and
 * windows cut as real holes — because otherwise several rooms in one project
 * do not add up to a flat. They were drawn as a solid-colour slab with four
 * tinted boxes, which is what this module exists to replace.
 *
 * It is deliberately only the convert-and-place step: API room → the props
 * `RoomScene` already takes, at its offset from the active room. Nothing here
 * renders anything, so the units arithmetic — which is where the bugs in this
 * area have always been — can be tested without a GPU.
 *
 * Units: the API speaks METRES, the store and every renderer speak
 * MILLIMETRES, and the one thing this module hands out in metres is a position
 * in the scene (three.js is metres). Every name says which.
 */
import type { Room } from '@/lib/api'
import type { DesignState, PlacedFurniture, PlacedLight, RoomGeometry } from '@/store/roomStore'
import { DEFAULT_DESIGN_STATE, repairDesignState } from '@/store/roomStore'
import { apiGeometryToStoreGeometry, roomScopedElementId } from '@/lib/apiRoomGeometry'
import { roomExtents } from '@/lib/roomDims'

/**
 * The shape of the per-room `state` blob the API stores verbatim. It is
 * `Record<string, unknown>` on the wire because the backend never looks
 * inside it; these are the keys the studio writes and reads.
 */
interface SavedRoomState {
  designState?: DesignState
  furniture?: PlacedFurniture[]
  lights?: PlacedLight[]
}

/**
 * One sibling room, ready to mount.
 *
 * `room`, `geometry` and `designState` are the three props `RoomScene` takes,
 * so a sibling is rendered by the SAME component as the active room rather
 * than by a second renderer. That is the whole design: a second renderer is
 * exactly how the old stand-in came to be missing the ceiling, the trims and
 * the openings, and no amount of care keeps two of them in step.
 */
export interface SiblingRoomView {
  id: string
  name: string
  /** The `room` prop, with the legacy synthetic fields filled in from the
   *  room's own walls — see `siblingRoomView` for why the API's rows cannot be
   *  passed through untouched. */
  room: Room
  /** MILLIMETRES, opening `position` measured to its left edge. */
  geometry: RoomGeometry
  designState: DesignState
  furniture: PlacedFurniture[]
  lights: PlacedLight[]
  /** Interior extents in METRES, read off the walls by `roomExtents`. */
  widthM: number
  depthM: number
  /** Ceiling height in METRES. */
  heightM: number
  /** Offset from the active room's own centre, METRES — where the group goes. */
  offsetXM: number
  offsetZM: number
  /** Straight-line distance from the active room's centre, METRES. The level
   *  of detail is decided on this; see `siblingLodTier`. */
  distanceM: number
}

/**
 * The design state a saved room renders with.
 *
 * Identical to what `loadDraftState` does for the room being opened,
 * `floorConfigured` backfill included — a sibling must read the way opening it
 * reads, and the backfill is the difference between a room designed before
 * that flag existed showing its real floor and showing the bare-screed
 * placeholder. A room with no saved blob at all falls through to
 * `DEFAULT_DESIGN_STATE`, which is also what the studio would show it as.
 */
export function siblingDesignState(state: Room['state']): DesignState {
  const saved = (state as SavedRoomState | null | undefined)?.designState
  return saved
    ? repairDesignState({ floorConfigured: true, ...saved })
    : DEFAULT_DESIGN_STATE
}

/**
 * One API room → everything needed to draw it, or `null` when it cannot be
 * drawn at all (no geometry yet, i.e. a row created but never configured).
 *
 * `null` rather than a 4x3 default box: an invented room in the middle of
 * someone's flat is worse than a gap where the unconfigured room is, and the
 * gap is honest about there being nothing saved.
 */
export function siblingRoomView(
  room: Room,
  offsetXM: number,
  offsetZM: number,
): SiblingRoomView | null {
  // Room-scoped element ids, not random ones: see `MintElementId`. Every ABCD
  // room in the flat has a wall called "A", so the element id is the only
  // thing keeping the live opening-drag channel from moving a neighbour's door
  // along with the active room's.
  const geometry = apiGeometryToStoreGeometry(room.geometry, roomScopedElementId(room.id))
  if (!geometry) return null

  // `ceiling_height`, `width` and `length` are synthetic fields that
  // `StudioPage` fills in for the room it opens; the apartment-rooms endpoint
  // sends `ceiling_h` and the geometry, and nothing else. Passing the raw row
  // as `RoomScene`'s `room` prop would therefore hand it `undefined` for all
  // three, and the ceiling height is the one it reads directly.
  const heightM = room.ceiling_h && room.ceiling_h > 0 ? room.ceiling_h : 2.7
  // From the walls themselves, exactly as RoomScene does it, so a sibling can
  // never come out transposed against its own walls when its neighbour does
  // not — see lib/roomDims for the bug that convention exists to stop.
  const { W: widthM, D: depthM } = roomExtents(geometry)

  return {
    id: room.id,
    name: room.name,
    // `length` = wall A = the X extent, `width` = wall B = the Z extent. The
    // pairing looks like a typo and is not: those two synthetic fields are
    // assigned the other way round from how they read, which is the exact
    // transposition `lib/roomDims` was written to stop. They are only a
    // fallback for a room whose walls carry no usable length, but a fallback
    // that disagrees with the walls is worse than none.
    room: { ...room, ceiling_height: heightM, length: widthM, width: depthM },
    geometry,
    designState: siblingDesignState(room.state),
    // A placement referencing a user-UPLOADED model will not resolve here, and
    // cannot: those blobs live in the IndexedDB of the browser that imported
    // them, and the sibling's own library is not loaded. Built-in catalog and
    // do'kon furniture render for real, which is already how the old stand-in
    // drew furniture — the one part of it that was not a placeholder.
    furniture: (room.state as SavedRoomState | null | undefined)?.furniture ?? [],
    lights: (room.state as SavedRoomState | null | undefined)?.lights ?? [],
    widthM,
    depthM,
    heightM,
    offsetXM,
    offsetZM,
    distanceM: Math.hypot(offsetXM, offsetZM),
  }
}

// ─── Level of detail ─────────────────────────────────────────────────────────
//
// The budget this was written to: the sibling layer must not add per-frame
// work, must not add a shadow-casting pass, must not add a real light, and
// must not add more than roughly the active room's own draw-call count again
// a handful of times over. The studio is already reported as slow, and N rooms
// x a full shell is the obvious way to make that permanent.
//
// So the full shell is spent where it is worth seeing. "Worth seeing" is
// distance, not room order: the flat this was developed against has six
// positioned rooms marching along x from 0 to 17.89 m, and from inside any one
// of them the far end is a few pixels tall.

/**
 * Below this many siblings, every one of them gets the full shell regardless
 * of distance.
 *
 * A normal flat is this size, and the whole point of the feature is seeing the
 * flat as one thing — a radius rule that quietly degraded a four-room
 * apartment would be the feature failing at exactly the size it matters most.
 */
export const SIBLING_FULL_SHELL_ALWAYS = 6

/**
 * How far out the full shell reaches once a flat is bigger than that.
 *
 * Roughly three rooms' worth of frontage. Beyond it a room is small enough on
 * screen that a coloured block reads the same as a shell, and the saved draw
 * calls are the difference between the flat being usable on a phone and not.
 */
export const SIBLING_FULL_SHELL_RADIUS_M = 12

/**
 * Past this, nothing is drawn at all.
 *
 * Not a performance limit — a sanity limit. `computeAbsolutePositions` packs
 * rooms with no stored position into a block beside the stored ones, and a
 * data problem there (the 36-metre conga line that file's header describes)
 * must not be able to scatter geometry to the horizon.
 */
export const SIBLING_CULL_M = 80

export type SiblingLodTier = 'full' | 'block' | 'hidden'

/**
 * Which tier a sibling is drawn at.
 *
 * Pure, monotone in `distanceM` and independent per room on purpose: it needs
 * no ranking pass over the list, so it cannot reshuffle which rooms are
 * detailed as the active room changes, and it can be tested as the one-line
 * rule it is.
 */
export function siblingLodTier(distanceM: number, siblingCount: number): SiblingLodTier {
  if (!Number.isFinite(distanceM) || distanceM > SIBLING_CULL_M) return 'hidden'
  if (siblingCount <= SIBLING_FULL_SHELL_ALWAYS) return 'full'
  return distanceM <= SIBLING_FULL_SHELL_RADIUS_M ? 'full' : 'block'
}


// ─── The partition between two rooms is drawn by one of them ─────────────────

/**
 * How far a room's opening chrome reaches OUT of the room, metres.
 *
 * It is `OPENING_REVEAL_D` (pages/studio/three-d/constants.ts), restated here
 * rather than imported so this module keeps owing nothing to the page layer.
 * The number is load-bearing twice over: a widthless wall plane (WALL_T = 0)
 * is the room's INNER face, so the 200 mm of masonry an opening is cut through
 * is faked by a reveal and a casing standing 200 mm outward from it — into
 * whatever is on the other side.
 */
export const OPENING_CHROME_REACH_M = 0.2

/**
 * Which of a sibling room's walls stand in the ACTIVE room's space, and so
 * must not draw their reveals, casings or trim runs.
 *
 * This is the "brown frame" the user asked to be rid of. Two adjacent rooms
 * are not separated by a wall in this model: they are two widthless planes a
 * `wallThicknessMm` apart — 100 mm by default, 20 mm for a wizard-placed room
 * (`ROOM_LAYOUT_GAP_M`). Each room's own doorway chrome reaches 200 mm outward
 * from its plane, which is more than that gap, so the NEIGHBOUR's door casing
 * — `doorFrameMat`, #8B7355, brown — always stood 100 mm inside the room the
 * user was standing in, in front of that room's own wall. Whether a hole
 * appeared behind it was then a coincidence of whether the active room's wall
 * happened to be cut at that exact spot, and with the two halves of a shared
 * doorway mirrored (see lib/sharedOpenings) it usually was not: a brown frame
 * against solid wall.
 *
 * Hiding it is not hiding a defect. A doorway through a partition is ONE
 * doorway; the room you are standing in draws it, with its reveal, its casing,
 * its architrave and its leaf, and the room on the other side drawing a second
 * copy of the same doorway 100 mm away was always a duplicate. The sibling's
 * wall plane itself still renders and is still CUT — that is what you see
 * through — and a sibling's doorway onto anywhere else keeps its casing in
 * full, which is the difference between this and simply not drawing frames.
 *
 * A fully OVERLAPPING sibling (two rooms stored at the same `layoutPos`, which
 * this apartment has twice over) falls out of the same rule: every one of its
 * walls is inside the active room, so none of them draws chrome there.
 *
 * Frame: metres, the active room centred at the origin — the frame
 * `SiblingRooms` already positions each sibling group in. The answer is in
 * A-B-C-D names, read off the sibling's bounding box, so it applies to a
 * legacy rectangle and harmlessly matches nothing on a drawn room, whose edges
 * are named '0'..'n-1' and are not axis-aligned anyway. That room therefore
 * renders exactly as it did before.
 */
export function siblingWallsInActiveRoom(
  offsetXM: number,
  offsetZM: number,
  sibling: { widthM: number; depthM: number },
  active: { widthM: number; depthM: number },
): Set<string> {
  const hidden = new Set<string>()
  if (![offsetXM, offsetZM, sibling.widthM, sibling.depthM, active.widthM, active.depthM]
    .every((n) => Number.isFinite(n))) return hidden

  const activeHalfW = active.widthM / 2
  const activeHalfD = active.depthM / 2
  const x0 = offsetXM - sibling.widthM / 2
  const x1 = offsetXM + sibling.widthM / 2
  const z0 = offsetZM - sibling.depthM / 2
  const z1 = offsetZM + sibling.depthM / 2

  // The wall has to run ALONG the active room as well as stand within reach of
  // it, or the two rooms merely share a corner — a neighbour to the east sits
  // level with the active room's own north and south walls, and those are the
  // ones whose chrome must stay.
  const overlaps = (a0: number, a1: number, half: number) =>
    Math.min(a1, half) - Math.max(a0, -half) > 1e-6
  const withinReach = (plane: number, half: number) =>
    Math.abs(plane) < half + OPENING_CHROME_REACH_M

  // A at -z, B at +x, C at +z, D at -x — the LEGACY_WALL_SIDE convention.
  if (withinReach(x0, activeHalfW) && overlaps(z0, z1, activeHalfD)) hidden.add('D')
  if (withinReach(x1, activeHalfW) && overlaps(z0, z1, activeHalfD)) hidden.add('B')
  if (withinReach(z0, activeHalfD) && overlaps(x0, x1, activeHalfW)) hidden.add('A')
  if (withinReach(z1, activeHalfD) && overlaps(x0, x1, activeHalfW)) hidden.add('C')
  return hidden
}
