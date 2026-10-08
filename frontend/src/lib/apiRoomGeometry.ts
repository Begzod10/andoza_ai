/**
 * The API's room geometry, in the units the store and every renderer speak.
 *
 * This conversion used to live inline inside `roomStore`'s `loadRoom`, which
 * made it reachable by exactly one caller: the room the user has open. That is
 * the root cause of the sibling-room drift this module was extracted for. The
 * other rooms of an apartment arrive from `GET /apartments/{id}/rooms` in the
 * same API shape, and drawing them needed the same conversion — so the sibling
 * layer grew its own flat-slab stand-in instead, and that stand-in then fell
 * further behind the real shell with every feature added to the real one (no
 * ceiling, no trims, no openings, no ceiling design). One shared converter
 * means a sibling room cannot disagree with the room it becomes when you open
 * it, because both are built from the same numbers by the same code.
 *
 * Units are the project's standing trap and this is the boundary where they
 * change, so they are spelled out:
 *
 *  - API: METRES. An opening's `position` is its CENTRE as a 0..1 fraction of
 *    its wall's length.
 *  - Store: MILLIMETRES. An opening's `position` is its LEFT EDGE, measured
 *    from the wall's position-0 end.
 *
 * Every local is therefore named `…M` or `…Mm`, and the fraction is turned
 * into millimetres by `apiPositionToStoreMm` rather than by hand here.
 */
import { nanoid } from 'nanoid'
import { apiPositionToStoreMm } from '@/lib/wallPositions'
import type { RoomGeometry, RoomPayloadGeometry, WallElement } from '@/store/types'

/**
 * How an element's id is minted.
 *
 * The API sends no per-element id, but selection, dragging and removal are all
 * keyed on one, so the store has always minted them. `nanoid` is right for the
 * room being edited: its elements are about to be mutated, and a fresh
 * identity per load is exactly what the editor wants.
 *
 * It is wrong for a sibling room, for two separate reasons, which is why this
 * is a parameter rather than a hardcoded call:
 *
 *  - a sibling's conversion is memoized and re-run whenever its inputs change,
 *    and random ids would give React a brand-new key for every opening on each
 *    re-run, tearing down and rebuilding its frame, leaf and glass;
 *  - the live opening-drag channel (`liveOpeningDrag` in WallComponents) is a
 *    single module-level ref matched on `wallId` + `elId`, and every ABCD room
 *    in the flat has a wall called "A". Only the element id distinguishes them,
 *    so a sibling's ids must be unique across rooms or dragging the active
 *    room's door would move the neighbour's too.
 */
export type MintElementId = (wallId: string, index: number) => string

/** Random ids, as the editor has always had. */
export const randomElementId: MintElementId = () => nanoid()

/**
 * Room-scoped, stable ids — what every read-only room in the flat wants. See
 * `MintElementId` for the two bugs this avoids.
 */
export function roomScopedElementId(roomId: string): MintElementId {
  return (wallId, index) => `${roomId}:${wallId}:${index}`
}

/**
 * API geometry → store geometry, or `null` when there is nothing to convert.
 *
 * `null` rather than a default room on purpose: the two callers want different
 * answers for "this room has no walls". `loadRoom` substitutes
 * `defaultGeometry()`, because the user is standing in that room and must be
 * given something to edit; the sibling layer skips the room entirely, because
 * inventing a 4x3 box in the middle of someone's flat is worse than leaving a
 * gap where the unconfigured room is.
 */
export function apiGeometryToStoreGeometry(
  api: RoomPayloadGeometry | null | undefined,
  mintId: MintElementId = randomElementId,
): RoomGeometry | null {
  if (!api?.walls?.length) return null
  return {
    walls: api.walls.map((w) => {
      const lengthMm = Math.round(w.length * 1000)
      return {
        id: w.id,
        length: lengthMm,
        elements: (w.elements ?? []).map((e, i) => {
          const widthMm = Math.round(e.width * 1000)
          return {
            id: mintId(w.id, i),
            type: e.type as WallElement['type'],
            width: widthMm,
            height: Math.round(e.height * 1000),
            sill_height: Math.round((e.sill_height ?? 0) * 1000),
            // Centre fraction → left-edge mm. This is the one place the API's
            // convention is translated on the way in.
            position: apiPositionToStoreMm(e.position ?? 0.5, lengthMm, widthMm),
            // A saved element is a real placement, never a placeholder.
            // Without this, the legacy `position <= 0` fallback in
            // `resolveElementPositions` would re-centre any opening whose
            // centre sits within half its width of the start corner — exactly
            // where the conversion above legitimately puts a corner door, at a
            // negative left edge.
            positionAuto: false,
            ...(e.style_id ? { styleId: e.style_id } : {}),
            ...(e.sashes === 1 || e.sashes === 2 ? { sashes: e.sashes as 1 | 2 } : {}),
          }
        }),
      }
    }),
    vertices: api.vertices?.map(([xM, zM]) => [
      Math.round(xM * 1000),
      Math.round(zM * 1000),
    ]) as [number, number][] | undefined,
  }
}
