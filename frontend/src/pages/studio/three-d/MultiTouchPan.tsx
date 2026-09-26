import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import type * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { createMultiTouchPan, type MultiTouchPanOptions } from "@/lib/multiTouchPan";

/**
 * Three-finger drag pans the scene on touch — the DOM wiring for
 * `createMultiTouchPan`, which holds the gesture logic and the camera maths
 * (and the note on why OrbitControls leaves this gap).
 *
 * Mount inside a <Canvas>, under an OrbitControls with `makeDefault` so the
 * controls are on the R3F store.
 */
export function MultiTouchPan({ panSpeed = 1, minPointers = 3 }: MultiTouchPanOptions = {}) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    if (!controls) return;
    const el = gl.domElement;
    const { onDown, onMove, onUp } = createMultiTouchPan(
      {
        getCamera: () => camera as THREE.PerspectiveCamera,
        getControls: () => controls,
        getViewportHeight: () => el.clientHeight,
        // frameloop="demand": without this the pan would only show up on the
        // next frame something else happened to request.
        onPan: invalidate,
      },
      { panSpeed, minPointers },
    );

    el.addEventListener("pointerdown", onDown);
    // move/up on the window: a finger can leave the canvas mid-drag, and
    // pointercancel is what a browser sends when it takes the gesture over.
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [controls, camera, gl, invalidate, panSpeed, minPointers]);

  return null;
}
