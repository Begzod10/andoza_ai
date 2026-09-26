import { useRef, useState, type RefObject } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { RadialSurface } from "@/components/studio/SurfaceRadialMenu";

export type RadialState = {
  surface: RadialSurface; wallId?: string; x: number; y: number; point?: { x: number; y: number; z: number };
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
  function openSurfaceMenu(surface: RadialSurface, wallId: string | undefined, e: any) {
    // If a long-press already opened the menu, its trailing click must not
    // reopen/replace it.
    if (heldRef.current) { heldRef.current = false; return; }
    const x = e?.nativeEvent?.clientX ?? e?.clientX ?? 0;
    const y = e?.nativeEvent?.clientY ?? e?.clientY ?? 0;
    const point = e?.point ? { x: e.point.x, y: e.point.y, z: e.point.z } : (holdPoint.current ?? undefined);
    if (controlsRef.current) controlsRef.current.enabled = false;
    setRadial({ surface, wallId, x, y, point });
  }

  function startHold(surface: RadialSurface, wallId: string | undefined, e: { nativeEvent?: PointerEvent; clientX?: number; clientY?: number; point?: { x: number; y: number; z: number }; stopPropagation?: () => void }) {
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
      setRadial({ surface, wallId, x: cx, y: cy, point: holdPoint.current ?? undefined });
    }, HOLD_MS);
  }
  function moveHold(e: { nativeEvent?: PointerEvent; clientX?: number; clientY?: number }) {
    if (!holdStart.current) return;
    const cx = e.nativeEvent?.clientX ?? e.clientX ?? 0;
    const cy = e.nativeEvent?.clientY ?? e.clientY ?? 0;
    if (Math.hypot(cx - holdStart.current.x, cy - holdStart.current.y) > HOLD_MOVE_TOL) clearHold();
  }
  function closeRadial() {
    setRadial(null);
    if (controlsRef.current) controlsRef.current.enabled = true;
    // Safety net: if the trailing click never arrived, don't leave the guard
    // armed or the next genuine tap would be swallowed.
    heldRef.current = false;
  }

  /** Pointer handlers to spread onto a surface's wrapping <group>. */
  function holdBind(surface: RadialSurface, wallId?: string) {
    return {
      onClick: (e: any) => openSurfaceMenu(surface, wallId, e),
      onPointerDown: (e: any) => startHold(surface, wallId, e),
      onPointerMove: (e: any) => moveHold(e),
      onPointerUp: () => clearHold(),
      onPointerLeave: () => clearHold(),
      onPointerCancel: () => clearHold(),
    };
  }

  return { radial, holdBind, closeRadial };
}
