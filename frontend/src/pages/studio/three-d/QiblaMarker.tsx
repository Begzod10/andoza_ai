import { useMemo } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { qiblaBearing, bearingToScene, compassPoint } from "@/lib/qibla";
import { uz } from "@/locale/uz";
import { useRoomStore } from "@/store/roomStore";

/**
 * A flat arrow on the floor pointing toward the Qibla, with its bearing beside
 * it. Drawn from the room's centre out toward the wall it points at, stopping
 * short of that wall.
 *
 * Reference only — like the scan overlay it never takes a pick, so it can lie
 * under furniture and drags without getting in their way.
 */
const noRaycast = () => null;

export function QiblaMarker({ W, D, visible }: { W: number; D: number; visible: boolean }) {
  const location = useRoomStore((st) => st.designState.location);
  const bearing = useMemo(
    () => qiblaBearing(location?.latitude, location?.longitude),
    [location?.latitude, location?.longitude],
  );
  const [dx, dz] = useMemo(() => bearingToScene(bearing), [bearing]);

  // How far the ray from the centre travels before it meets the room's edge.
  const edge = Math.min(
    Math.abs(dx) < 1e-6 ? Infinity : W / 2 / Math.abs(dx),
    Math.abs(dz) < 1e-6 ? Infinity : D / 2 / Math.abs(dz),
  );
  const len = Math.max(0.5, Math.min(edge - 0.35, 1.6));

  // Shaft and head as one outline in the XY plane, tip at +X, then laid flat.
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    const shaftW = 0.05, headW = 0.16, headL = 0.3;
    s.moveTo(0, -shaftW);
    s.lineTo(len - headL, -shaftW);
    s.lineTo(len - headL, -headW);
    s.lineTo(len, 0);
    s.lineTo(len - headL, headW);
    s.lineTo(len - headL, shaftW);
    s.lineTo(0, shaftW);
    s.closePath();
    return s;
  }, [len]);

  if (!visible) return null;
  return (
    <group rotation={[0, Math.atan2(-dz, dx), 0]} position={[0, 0.03, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={5}>
        <shapeGeometry args={[shape]} />
        <meshBasicMaterial color="#0f9d58" transparent opacity={0.85} depthTest={false} side={THREE.DoubleSide} />
      </mesh>
      <Html position={[len + 0.2, 0, 0]} center zIndexRange={[40, 0]} style={{ pointerEvents: "none" }}>
        <div className="px-2 py-1 rounded-full bg-emerald-600 text-white text-[11px] font-semibold shadow whitespace-nowrap">
          {uz.studio.qibla.nomi} · {Math.round(bearing)}° {compassPoint(bearing)}
        </div>
      </Html>
    </group>
  );
}
