import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  PANO_EYE_HEIGHT, PANO_WIDTH, PANO_HEIGHT,
  panoramaSizeFor, renderPanorama, flipRows,
} from "@/lib/panorama360";

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
 */

/** How far a drag turns the view. Tuned so a full turn is a comfortable
 *  sweep of a phone screen rather than three of them. */
const LOOK_SPEED = 0.0042;

/** Looking straight up or down flips the horizon over; stop just short. */
const PITCH_LIMIT = Math.PI / 2 - 0.02;

export function Panorama360({ active, onCaptured }: {
  active: boolean;
  /** Fired with the finished equirectangular image, 4000 x 2000 unless the
   *  GPU would not grant it. */
  onCaptured?: (canvas: HTMLCanvasElement) => void;
}) {
  const { camera, gl, scene, invalidate } = useThree();
  const look = useRef({ yaw: 0, pitch: 0 });
  const dragging = useRef<{ x: number; y: number } | null>(null);
  const restore = useRef<{ position: THREE.Vector3; quaternion: THREE.Quaternion } | null>(null);

  // Take the camera to the middle of the room on the way in, and put it back
  // exactly where it was on the way out — leaving the user's view of the room
  // where they left it.
  useEffect(() => {
    if (!active) return;
    restore.current = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
    };
    // The room is modelled centred on the origin, so its middle IS the origin.
    camera.position.set(0, PANO_EYE_HEIGHT, 0);
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
  }, [active, camera, invalidate]);

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
    camera.position.set(0, PANO_EYE_HEIGHT, 0);
    camera.rotation.set(look.current.pitch, look.current.yaw, 0, 'YXZ');
  });

  // The capture is driven from outside: the button lives in the page's chrome,
  // and this is the only place with the renderer and the scene.
  useEffect(() => {
    if (!active || !onCaptured) return;
    const handler = () => {
      const max = gl.capabilities.maxTextureSize;
      const size = panoramaSizeFor(max);
      const { pixels, width, height } = renderPanorama(
        gl, scene, new THREE.Vector3(0, PANO_EYE_HEIGHT, 0), size,
      );
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
  }, [active, gl, scene, onCaptured, invalidate]);

  return null;
}

/** What the capture button asks for. Declared here so the page need not know
 *  anything about renderers. */
export function request360Capture() {
  window.dispatchEvent(new Event('andoza:capture-360'));
}

export { PANO_WIDTH, PANO_HEIGHT };
