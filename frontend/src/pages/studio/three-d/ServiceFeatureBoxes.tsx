import { useMemo } from "react";
import { Html } from "@react-three/drei";
import { riserBoxes, type ServiceFeature } from "@/lib/serviceFeatures";

interface Props {
  features: readonly ServiceFeature[] | null | undefined;
  verticesMm: readonly (readonly [number, number])[] | null | undefined;
  visible?: boolean;
}

/** Pipe risers found in the LiDAR scan, drawn as plain boxes. */
export function ServiceFeatureBoxes({ features, verticesMm, visible = true }: Props) {
  const boxes = useMemo(() => riserBoxes(features, verticesMm), [features, verticesMm]);
  if (!visible || boxes.length === 0) return null;
  return (
    <group>
      {boxes.map((b, i) => (
        <group key={i} position={[b.x, b.height / 2, b.z]} rotation={[0, b.rotationY, 0]}>
          <mesh>
            <boxGeometry args={[b.width, b.height, b.depth]} />
            <meshStandardMaterial color="#d9d4ca" roughness={0.9} transparent opacity={b.confidence === "high" ? 1 : 0.7} />
          </mesh>
          <Html position={[0, b.height / 2 + 0.1, 0]} center distanceFactor={6} style={{ pointerEvents: "none" }}>
            <span style={{ fontSize: 11, background: "rgba(0,0,0,.6)", color: "#fff", padding: "1px 6px", borderRadius: 6, whiteSpace: "nowrap" }}>
              Quvur qutisi
            </span>
          </Html>
        </group>
      ))}
    </group>
  );
}
