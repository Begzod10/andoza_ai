import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { Part } from "@/features/mebel/engine";

export const COLORS = { board: "#d9c3a0", back: "#f2efe9", selected: "#3b82f6" } as const;

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
export function meshSpecs(parts: Part[], selectedPartId: string | null, opts: { center?: boolean } = {}): MeshSpec[] {
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
    position: [(p.placement.x - cx) / 1000, p.placement.y / 1000, (p.placement.z - cz) / 1000],
    size: [p.placement.sx / 1000, p.placement.sy / 1000, p.placement.sz / 1000],
    color: p.id === selectedPartId ? COLORS.selected : p.material === "back" ? COLORS.back : COLORS.board,
  }));
}

/** The cabinets in 3D; clicking a part selects it, as clicking its cut-list row does. */
export function CabinetView({
  parts, selectedPartId, onSelect,
}: { parts: Part[]; selectedPartId: string | null; onSelect(id: string): void }) {
  const specs = meshSpecs(parts, selectedPartId, { center: true });
  const span = Math.max(1, ...specs.map((s) => Math.abs(s.position[0]) + s.size[0] / 2));
  return (
    <Canvas camera={{ position: [span * 1.2, 1.2, span * 1.6 + 0.8], fov: 40 }} dpr={[1, 2]}>
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
      <OrbitControls target={[0, 0.36, 0]} makeDefault />
    </Canvas>
  );
}
