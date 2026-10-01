import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  PANO_EYE_HEIGHT, PANO_WIDTH, PANO_HEIGHT,
  panoramaSizeFor, renderPanorama, flipRows,
} from "@/lib/panorama360";
import { roomCentreWorld } from "@/lib/roomCentre";
import type { RoomGeometry } from "@/store/roomStore";

/**
 * The 360 camera: standing in the middle of the room at eye height, turning on
 * the spot.
 *
 * No target, deliberately. The studio's ordinary camera orbits a point, which
 * is right for looking AT a room; a panorama is taken from inside one, so this
 * one only ever turns — drag left and you look left, as you would standing
 * there. It cannot be walked or zoomed out of the room, which is what keeps
 * the picture a panorama of that spot rather than of wherever the camera
 * drifted to.
 *
 * "The middle of the room" is `roomCentreWorld` (lib/roomCentre.ts), derived
 * from the floor's own edges, and NOT the world origin this used to assume.
 * The origin is where the 3D shell centres the outline, which for a drawn or
 * scanned polygon is the mean of its vertices — a point that is simply not in
 * an L-shaped room, so the camera stood in the notch and the panorama was a
 * picture of the inside of a wall. See that file for which definition of
 * "middle" and why.
 */

/** How far a drag turns the view. Tuned so a full turn is a comfortable
 *  sweep of a phone screen rather than three of them. */
const LOOK_SPEED = 0.0042;

/** Looking straight up or down flips the horizon over; stop just short. */
const PITCH_LIMIT = Math.PI / 2 - 0.02;

export function Panorama360({ active, geometry, onCaptured }: {
  active: boolean;
  /** The room's outline, so the camera can be stood in the middle of the
   *  floor rather than at the origin. Required rather than optional: an
   *  optional one would have been left unwired in exactly the drawn rooms
   *  that need it, which is how the door and window casings of every scanned
   *  room ended up floating (see `hiddenAttachments` in RoomShell). */
  geometry: RoomGeometry;
  /** Fired with the finished equirectangular image, 4000 x 2000 unless the
   *  GPU would not grant it. */
  onCaptured?: (canvas: HTMLCanvasElement) => void;
}) {
  const { camera, gl, scene, invalidate } = useThree();
  const look = useRef({ yaw: 0, pitch: 0 });
  const dragging = useRef<{ x: number; y: number } | null>(null);
  const restore = useRef<{ position: THREE.Vector3; quaternion: THREE.Quaternion } | null>(null);

  /**
   * Where the camera stands, world metres. Memoised on the vertex and wall
   * numbers rather than on the geometry object: the store hands out a fresh
   * object on every unrelated design change, and the pole-of-inaccessibility
   * search, while cheap, has no business running on each of them. The height
   * is `PANO_EYE_HEIGHT` and stays that way — the user chose 1650 mm above the
   * floor deliberately, and only the horizontal position was ever wrong.
   */
  const eyeKey = JSON.stringify([geometry.vertices ?? null, geometry.walls.map((w) => [w.id, w.length])]);
  const eye = useMemo(() => {
    const c = roomCentreWorld(geometry);
    return new THREE.Vector3(c.x, PANO_EYE_HEIGHT, c.z);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eyeKey]);

  // Take the camera to the middle of the room on the way in, and put it back
  // exactly where it was on the way out — leaving the user's view of the room
  // where they left it.
  useEffect(() => {
    if (!active) return;
    restore.current = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
    };
    camera.position.copy(eye);
    // Start facing the way the camera already faced, so entering the mode does
    // not spin the room.
    const dir = new THREE.Vector3();
    restore.current.quaternion && camera.getWorldDirection(dir);
    look.current = { yaw: Math.atan2(-dir.x, -dir.z), pitch: 0 };
    invalidate();

    return () => {
      const prev = restore.current;
      if (!prev) return;
      camera.position.copy(prev.position);
      camera.quaternion.copy(prev.quaternion);
      restore.current = null;
      invalidate();
    };
  }, [active, camera, eye, invalidate]);

  // Drag to turn. On the canvas itself rather than through R3F's object
  // events: there is nothing to hit — the point is to look around the room,
  // not at anything in it.
  useEffect(() => {
    if (!active) return;
    const el = gl.domElement;

    const down = (e: PointerEvent) => { dragging.current = { x: e.clientX, y: e.clientY }; };
    const move = (e: PointerEvent) => {
      const from = dragging.current;
      if (!from) return;
      look.current.yaw -= (e.clientX - from.x) * LOOK_SPEED;
      look.current.pitch -= (e.clientY - from.y) * LOOK_SPEED;
      look.current.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, look.current.pitch));
      dragging.current = { x: e.clientX, y: e.clientY };
      invalidate();
    };
    const up = () => { dragging.current = null; };

    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      dragging.current = null;
    };
  }, [active, gl, invalidate]);

  useFrame(() => {
    if (!active) return;
    // Pinned every frame, not just on entry: this is what stops anything else
    // in the scene (an orbit control that is still mounted, a camera tween)
    // from walking the panorama camera away from the spot it is taking the
    // panorama from.
    camera.position.copy(eye);
    camera.rotation.set(look.current.pitch, look.current.yaw, 0, 'YXZ');
  });

  // The capture is driven from outside: the button lives in the page's chrome,
  // and this is the only place with the renderer and the scene.
  useEffect(() => {
    if (!active || !onCaptured) return;
    const handler = () => {
      const max = gl.capabilities.maxTextureSize;
      const size = panoramaSizeFor(max);
      // Rendered from the same spot the user is standing on, so the saved
      // image is the view they were just turning around in.
      const { pixels, width, height } = renderPanorama(gl, scene, eye, size);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      // Via the context's own ImageData rather than the constructor: it is
      // the one that always agrees with this canvas about buffer types.
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const image = ctx.createImageData(width, height);
        image.data.set(flipRows(pixels, width, height));
        ctx.putImageData(image, 0, 0);
      }
      onCaptured(canvas);
      invalidate();
    };
    window.addEventListener('andoza:capture-360', handler);
    return () => window.removeEventListener('andoza:capture-360', handler);
  }, [active, gl, scene, eye, onCaptured, invalidate]);

  return null;
}

/** What the capture button asks for. Declared here so the page need not know
 *  anything about renderers. */
export function request360Capture() {
  window.dispatchEvent(new Event('andoza:capture-360'));
}

export { PANO_WIDTH, PANO_HEIGHT };
