import type { WallElement } from "@/store/roomStore";
import { useMemo } from "react";
import { computeOpeningRect, wallGeom, type WallFrame } from "./openingGeometry";
import { wallDefsFromVertices } from "@/lib/wallDefsFromVertices";
import type { RoomGeometry } from "@/store/roomStore";

/**
 * Wires the pure opening-geometry math (openingGeometry.ts) to the room
 * store and the pending-window-sheet flow. Split out of ThreeDPage.tsx —
 * see that file's header comment for the full picture.
 */
export function useOpeningCreation(deps: {
  W: number;
  D: number;
  H: number;
  /** Needed for a drawn/scanned room: its walls run at arbitrary angles, so
   *  each edge's own frame has to come from the polygon. */
  geometry: RoomGeometry;
  addElement: (wallId: string, element: Omit<WallElement, 'id'>) => void;
  setPendingWindowSpot: (spot: {
    wallId: string; point: { x: number; y: number; z: number }; initialSillHeight: number;
  } | null) => void;
  setSelectedWall: (id: string | null) => void;
}) {
  const { W, D, H, geometry, addElement, setPendingWindowSpot, setSelectedWall } = deps;

  // Per-edge frames keyed by wall id — empty for a legacy ABCD room, which
  // takes the axis-aligned branch inside wallGeom instead.
  const polyDefs = useMemo(
    () => (geometry.vertices && geometry.vertices.length >= 3
      ? wallDefsFromVertices(geometry.vertices, geometry.walls.map((w) => w.id))
      : {}),
    [geometry],
  );

  /** Doors are added immediately at the tapped spot with a fixed size (no
   *  type/size to choose). Windows instead open pendingWindowSpot below —
   *  createOpening('deraza', ...) only remembers WHERE it was tapped; the
   *  actual addElement call happens once NewWindowSheet's onConfirm fires,
   *  using the user's chosen width/height/style/color, re-centred on this
   *  same point exactly like a door's fixed size already is. */
  function createOpening(wallId: string, point: { x: number; y: number; z: number } | undefined, type: 'deraza' | 'eshik') {
    const g = wallGeom(wallId, W, D, polyDefs);
    if (!g || !point) return;
    if (type === 'deraza') {
      // Pre-fill the sheet's "Poldan balandlik" stepper with the height
      // actually tapped (using the sheet's own default 900×1200 to compute
      // it, since the real width/height aren't chosen yet) — a sensible
      // starting point, not a value that gets silently overridden later if
      // the user leaves it alone or adjusts it further.
      const { sill_height } = computeOpeningRect(g, point, 900, 1200, false, H);
      setPendingWindowSpot({ wallId, point, initialSillHeight: sill_height });
      return;
    }
    const { position, sill_height } = computeOpeningRect(g, point, 900, 2100, true, H);
    addElement(wallId, { type, width: 900, height: 2100, sill_height, position });
    setSelectedWall(wallId);
  }

  return {
    wallGeom: (wallId: string) => wallGeom(wallId, W, D, polyDefs),
    computeOpeningRect: (
      g: WallFrame,
      point: { x: number; y: number; z: number },
      widthMm: number, heightMm: number, isDoor: boolean,
    ) => computeOpeningRect(g, point, widthMm, heightMm, isDoor, H),
    createOpening,
  };
}
