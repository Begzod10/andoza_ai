import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { capturePanoramaCanvas } from "@/lib/panorama360";
import { SNAP_EVENT, type SnapRequest } from "@/lib/panoramaSnap";

/**
 * Answers the render sheet's request for a panorama of the room.
 *
 * Always mounted inside the Canvas, unlike the 360 camera, which only listens
 * while it is the active mode: the render sheet should be able to ask whatever
 * the user happens to be looking at.
 */
export function PanoramaSnap() {
  const { gl, scene, invalidate } = useThree();

  useEffect(() => {
    const handler = (e: Event) => {
      const request = (e as CustomEvent<SnapRequest>).detail;
      try {
        request.resolve(capturePanoramaCanvas(gl, scene));
      } catch {
        request.resolve(null); // a GPU that would not grant the render target
      } finally {
        invalidate();
      }
    };
    window.addEventListener(SNAP_EVENT, handler);
    return () => window.removeEventListener(SNAP_EVENT, handler);
  }, [gl, scene, invalidate]);

  return null;
}
