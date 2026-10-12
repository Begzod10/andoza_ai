/**
 * What the whole flat draws for each opening — one plan, built in one place,
 * that the renderer follows and the tests count.
 *
 * The user's words: "when door is created on the wall between 2 rooms … that
 * door between should be visible in both rooms because it connects rooms to
 * each other". The design they approved:
 *
 *  - each opening in a shared partition is drawn ONCE for the whole flat: one
 *    lining spanning the real measured gap between the two rooms' faces, one
 *    leaf (or sash);
 *  - a door gets an architrave on BOTH faces of the partition;
 *  - it looks the same whichever room is being edited — the owner, the
 *    neighbour, or a third room — and both rooms' wall planes are cut;
 *  - editing stays with the room it was drawn in; from the other side a tap
 *    on it opens that room;
 *  - nothing is copied into the other room's stored geometry, and nothing is
 *    billed twice.
 *
 * ## The canonical drawer is the owner
 *
 * The room that OWNS an opening draws all of it — lining, frame ring, leaf and
 * both architraves — whether it is the room being edited or a sibling; every
 * other room only cuts the hole (lib/borrowedOpenings: borrowed openings are
 * always `bare`). The owner is the one choice that is independent of which
 * room is open: it is a fact about the data, so every room reaches the same
 * answer without knowing what the others decided, and the drawing follows the
 * door when it is moved or deleted because it is drawn from the door itself.
 * It is also the only room that can edit it, so the editable leaf and the
 * drawn leaf are the same object whenever the owner is open, and there is
 * nothing to hide or swap when it is not.
 *
 * The rule it replaces was "the ACTIVE room lines every doorway in its walls,
 * and siblings hide their chrome on the partition they share with it". That
 * made one doorway look different depending on which room was open (one
 * architrave, always on the active room's face), and a doorway stored in BOTH
 * rooms (lib/sharedOpenings copies, hand-drawn pairs) was drawn twice — two
 * linings on one set of planes and two leaves in one opening — whenever a
 * third room was open, because neither owner was the active room.
 *
 * A doorway stored in both rooms has two owners; exactly one copy is drawn
 * (lib/borrowedOpenings' `drawsBefore`: the active room's if it is one of the
 * two, so its door stays editable, else the smaller room id) and the other is
 * cut bare.
 *
 * ## The sibling partition rule, narrowed
 *
 * A sibling still switches off its chrome on the wall it shares with the room
 * being edited (`partitionWalls`: `siblingWallsInActiveRoom` by box, unioned
 * with `wallsAgainst`), because a 200 mm reveal or a skirting run from that
 * wall stands inside the active room when the rooms are closer than that, or
 * overlap. What is NOT switched off any more is an opening that sibling draws
 * as the one drawing of a shared doorway (`sharedPartition`): its lining spans
 * exactly the measured gap and its far architrave sits on the active room's
 * face, so none of it intrudes, and switching it off is what used to leave
 * the doorway with no leaf and one architrave when the active room was the
 * neighbour.
 *
 * Pure: no React, no three. The predicates below are the ones `DoorFrames`,
 * `WindowFrames`, the polygon shell and `OpeningLeaves` use, so what
 * `openingInventory` counts is what is drawn.
 */
import {
  neighbourOpenings, ownOpeningsOnly, wallsAgainst, withNeighbourOpenings,
  type PlacedRoom,
} from '@/lib/borrowedOpenings'
import { siblingWallsInActiveRoom } from '@/lib/siblingRoomView'
import { roomExtents } from '@/lib/roomDims'
import type { RoomGeometry, WallElement } from '@/store/roomStore'

// ─── What one room draws for one opening ─────────────────────────────────────

/**
 * Whether a room draws this opening's lining — its reveal, frame ring and
 * architrave(s). Not for a `bare` opening (a hole another room draws), and
 * not on a sibling's partition with the active room unless it is the one
 * drawing of a shared doorway (see the module comment).
 */
export function drawsOpeningLining(
  el: WallElement,
  wallId: string,
  partitionWalls?: ReadonlySet<string>,
): boolean {
  if (el.bare) return false
  if (partitionWalls?.has(wallId) && !el.sharedPartition) return false
  return true
}

/**
 * Whether the camera-facing cutaway takes this opening away with its wall.
 *
 * An ordinary opening goes with the wall it is cut in: the wall is culled from
 * outside, and a casing left behind would hang in the air. A doorway through a
 * shared partition does not — the neighbour's wall is still standing there
 * with the hole cut in it, and this is the ONE drawing of the door, so hiding
 * it from behind left "a hole but no door" on the neighbour's side.
 */
export function hiddenByCamera(
  el: WallElement,
  wallId: string,
  hiddenWalls: ReadonlySet<string> | undefined,
): boolean {
  return !!hiddenWalls?.has(wallId) && !el.sharedPartition
}

/** How many faces of the wall a drawn door is trimmed on: both when it is a
 *  doorway through a shared partition, the room's own face otherwise. Windows
 *  carry no architrave. */
export function architraveFaces(el: WallElement): 0 | 1 | 2 {
  if (el.type !== 'eshik') return 0
  return el.sharedPartition ? 2 : 1
}

/**
 * Whether a leaf (or sash) layer hangs one in this opening: wherever the
 * lining is drawn, since the leaf hangs in it — except that a borrowed
 * opening never reaches an EDITABLE layer, being editable only from its owner.
 */
export function drawsOpeningLeaf(
  el: WallElement,
  wallId: string,
  partitionWalls: ReadonlySet<string> | undefined,
  interactive: boolean,
): boolean {
  if (interactive && el.borrowedFrom) return false
  return drawsOpeningLining(el, wallId, partitionWalls)
}

// ─── The whole flat ──────────────────────────────────────────────────────────

export interface LeafLayer { geometry: RoomGeometry; interactive: boolean }

export interface RoomRenderPlan {
  id: string
  /** The geometry the room's shell is drawn from (`RoomScene`). */
  shell: RoomGeometry
  /** A sibling's walls that lie against the active room; empty for the active
   *  room itself. See "The sibling partition rule, narrowed". */
  partitionWalls: ReadonlySet<string>
  /** The leaf/sash layers this room mounts. */
  leaves: LeafLayer[]
}

export interface FlatRenderPlan {
  active: RoomRenderPlan
  siblings: Map<string, RoomRenderPlan>
}

const NONE: ReadonlySet<string> = new Set()

/**
 * Every room's render geometry, in one pass, for the room being edited
 * (`active`, at the origin of the layout frame) and its placed `siblings`.
 *
 * The active room mounts ONE leaf layer, editable, of its own openings; it
 * hangs nothing in a borrowed doorway, whose owner does. A sibling mounts one
 * read-only layer from its shell geometry — the same geometry its linings are
 * drawn from, so a shared doorway's leaf hangs at the far end of the measured
 * lining, and a duplicate copy it does not draw (`bare`) gets no leaf either.
 */
/**
 * A borrowed opening whose owner is hidden by focus, made drawable.
 *
 * Focusing one room hides the others, and a shared doorway's owner was the
 * only room drawing it — so the focused room was left with a bare hole ("shared
 * door is not visible in other room when focused on another room"). While the
 * owner is off screen, the room that only cut the hole draws the doorway
 * itself, from its own side: the lining across the measured gap, the leaf at
 * its far end (where the owner hangs it) and an architrave on both faces. It
 * is still the owner's door — borrowed, so never editable from here.
 */
function drawOrphanedBorrowed(shell: RoomGeometry, visible: (id: string) => boolean): RoomGeometry {
  const orphaned = (el: WallElement) => !!el.borrowedFrom && !!el.bare && !visible(el.borrowedFrom)
  if (!shell.walls.some((w) => w.elements.some(orphaned))) return shell
  return {
    ...shell,
    walls: shell.walls.map((w) => ({
      ...w,
      elements: w.elements.map((el): WallElement => {
        if (!orphaned(el)) return el
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { bare, ...drawn } = el
        return { ...drawn, sharedPartition: true, partitionGapMm: el.revealDepthMm ?? 0 }
      }),
    })),
  }
}

/** Only the borrowed openings of a shell — the ones `drawOrphanedBorrowed`
 *  made drawable — for a read-only leaf layer of their own. */
function borrowedDrawnOnly(shell: RoomGeometry): RoomGeometry | null {
  if (!shell.walls.some((w) => w.elements.some((el) => el.borrowedFrom && !el.bare))) return null
  return {
    ...shell,
    walls: shell.walls.map((w) => ({ ...w, elements: w.elements.filter((el) => el.borrowedFrom && !el.bare) })),
  }
}

export interface FlatPlanOptions {
  /** Which rooms are on screen — false for a room hidden by focus. */
  visible?: (roomId: string) => boolean
}

export function flatRenderPlan(
  active: PlacedRoom,
  siblings: readonly PlacedRoom[],
  { visible = () => true }: FlatPlanOptions = {},
): FlatRenderPlan {
  const activeId = active.id
  const activeShell = drawOrphanedBorrowed(
    withNeighbourOpenings(active.geometry, neighbourOpenings(active, siblings, { activeId })),
    visible,
  )
  const everyone = [active, ...siblings]
  const a = roomExtents(active.geometry)
  const out = new Map<string, RoomRenderPlan>()
  for (const sib of siblings) {
    const s = roomExtents(sib.geometry)
    const partitionWalls = new Set([
      ...siblingWallsInActiveRoom(sib.offsetXM, sib.offsetZM, { widthM: s.W, depthM: s.D }, { widthM: a.W, depthM: a.D }),
      ...wallsAgainst(sib, active),
    ])
    const shell = drawOrphanedBorrowed(
      withNeighbourOpenings(sib.geometry, neighbourOpenings(sib, everyone, { activeId })),
      visible,
    )
    out.set(sib.id, { id: sib.id, shell, partitionWalls, leaves: [{ geometry: shell, interactive: false }] })
  }
  return {
    active: {
      id: activeId,
      shell: activeShell,
      partitionWalls: NONE,
      leaves: [
        { geometry: ownOpeningsOnly(activeShell), interactive: true },
        // A hidden owner's doorway, hung from here while it is off screen.
        ...(() => { const g = borrowedDrawnOnly(activeShell); return g ? [{ geometry: g, interactive: false }] : [] })(),
      ],
    },
    siblings: out,
  }
}

// ─── Counting it ─────────────────────────────────────────────────────────────

export interface OpeningCount { linings: number; leaves: number; architraves: number }

/** One physical opening's key, the same from every room: `<owner>:<element>`.
 *  A borrowed copy's id is `borrowed:<owner>:<element>` (borrowedCopy). */
export function physicalKey(roomId: string, el: WallElement): string {
  if (el.borrowedFrom) return `${el.borrowedFrom}:${el.id.slice(`borrowed:${el.borrowedFrom}:`.length)}`
  return `${roomId}:${el.id}`
}

/**
 * How many linings, leaves and architraves the whole flat draws for each
 * physical opening under `plan` — the renderer's own predicates, applied to
 * the renderer's own inputs. Every opening that reaches any room's shell has
 * an entry, so an opening that is cut but drawn by nobody shows as zeros.
 */
export function openingInventory(
  plan: FlatRenderPlan,
  /** Which rooms are on screen; a room hidden by focus draws nothing. */
  visible: (roomId: string) => boolean = () => true,
): Map<string, OpeningCount> {
  const counts = new Map<string, OpeningCount>()
  const at = (k: string) => {
    let c = counts.get(k)
    if (!c) counts.set(k, (c = { linings: 0, leaves: 0, architraves: 0 }))
    return c
  }
  for (const room of [plan.active, ...plan.siblings.values()]) {
    if (!visible(room.id)) continue
    for (const wall of room.shell.walls) {
      for (const el of wall.elements) {
        const c = at(physicalKey(room.id, el))
        if (!drawsOpeningLining(el, wall.id, room.partitionWalls)) continue
        c.linings += 1
        c.architraves += architraveFaces(el)
      }
    }
    for (const layer of room.leaves) {
      for (const wall of layer.geometry.walls) {
        for (const el of wall.elements) {
          if (!drawsOpeningLeaf(el, wall.id, room.partitionWalls, layer.interactive)) continue
          at(physicalKey(room.id, el)).leaves += 1
        }
      }
    }
  }
  return counts
}
