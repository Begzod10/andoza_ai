import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { capturePanoramaCanvas } from "@/lib/panorama360";
import { SNAP_EVENT, type SnapRequest } from "@/lib/panoramaSnap";
import { roomCentreWorld } from "@/lib/roomCentre";
import type { RoomGeometry } from "@/store/roomStore";

/**
 * Answers the render sheet's request for a panorama of the room.
 *
 * Always mounted inside the Canvas, unlike the 360 camera, which only listens
 * while it is the active mode: the render sheet should be able to ask whatever
 * the user happens to be looking at.
 */
export function PanoramaSnap({ geometry }: {
  /** The room's outline. The snapshot is taken from the middle of the floor —
   *  `roomCentreWorld` — and not from the world origin, which is only the
   *  middle of a rectangle. In a drawn L-shaped room the origin is the mean of
   *  the outline's vertices and sits in the cut-away notch, so the render sheet
   *  used to send the gateway a panorama of the inside of a wall. */
  geometry: RoomGeometry;
}) {
  const { gl, scene, invalidate } = useThree();

  // Keyed on the outline's own numbers, because the store replaces the
  // geometry object on every unrelated design change and this component is
  // mounted for the whole life of the scene.
  const eyeKey = JSON.stringify([geometry.vertices ?? null, geometry.walls.map((w) => [w.id, w.length])]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const eye = useMemo(() => roomCentreWorld(geometry), [eyeKey]);

  useEffect(() => {
    const handler = (e: Event) => {
      const request = (e as CustomEvent<SnapRequest>).detail;
      try {
        request.resolve(capturePanoramaCanvas(gl, scene, eye));
      } catch {
        request.resolve(null); // a GPU that would not grant the render target
      } finally {
        invalidate();
      }
    };
    window.addEventListener(SNAP_EVENT, handler);
    return () => window.removeEventListener(SNAP_EVENT, handler);
  }, [gl, scene, eye, invalidate]);

  return null;
}
