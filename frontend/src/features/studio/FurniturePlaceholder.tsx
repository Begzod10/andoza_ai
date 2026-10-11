import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

/** What a piece is drawn as while its model is still loading, in metres. */
export interface PlaceholderSize { w: number; d: number; h: number }

const DEFAULT_SIDE = 0.6;
const APPEAR_S = 0.22;

/** Pieces that were drawn as a placeholder: only they grow in when the model arrives. */
const waited = new Set<string>();

/** Record that a piece was drawn as a placeholder (the placeholder does this when it mounts). */
export function markWaited(itemId: string): void {
  waited.add(itemId);
}

/**
 * How big a just-loaded model is drawn this frame, from 0.85 up to 1 over a
 * fifth of a second; null once it has finished, or when the piece never
 * waited (a reload of the room must not make every piece bounce).
 */
export function appearScale(itemId: string, startedAt: number, now: number): number | null {
  if (!waited.has(itemId)) return null;
  const t = Math.min(1, (now - startedAt) / APPEAR_S);
  if (t >= 1) {
    waited.delete(itemId);
    return 1;
  }
  return 0.85 + 0.15 * (1 - Math.pow(1 - t, 3));
}
const ACCENT = "#5B84F5";

/**
 * The size to draw for a piece whose model has not arrived: its catalogue
 * footprint and height, or a modest cube where the catalogue does not say.
 */
export function placeholderSize(w: number | undefined, d: number | undefined, h: number | undefined): PlaceholderSize {
  const ok = (v: number | undefined) => (typeof v === "number" && isFinite(v) && v > 0.05 ? v : DEFAULT_SIDE);
  return { w: ok(w), d: ok(d), h: ok(h) };
}

/**
 * Stands in for a piece of furniture while its GLB downloads: a see-through
 * box of the piece's real size with a softly pulsing outline, on the spot and
 * at the angle the piece will have. The model replaces it the moment it has
 * loaded. It can be dragged like the model, so placing a piece does not have
 * to wait for the file.
 */
export function FurniturePlaceholder({
  itemId, x, z, rotation, size, isDragging, dragPosRef, onPointerDown,
}: {
  itemId: string;
  x: number;
  z: number;
  rotation: number;
  size: PlaceholderSize;
  isDragging: boolean;
  dragPosRef: RefObject<THREE.Vector3>;
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const fillRef = useRef<THREE.MeshBasicMaterial>(null);
  const lineRef = useRef<THREE.LineBasicMaterial>(null);
  const edges = useMemo(() => {
    const box = new THREE.BoxGeometry(size.w, size.h, size.d);
    const lines = new THREE.EdgesGeometry(box);
    box.dispose();
    return lines;
  }, [size.w, size.h, size.d]);
  useEffect(() => () => edges.dispose(), [edges]);
  useEffect(() => markWaited(itemId), [itemId]);

  useFrame(({ clock, invalidate }) => {
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 4);
    if (fillRef.current) fillRef.current.opacity = 0.06 + 0.1 * pulse;
    if (lineRef.current) lineRef.current.opacity = 0.45 + 0.5 * pulse;
    if (isDragging && groupRef.current && dragPosRef.current) {
      groupRef.current.position.x = dragPosRef.current.x;
      groupRef.current.position.z = dragPosRef.current.z;
    }
    // On a scene that renders on demand the pulse would stop after one frame.
    invalidate();
  });

  return (
    <group ref={groupRef} position={[x, 0, z]} rotation={[0, rotation, 0]}>
      <mesh position={[0, size.h / 2, 0]} onPointerDown={onPointerDown}>
        <boxGeometry args={[size.w, size.h, size.d]} />
        <meshBasicMaterial ref={fillRef} color={ACCENT} transparent opacity={0.1} depthWrite={false} />
      </mesh>
      <lineSegments geometry={edges} position={[0, size.h / 2, 0]}>
        <lineBasicMaterial ref={lineRef} color={ACCENT} transparent opacity={0.8} />
      </lineSegments>
    </group>
  );
}
