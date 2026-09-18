/**
 * Shared constants/types/helpers used by more than one wall/floor/ceiling
 * target picker across the studio (DesignPanel's WallSection + SuvoqSection,
 * AddObjectSheet's wallpaper quick-picker, and IsometricPage's fallback
 * editor).
 *
 * `WALL_TARGETS` used to be a hardcoded ALL/A/B/C/D array (each surface kept
 * its own copy, or imported this one). That broke down for hand-drawn
 * polygon rooms, whose `geometry.walls` aren't guaranteed to be exactly 4
 * walls named A/B/C/D (e.g. a 5-wall room has ids like W1..W5) — every
 * surface still offered exactly 4 buttons literally labeled "Devor A".."Devor D",
 * none of which corresponded to any real wall.
 *
 * `getWallTargets(geometry)` derives the real per-wall entries live from the
 * room's own `geometry.walls`, in the room's own wall order, so it
 * generalizes to any wall count/id scheme while staying byte-for-byte
 * identical to the old static list for today's normal 4-wall A/B/C/D room.
 */

import type { RoomGeometry } from "@/store/roomStore";

/** The resolved target key: "ALL", a real `Wall.id`, or one of the
 * non-wall sentinels ("FLOOR"/"CEILING") some surfaces also offer. */
export type WallTarget = string;

export interface WallTargetOption {
  key: WallTarget;
  label: string;
}

/** Not a real wall in `geometry.walls` — surfaces that offer a floor target
 * append this themselves alongside `getWallTargets`. */
export const FLOOR_TARGET: WallTargetOption = { key: "FLOOR", label: "Pol" };

/** Not a real wall in `geometry.walls` — surfaces that offer a ceiling
 * target append this themselves alongside `getWallTargets`. */
export const CEILING_TARGET: WallTargetOption = { key: "CEILING", label: "Shift" };

export const FLOOR_TYPES = [
  { key: "parquet",  label: "Parket"  },
  { key: "tile",     label: "Kafel"   },
  { key: "laminate", label: "Laminat" },
  { key: "concrete", label: "Beton"   },
];

/** The chip label for one wall.
 *
 * This used to index a hardcoded ["Devor A".."Devor D"] list BY POSITION, so
 * a scanned room whose walls are "0".."4" rendered chips reading "Devor A",
 * "Devor B", "Devor C", "Devor D", "Devor 4" — four labels naming walls that
 * do not exist, plus one real id, with no way to tell which was which. The
 * `key` was the real id all along, so selection targeted the right wall; only
 * the name lied. Worse, the room-settings sheet and its DERAZALAR VA ESHIKLAR
 * list label those same walls "Devor 0".."Devor 4", so the two panels
 * disagreed about what a wall is called.
 *
 * A wall is now named after its real id — "Devor 0", "Devor W3" — for every
 * room, exactly like `RoomSettingsSheet`'s `WALL_LABELS` fallback. The one
 * exception needs no special case: the legacy wizard rectangle that
 * `roomDims`' `hasAbcdWalls` identifies is exactly the room whose ids ARE
 * A/B/C/D, so labelling by id keeps rendering "Devor A".."Devor D" for it
 * byte-for-byte as before — the old position lookup and the id agree on that
 * one shape and only on that one. Branching on `hasAbcdWalls` here would be
 * dead code, so the test stays in `roomDims` for the callers (the header, the
 * settings sheet's steppers) that genuinely have to pick a different layout. */
function wallLabel(id: string): string {
  return `Devor ${id}`;
}

/** Build the "ALL" + one-entry-per-actual-wall target list from the room's
 * live geometry, in the room's own wall order. For today's normal 4-wall
 * A/B/C/D room this returns exactly the old hardcoded ALL/A/B/C/D list; for
 * any other wall count/ids it returns one entry per real wall instead.
 * Callers that also offer FLOOR/CEILING targets append `FLOOR_TARGET`/
 * `CEILING_TARGET` themselves — those aren't real walls in `geometry.walls`. */
export function getWallTargets(geometry: Pick<RoomGeometry, "walls">): WallTargetOption[] {
  return [
    { key: "ALL", label: "Hamma devorlar" },
    ...geometry.walls.map((w) => ({ key: w.id, label: wallLabel(w.id) })),
  ];
}

/** Derive the active wall/floor/ceiling target from the 3D viewport's
 * `selectedWall` prop, defaulting to "ALL" when nothing is selected.
 *
 * Used to validate `selectedWall` against a hardcoded ALL/A/B/C/D/FLOOR/
 * CEILING allow-list, silently falling back to "ALL" for anything else —
 * which broke hand-drawn polygon rooms, whose real wall ids (W1, W2, ...)
 * aren't in that list. `selectedWall` is always either a real `Wall.id`, one
 * of the FLOOR/CEILING sentinels, or null/undefined/empty, so any non-empty
 * value can be trusted and passed through as-is. */
export function resolveTargetWall(selectedWall: string | null | undefined): WallTarget {
  return selectedWall || "ALL";
}
