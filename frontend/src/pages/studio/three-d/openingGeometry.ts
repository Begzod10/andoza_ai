/**
 * Pure math for placing a window/door opening on a wall from a world-space
 * tap/click point. Split out of ThreeDPage.tsx — see that file's header
 * comment for the full picture.
 */
import type { PolyWallDef } from "@/lib/wallDefsFromVertices";

/**
 * A wall reduced to what placing an opening needs: how long it is, and how
 * far along it a world point falls (metres from the wall's position-0 end).
 * This is the single source of truth for converting a world raycast hit into
 * a wall-local coordinate — so a created opening is pinned to the clicked
 * wall and can never be computed against another one.
 */
export interface WallFrame {
  length: number;
  alongM: (p: { x: number; z: number }) => number;
}

/**
 * The legacy ABCD room's walls are axis-aligned, so "along" is just the world
 * coordinate measured from the wall's left edge at -W/2 (or -D/2). A drawn or
 * scanned room's walls (W1..Wn) run at arbitrary angles, so the hit is
 * projected onto the edge's own direction instead — without that branch
 * `wallGeom` returned null for them and nothing could be placed at all.
 */
export function wallGeom(
  wallId: string,
  W: number,
  D: number,
  polyDefs?: Record<string, PolyWallDef>,
): WallFrame | null {
  switch (wallId) {
    case 'A': case 'C': return { length: W, alongM: (p) => p.x + W / 2 };
    case 'B': case 'D': return { length: D, alongM: (p) => p.z + D / 2 };
    default: {
      const d = polyDefs?.[wallId];
      if (!d) return null;
      return {
        length: d.length,
        alongM: (p) => (p.x - d.midX) * d.dirX + (p.z - d.midZ) * d.dirZ + d.length / 2,
      };
    }
  }
}

/**
 * Create a window ('deraza') or door ('eshik') ON the given wall, centred on
 * the world hit `point`, in the wall's LOCAL coordinate system:
 *   position    = mm from the wall's left edge to the opening's left edge
 *   sill_height = mm from the floor to the opening's bottom (doors: always 0)
 * Both are clamped so the opening stays fully within the wall.
 *
 * Wall-local position/sill_height for an opening of the given size, centred
 * on a world-space hit point. Shared by the immediate door path and the
 * deferred window-confirm handler, so both use the exact same centring math
 * regardless of when the final width/height is known.
 */
export function computeOpeningRect(
  g: WallFrame,
  point: { x: number; y: number; z: number },
  widthMm: number, heightMm: number, isDoor: boolean,
  H: number,
): { position: number; sill_height: number } {
  const wallLenMm = g.length * 1000;
  const wallHMm = H * 1000;

  // Along-wall hit → left-edge offset, centred on the click.
  const uMm = g.alongM(point) * 1000;                    // mm from left edge
  const position = Math.max(0, Math.min(wallLenMm - widthMm, uMm - widthMm / 2));

  // Vertical: doors sit on the floor; windows centre on the hit height.
  let sill_height = 0;
  if (!isDoor) {
    const vMm = point.y * 1000;
    sill_height = Math.max(0, Math.min(wallHMm - heightMm, vMm - heightMm / 2));
  }
  return { position, sill_height };
}
