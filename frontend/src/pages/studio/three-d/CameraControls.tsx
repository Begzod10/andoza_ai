import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { repinnedTarget } from "@/lib/lookAround";

/**
 * Camera/orbit-control helpers: double-click-to-focus, the auto-clear
 * workaround the postprocessing composer requires, a dev-only scene handle,
 * and the preset camera animator. Split out of ThreeDPage.tsx — see that
 * file's header comment for the full picture.
 */

// Double-click navigation: focus the orbit pivot on whatever was clicked;
// double-clicking empty space recenters on the room.
export function DoubleClickFocus({
  controlsRef,
  onEmpty,
}: {
  controlsRef: RefObject<OrbitControlsImpl | null>;
  onEmpty: () => void;
}) {
  const { gl, camera, scene } = useThree();
  const rc = useMemo(() => new THREE.Raycaster(), []);
  const goal = useRef<THREE.Vector3 | null>(null);
  const onEmptyRef = useRef(onEmpty);
  onEmptyRef.current = onEmpty;

  useEffect(() => {
    const el = gl.domElement;
    const onDbl = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      );
      rc.setFromCamera(ndc, camera);
      const hit = rc.intersectObjects(scene.children, true).find((h) => {
        const mesh = h.object as THREE.Mesh;
        if (!mesh.isMesh || !mesh.visible) return false;
        const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        // skip invisible hit-helpers (transparent opacity-0 planes)
        return !(m && m.transparent && m.opacity < 0.05);
      });
      if (hit) goal.current = hit.point.clone();
      else onEmptyRef.current();
    };
    el.addEventListener('dblclick', onDbl);
    return () => el.removeEventListener('dblclick', onDbl);
  }, [gl, camera, scene, rc]);

  useFrame(() => {
    const c = controlsRef.current;
    if (!c || !goal.current) return;
    c.target.lerp(goal.current, 0.18);
    if (c.target.distanceTo(goal.current) < 0.01) goal.current = null;
    c.update();
  });

  return null;
}


// Every frame, before anything else draws.
//
// postprocessing's EffectComposer turns the renderer's auto-clear OFF the
// moment it attaches — permanently, by design, and it never puts it back.
// Anything that then renders into its own target draws on top of whatever was
// there last frame instead of a clean buffer. drei's ContactShadows is exactly
// that: it re-renders the room into a shadow texture every frame, so with
// auto-clear off each frame's silhouette is stacked on the previous ones and
// furniture leaves its old shadow smeared across the floor after being moved.
// The same stale-buffer problem hits the main view once the composer unmounts
// (a PerformanceMonitor decline does that) and r3f goes back to drawing
// directly.
//
// Restoring the flag is safe for the composer itself: @react-three/postprocessing
// sets auto-clear explicitly around its own pass and restores it afterwards,
// so it never reads the value we put back.
//
// Priority is negative so this runs ahead of every default-priority useFrame —
// ContactShadows' included. r3f only treats priority > 0 as "takes over
// rendering", so a negative one just orders the callback first.
export function KeepAutoClear() {
  const gl = useThree((s) => s.gl);
  useFrame(() => {
    if (!gl.autoClear) gl.autoClear = true;
  }, -1);
  return null;
}


// Dev-only: expose the live scene graph for debugging / smoke checks
export function DevSceneHandle() {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__scene = scene;
    }
  }, [scene]);
  return null;
}


// ─── Camera animator (lerp, no Canvas remount) ────────────────────────────────

export function CameraAnimator({
  target,
  position,
  controlsRef,
  version,
}: {
  target: [number, number, number];
  position: [number, number, number];
  controlsRef: RefObject<OrbitControlsImpl | null>;
  version: number;
}) {
  const { camera } = useThree();
  const targetPos = useMemo(() => new THREE.Vector3(...position), [position]);
  const targetLookAt = useMemo(() => new THREE.Vector3(...target), [target]);

  // Only animate when preset changes — stop once arrived or user starts dragging
  const isAnimating = useRef(false);
  const userDragging = useRef(false);

  // Trigger animation when target changes OR when version bumps (same preset re-clicked)
  useEffect(() => {
    isAnimating.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetPos, targetLookAt, version]);

  // Latest look-at destination for the drag-interrupt handler (the effect
  // below subscribes once, so it must not close over a stale vector)
  const lookAtRef = useRef(targetLookAt);
  useEffect(() => { lookAtRef.current = targetLookAt }, [targetLookAt]);

  // Pause animation while user drags
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const onStart = () => {
      // Grabbing the view mid-animation used to freeze the orbit target at a
      // mid-lerp point — rotation then pivoted around nowhere. Snap the pivot
      // to its destination (the room centre) before handing over control.
      if (isAnimating.current) {
        controls.target.copy(lookAtRef.current);
      }
      userDragging.current = true;
      isAnimating.current = false;
    };
    const onEnd = () => { userDragging.current = false; };
    controls.addEventListener("start", onStart);
    controls.addEventListener("end", onEnd);
    return () => {
      controls.removeEventListener("start", onStart);
      controls.removeEventListener("end", onEnd);
    };
  }, [controlsRef]);

  useFrame(() => {
    if (!isAnimating.current || userDragging.current) return;
    camera.position.lerp(targetPos, 0.1);
    if (controlsRef.current) {
      controlsRef.current.target.lerp(targetLookAt, 0.1);
      controlsRef.current.update();
    }
    // Stop when close enough
    if (camera.position.distanceTo(targetPos) < 0.015) {
      camera.position.copy(targetPos);
      if (controlsRef.current) {
        controlsRef.current.target.copy(targetLookAt);
        controlsRef.current.update();
      }
      isAnimating.current = false;
    }
  });

  return null;
}

/**
 * Turns the one-finger drag from an orbit into a look-around: the camera holds
 * its place in the room and the pivot swings around IT, the way turning your
 * head works. OrbitControls does the opposite — the camera flies round the
 * pivot — which from inside a room means the walls slide past while the user
 * expects to be standing still.
 *
 * It rides on top of OrbitControls rather than replacing it, because
 * everything else about it is wanted: the damping, the polar limits, the pinch
 * zoom, the two- and three-finger pans.
 *
 * The trick is that an orbit and a look-around differ only in which end of the
 * offset is pinned. After each of OrbitControls' updates the view direction is
 * already the new one; putting the camera back where the gesture started and
 * moving the target to `camera + direction * distance` re-pins it to the
 * camera end. The offset keeps its length and direction, so the controls'
 * own spherical state — and its min/max distance — stay consistent, and the
 * next update recomputes the same position rather than fighting this.
 */
export function LookAroundRotate({ controlsRef }: {
  controlsRef: RefObject<OrbitControlsImpl | null>;
}) {
  const { camera, gl } = useThree();

  useEffect(() => {
    const el = gl.domElement;
    let raf = 0;
    let detach: (() => void) | undefined;

    // This renders above <OrbitControls>, so on the very first pass the ref
    // may not be filled yet; wait a frame rather than silently doing nothing.
    const attach = () => {
      const controls = controlsRef.current;
      if (!controls) { raf = requestAnimationFrame(attach); return; }
      detach = bind(controls);
    };

    function bind(controls: OrbitControlsImpl) {

      const anchor = new THREE.Vector3();
      /** Distance from the camera to the pivot when the gesture began — kept, so
       *  a look-around does not also dolly. */
      let dist = 0;
      /** Whether the movement in flight is a one-finger turn. */
      let active = false;
      let correcting = false;
      let settle = 0;
      const down = new Set<number>();

      const stop = () => { active = false; window.clearTimeout(settle); };

      const onDown = (e: PointerEvent) => {
        down.add(e.pointerId);
        // A second finger means a pinch or a pan, which SHOULD move the camera.
        if (down.size !== 1 || (e.pointerType === 'mouse' && e.button !== 0)) { stop(); return; }
        anchor.copy(camera.position);
        dist = camera.position.distanceTo(controls.target);
        active = true;
      };

      const onUp = (e: PointerEvent) => {
        down.delete(e.pointerId);
        if (down.size > 0 || !active) return;
        // Damping keeps the turn running after the finger leaves; without this
        // the tail of it would orbit again and undo the illusion.
        window.clearTimeout(settle);
        settle = window.setTimeout(() => { active = false; }, 1200);
      };

      const onChange = () => {
        if (!active || correcting) return;
        const repinned = repinnedTarget(anchor, camera.position, controls.target, dist);
        if (!repinned) return;
        correcting = true;
        camera.position.copy(anchor);
        controls.target.set(repinned.x, repinned.y, repinned.z);
        correcting = false;
      };

      el.addEventListener('pointerdown', onDown);
      // A wheel zoom during the damping tail must move the camera, not be
      // snapped back to where the turn started.
      el.addEventListener('wheel', stop, { passive: true });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      controls.addEventListener('change', onChange);
      return () => {
        window.clearTimeout(settle);
        el.removeEventListener('pointerdown', onDown);
        el.removeEventListener('wheel', stop);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        controls.removeEventListener('change', onChange);
      };
    }

    attach();
    return () => { cancelAnimationFrame(raf); detach?.(); };
  }, [camera, gl, controlsRef]);

  return null;
}
