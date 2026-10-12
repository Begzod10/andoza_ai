import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { useViewLockStore } from "@/store/viewLockStore";

/**
 * Switches the scene's pointer events off while the view is locked.
 *
 * One switch rather than a check in every handler: react-three-fiber skips
 * raycasting altogether when `events.enabled` is false, so every mesh handler
 * in the canvas — rings, selection, drags, hold-to-delete, the doors — goes
 * quiet at once, and nothing added later can forget to ask. OrbitControls
 * listens on the DOM itself, so the camera still turns and zooms.
 */
export function ViewLockGate() {
  const locked = useViewLockStore((s) => s.locked);
  const set = useThree((s) => s.set);
  useEffect(() => {
    set((st) => ({ events: { ...st.events, enabled: !locked } }));
  }, [locked, set]);
  return null;
}
