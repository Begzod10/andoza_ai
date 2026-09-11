/**
 * Shared constants/types/helpers used by more than one DesignPanel section.
 * Split out of DesignPanel.tsx so WallSection and SuvoqSection (which both
 * offer a wall/floor/ceiling target picker) stay in sync without duplicating
 * the list or the derivation logic.
 */

export type WallTarget = "ALL" | "A" | "B" | "C" | "D" | "FLOOR" | "CEILING";

export const WALL_TARGETS: { key: WallTarget; label: string }[] = [
  { key: "ALL",   label: "Hamma devorlar" },
  { key: "A",     label: "Devor A" },
  { key: "B",     label: "Devor B" },
  { key: "C",     label: "Devor C" },
  { key: "D",     label: "Devor D" },
  { key: "FLOOR", label: "Pol" },
  { key: "CEILING", label: "Shift" },
];

export const FLOOR_TYPES = [
  { key: "parquet",  label: "Parket"  },
  { key: "tile",     label: "Kafel"   },
  { key: "laminate", label: "Laminat" },
  { key: "concrete", label: "Beton"   },
];

/** Derive the active wall/floor/ceiling target from the 3D viewport's
 * `selectedWall` prop, defaulting to "ALL" for anything it doesn't recognize. */
export function resolveTargetWall(selectedWall: string | null | undefined): WallTarget {
  return (selectedWall && (["A", "B", "C", "D", "FLOOR", "CEILING"] as string[]).includes(selectedWall))
    ? (selectedWall as WallTarget)
    : "ALL";
}
