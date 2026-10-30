import { useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { Part } from "@/features/mebel/engine";

export const COLORS = { board: "#d9c3a0", back: "#f2efe9", facade: "#b9a07a", selected: "#3b82f6" } as const;

export interface MeshSpec {
  id: string
  /** metres */
  position: [number, number, number]
  size: [number, number, number]
  color: string
}

/**
 * The engine's parts as boxes, mm → m. The 3D view draws exactly what the cut
 * list lists: it never works a size out for itself. `center` moves the row so
 * it stands around the origin, where the camera looks.
 */
export function meshSpecs(
  parts: Part[],
  selectedPartId: string | null,
  /** `wallLift`: how high (mm) a cabinet hangs — a wall cabinet above the worktop. */
  opts: { center?: boolean; wallLift?: (cabinetId: string) => number } = {},
): MeshSpec[] {
  const lift = opts.wallLift ?? (() => 0);
  let cx = 0;
  let cz = 0;
  if (opts.center && parts.length > 0) {
    const xs = parts.flatMap((p) => [p.placement.x - p.placement.sx / 2, p.placement.x + p.placement.sx / 2]);
    const zs = parts.flatMap((p) => [p.placement.z - p.placement.sz / 2, p.placement.z + p.placement.sz / 2]);
    cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  }
  return parts.map((p) => ({
    id: p.id,
    position: [(p.placement.x - cx) / 1000, (p.placement.y + lift(p.cabinetId)) / 1000, (p.placement.z - cz) / 1000],
    size: [p.placement.sx / 1000, p.placement.sy / 1000, p.placement.sz / 1000],
    color: p.id === selectedPartId ? COLORS.selected : COLORS[p.material],
  }));
}

/**
 * Where the camera stands to see every box: it looks at the middle of the
 * whole set (tall and wall cabinets included) from the front-right, far
 * enough back for both the width and the height to fit the view.
 */
export function fitCamera(specs: MeshSpec[], fovDeg: number, aspect: number) {
  if (specs.length === 0) return { position: [1.2, 1.2, 2.4] as [number, number, number], target: [0, 0.36, 0] as [number, number, number] };
  const lo = [0, 1, 2].map((i) => Math.min(...specs.map((s) => s.position[i] - s.size[i] / 2)));
  const hi = [0, 1, 2].map((i) => Math.max(...specs.map((s) => s.position[i] + s.size[i] / 2)));
  const target: [number, number, number] = [(lo[0] + hi[0]) / 2, (Math.min(lo[1], 0) + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const halfW = (hi[0] - lo[0]) / 2 + (hi[2] - lo[2]) / 2;
  const halfH = (hi[1] - Math.min(lo[1], 0)) / 2;
  const vt = Math.tan((fovDeg * Math.PI) / 360);
  const dist = 1.15 * Math.max(halfH / vt, halfW / (vt * aspect), 1);
  // front-right and a little above
  const dir = [0.45, 0.3, 1];
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  const position: [number, number, number] = [0, 1, 2].map((i) => target[i] + (dir[i] / len) * dist) as [number, number, number];
  return { position, target };
}

/** Re-frames the view when the set of boxes changes size (a cabinet added, the AI's proposal applied). */
function FitView({ specs }: { specs: MeshSpec[] }) {
  const { camera, size, controls } = useThree();
  const fit = fitCamera(specs, 40, size.width / Math.max(1, size.height));
  const key = [...fit.position, ...fit.target].map((v) => v.toFixed(2)).join(",");
  useEffect(() => {
    camera.position.set(...fit.position);
    const orbit = controls as unknown as { target?: { set(x: number, y: number, z: number): void }; update?(): void } | null;
    orbit?.target?.set(...fit.target);
    orbit?.update?.();
    camera.lookAt(...fit.target);
    // only when the frame itself moves, not on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, controls]);
  return null;
}

/** The cabinets in 3D; clicking a part selects it, as clicking its cut-list row does. */
export function CabinetView({
  parts, selectedPartId, onSelect, wallLift,
}: { parts: Part[]; selectedPartId: string | null; onSelect(id: string): void; wallLift?: (cabinetId: string) => number }) {
  const specs = meshSpecs(parts, selectedPartId, { center: true, wallLift });
  return (
    <Canvas camera={{ position: [1.2, 1.2, 2.4], fov: 40 }} dpr={[1, 2]} gl={{ preserveDrawingBuffer: true }}>
      <FitView specs={specs} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[2, 4, 3]} intensity={0.9} />
      {specs.map((s) => (
        <mesh
          key={s.id}
          position={s.position}
          onClick={(e) => { e.stopPropagation(); onSelect(s.id); }}
        >
          <boxGeometry args={s.size} />
          <meshStandardMaterial color={s.color} />
        </mesh>
      ))}
      <gridHelper args={[6, 12, "#d4d4d4", "#e5e5e5"]} />
      <OrbitControls makeDefault />
    </Canvas>
  );
}
