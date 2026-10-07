import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { RoomGeometry } from "@/store/roomStore";
import { captureViewCanvas } from "@/lib/panorama360";
import {
  roomCameraPoses, renderSizeFor, verticalFovFor, RENDER_ASPECTS,
  type RenderAspect,
} from "@/lib/roomCameras";

/**
 * The four fixed cameras, driven.
 *
 * Where `Panorama360` hands the user a camera to turn, this one simply stands
 * them where the picture is taken from. There is no looking around: the whole
 * point of a fixed camera is that the shot is the same every time, so the view
 * the user is shown IS the view that gets saved. A mode they could turn in
 * would show them one thing and render another.
 *
 * `lib/roomCameras.ts` decides where the four stand and what shape the picture
 * is; this is the part that needs a renderer and a scene.
 */
export function RoomCameras({ station, aspect, geometry, onCaptured }: {
  /** 1-based, or null when the mode is off. */
  station: number | null;
  aspect: RenderAspect;
  geometry: RoomGeometry;
  onCaptured?: (canvas: HTMLCanvasElement, aspect: RenderAspect) => void;
}) {
  const { camera, gl, scene, invalidate, size } = useThree();
  const restore = useRef<{ position: THREE.Vector3; quaternion: THREE.Quaternion; fov: number } | null>(null);

  // Keyed on the outline's own numbers rather than the geometry object: the
  // store hands out a fresh one on every unrelated design change, and
  // recomputing four camera walks on each would be wasted work.
  const poseKey = JSON.stringify([
    geometry.vertices ?? null,
    geometry.walls.map((w) => [w.id, w.length]),
  ]);
  const poses = useMemo(
    () => roomCameraPoses(geometry),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [poseKey],
  );
  const pose = station == null ? null : poses[station - 1] ?? null;

  // Stand the camera at the station on the way in, and put it back exactly
  // where it was on the way out — the user's own view of the room is not
  // something a trip to a render camera should cost them.
  useEffect(() => {
    if (!pose) return;
    const persp = camera as THREE.PerspectiveCamera;
    restore.current = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      fov: persp.fov,
    };
    invalidate();

    return () => {
      const prev = restore.current;
      if (!prev) return;
      camera.position.copy(prev.position);
      camera.quaternion.copy(prev.quaternion);
      persp.fov = prev.fov;
      persp.updateProjectionMatrix();
      restore.current = null;
      invalidate();
    };
  }, [pose, camera, invalidate]);

  // Held every frame rather than set once: the orbit controls are still live
  // and would otherwise drift the camera off the station the moment the user
  // touched the viewport, and the preview would stop being the picture.
  useFrame(() => {
    if (!pose) return;
    camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
  });

  // The preview is framed to the VIEWPORT's aspect, not the picture's — the
  // viewport is the shape it is. Matching the horizontal angle is what makes
  // the preview honest about width; the saved picture then has more or less
  // height than the preview showed, which is the one thing a fixed camera on a
  // phone cannot avoid.
  useEffect(() => {
    if (!pose) return;
    const persp = camera as THREE.PerspectiveCamera;
    persp.fov = verticalFovFor(size.width / size.height);
    persp.updateProjectionMatrix();
    invalidate();
  }, [pose, aspect, camera, size.width, size.height, invalidate]);

  // The capture is driven from outside: the button lives in the page's chrome,
  // and this is the only place with the renderer and the scene.
  useEffect(() => {
    if (!pose || !onCaptured) return;
    const handler = () => {
      const target = renderSizeFor(aspect, gl.capabilities.maxTextureSize);
      const canvas = captureViewCanvas(
        gl, scene, pose, target, verticalFovFor(target.width / target.height),
      );
      onCaptured(canvas, aspect);
      invalidate();
    };
    window.addEventListener('andoza:capture-view', handler);
    return () => window.removeEventListener('andoza:capture-view', handler);
  }, [pose, aspect, gl, scene, onCaptured, invalidate]);

  return null;
}

/** What the capture button asks for. Declared here so the page need not know
 *  anything about renderers. */
export function requestViewCapture() {
  window.dispatchEvent(new Event('andoza:capture-view'));
}

export { RENDER_ASPECTS };
