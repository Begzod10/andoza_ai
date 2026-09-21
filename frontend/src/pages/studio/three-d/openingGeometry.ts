/**
 * Pure math for placing a window/door opening on one of the room's four
 * walls from a world-space tap/click point. Split out of ThreeDPage.tsx —
 * see that file's header comment for the full picture.
 */

/**
 * The four rectangular walls in the room's own frame. Each wall runs along
 * one world axis; its "left edge" (where local `position` = 0) is at
 * `centerAlong − length/2` on that axis. This is the single source of truth
 * for converting a world raycast hit into a wall-local (u = along, v = up)
 * coordinate — so a created opening is pinned to the clicked wall and can
 * never be computed against another wall.
 */
export function wallGeom(
  wallId: string,
  W: number,
  D: number,
): { axis: 'X' | 'Z'; length: number; leftAlong: number } | null {
  switch (wallId) {
    case 'A': return { axis: 'X', length: W, leftAlong: -W / 2 };
    case 'C': return { axis: 'X', length: W, leftAlong: -W / 2 };
    case 'B': return { axis: 'Z', length: D, leftAlong: -D / 2 };
    case 'D': return { axis: 'Z', length: D, leftAlong: -D / 2 };
    default: return null;
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
  g: { axis: 'X' | 'Z'; leftAlong: number; length: number },
  point: { x: number; y: number; z: number },
  widthMm: number, heightMm: number, isDoor: boolean,
  H: number,
): { position: number; sill_height: number } {
  const wallLenMm = g.length * 1000;
  const wallHMm = H * 1000;

  // Along-wall hit → left-edge offset, centred on the click.
  const along = g.axis === 'X' ? point.x : point.z;      // metres, world
  const uMm = (along - g.leftAlong) * 1000;              // mm from left edge
  const position = Math.max(0, Math.min(wallLenMm - widthMm, uMm - widthMm / 2));

  // Vertical: doors sit on the floor; windows centre on the hit height.
  let sill_height = 0;
  if (!isDoor) {
    const vMm = point.y * 1000;
    sill_height = Math.max(0, Math.min(wallHMm - heightMm, vMm - heightMm / 2));
  }
  return { position, sill_height };
}
