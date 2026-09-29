import { useRef, useState, type RefObject } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { RadialSurface } from "@/components/studio/SurfaceRadialMenu";
import { armsForDragging } from "@/lib/doubleTapArm";

export type RadialState = {
  surface: RadialSurface;
  wallId?: string;
  /** The opening the ring was opened on, for the door/window rings — the ring
   *  changes THAT door rather than making a new one. */
  elId?: string;
  x: number; y: number;
  point?: { x: number; y: number; z: number };
} | null;

/**
 * Tap/press ("aylana") detection on 3D surfaces (wall/ceiling/floor) that
 * opens the surface radial context menu. A single click opens it immediately
 * (the primary trigger, works with mouse and touch); a ~460ms hold that
 * doesn't drift is a still-supported alternative path. Any real drag (camera
 * orbit) cancels a pending hold first.
 *
 * Split out of ThreeDPage.tsx — see that file's header comment for the full
 * picture.
 */
export function useSurfaceRadialMenu(controlsRef: RefObject<OrbitControlsImpl | null>) {
  const [radial, setRadial] = useState<RadialState>(null);
  /**
   * The opening a double tap has armed for dragging, if any.
   *
   * One tap shows what a door could be; two say you mean to move it. Without
   * that, a finger resting on a door and sliding a little walked it along the
   * wall, which is not what anyone taps a door to do.
   */
  const [armedOpening, setArmedOpening] = useState<{ wallId?: string; elId: string } | null>(null);
  const openedAt = useRef(0);
  const radialRef = useRef<RadialState>(null);
  radialRef.current = radial;
  // World-space hit point of the press, captured from the raycast so a created
  // window/door lands exactly where the wall was touched.
  const holdPoint = useRef<{ x: number; y: number; z: number } | null>(null);
  const holdTimer = useRef<number | null>(null);
  const holdStart = useRef<{ x: number; y: number } | null>(null);
  // True from the moment a long-press fires until the next surface click, so
  // the click that ends the hold doesn't ALSO run the tap-select behaviour.
  const heldRef = useRef(false);

  const HOLD_MS = 460;
  const HOLD_MOVE_TOL = 12; // px of finger travel that still counts as a hold

  function clearHold() {
    if (holdTimer.current != null) { window.clearTimeout(holdTimer.current); holdTimer.current = null; }
    holdStart.current = null;
  }
  function clearHoldTimerOnly() {
    if (holdTimer.current != null) { window.clearTimeout(holdTimer.current); holdTimer.current = null; }
  }

  /**
   * Open the surface radial ("aylana") menu at the tap/click point. This is
   * the PRIMARY trigger now (works with a single mouse click on desktop and
   * a tap on touch); the long-press path below still works as an
   * alternative. The click carries the R3F world hit (`e.point`) so a
   * created window/door lands exactly where the surface was tapped.
   */
  function openSurfaceMenu(surface: RadialSurface, wallId: string | undefined, e: any, elId?: string) {
    // If a long-press already opened the menu, its trailing click must not
    // reopen/replace it.
    if (heldRef.current) { heldRef.current = false; return; }
    const x = e?.nativeEvent?.clientX ?? e?.clientX ?? 0;
    const y = e?.nativeEvent?.clientY ?? e?.clientY ?? 0;
    const point = e?.point ? { x: e.point.x, y: e.point.y, z: e.point.z } : (holdPoint.current ?? undefined);
    if (controlsRef.current) controlsRef.current.enabled = false;
    openedAt.current = Date.now();
    // Opening a ring on anything else lets go of whatever was armed.
    if (!elId || armedOpening?.elId !== elId) setArmedOpening(null);
    setRadial({ surface, wallId, elId, x, y, point });
  }

  /** Lets go of the armed opening — a tap on empty space, or on anything
   *  else. */
  function disarmOpening() { setArmedOpening(null); }

  function startHold(surface: RadialSurface, wallId: string | undefined, e: { nativeEvent?: PointerEvent; clientX?: number; clientY?: number; point?: { x: number; y: number; z: number }; stopPropagation?: () => void }, elId?: string) {
    const cx = e.nativeEvent?.clientX ?? e.clientX ?? 0;
    const cy = e.nativeEvent?.clientY ?? e.clientY ?? 0;
    // The R3F event's world intersection point — where on the wall it was hit.
    holdPoint.current = e.point ? { x: e.point.x, y: e.point.y, z: e.point.z } : null;
    holdStart.current = { x: cx, y: cy };
    clearHoldTimerOnly();
    holdTimer.current = window.setTimeout(() => {
      heldRef.current = true;
      // Freeze the camera so menu taps don't orbit the room, and drop any
      // active selection highlight noise.
      if (controlsRef.current) controlsRef.current.enabled = false;
      setRadial({ surface, wallId, elId, x: cx, y: cy, point: holdPoint.current ?? undefined });
    }, HOLD_MS);
  }
  function moveHold(e: { nativeEvent?: PointerEvent; clientX?: number; clientY?: number }) {
    if (!holdStart.current) return;
    const cx = e.nativeEvent?.clientX ?? e.clientX ?? 0;
    const cy = e.nativeEvent?.clientY ?? e.clientY ?? 0;
    if (Math.hypot(cx - holdStart.current.x, cy - holdStart.current.y) > HOLD_MOVE_TOL) clearHold();
  }
  function closeRadial() {
    // A tap that dismisses the ring within half a second of it opening is the
    // second half of a double tap: the finger is still on the door. That arms
    // it for dragging; a considered dismiss a moment later does not.
    const r = radialRef.current;
    if (armsForDragging(r, openedAt.current, Date.now())) {
      setArmedOpening({ wallId: r!.wallId, elId: r!.elId! });
    }
    setRadial(null);
    if (controlsRef.current) controlsRef.current.enabled = true;
    // Safety net: if the trailing click never arrived, don't leave the guard
    // armed or the next genuine tap would be swallowed.
    heldRef.current = false;
  }

  /** Pointer handlers to spread onto a surface's wrapping <group>. */
  function holdBind(surface: RadialSurface, wallId?: string, elId?: string) {
    return {
      onClick: (e: any) => openSurfaceMenu(surface, wallId, e, elId),
      onPointerDown: (e: any) => startHold(surface, wallId, e, elId),
      onPointerMove: (e: any) => moveHold(e),
      onPointerUp: () => clearHold(),
      onPointerLeave: () => clearHold(),
      onPointerCancel: () => clearHold(),
    };
  }

  return { radial, holdBind, closeRadial, armedOpening, disarmOpening };
}
