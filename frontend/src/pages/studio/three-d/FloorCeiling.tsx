import { memo, useEffect, useMemo, useState, type MutableRefObject } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  ceilingDesign, resolveCeilingSettings, buildCeilingParts,
  type CeilingDesignId, type CeilingSettings, type CeilingPart,
} from "@/lib/ceilingDesigns";
import { kelvinToHex } from "@/lib/lightCatalog";
import { FLOOR_COLORS, UNCONFIGURED_FLOOR_COLOR, noRaycast } from "./constants";

/**
 * Floor and ceiling rendering for the legacy ABCD room shell. Split out of
 * ThreeDPage.tsx — see that file's header comment for the full picture.
 */

export const WoodFloor = memo(function WoodFloor({
  width, depth, floorType, floorTexture, floorTextureSettings, floorConfigured = true, isSelected, onClick,
}: {
  width: number; depth: number; floorType: string;
  floorTexture?: string | null;
  floorTextureSettings?: { repeatX: number; repeatY: number; offsetX: number; offsetY: number; rotation: number } | null;
  /** False for a room that hasn't visited Pol yet — renders a flat neutral
   *  screed instead of defaulting to a full parquet/tile pattern no one chose. */
  floorConfigured?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
}) {
  const { invalidate } = useThree();
  const floorColor = FLOOR_COLORS[floorType] ?? FLOOR_COLORS.parquet;

  // Custom texture from user upload — loaded async
  const [customTex, setCustomTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!floorTexture) { setCustomTex(null); return; }
    let disposed = false;
    new THREE.TextureLoader().load(floorTexture, (tex) => {
      if (disposed) { tex.dispose(); return; }
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.center.set(0.5, 0.5);
      setCustomTex(tex);
      invalidate();
    });
    return () => { disposed = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floorTexture]);

  // Apply UV settings whenever they or room dimensions change
  useEffect(() => {
    if (!customTex) return;
    const rx = floorTextureSettings?.repeatX ?? 1;
    const ry = floorTextureSettings?.repeatY ?? 1;
    customTex.repeat.set(width * rx, depth * ry);
    customTex.offset.set(floorTextureSettings?.offsetX ?? 0, floorTextureSettings?.offsetY ?? 0);
    customTex.rotation = floorTextureSettings?.rotation ?? 0;
    customTex.needsUpdate = true;
    invalidate();
  }, [customTex, width, depth, floorTextureSettings, invalidate]);

  const texture = useMemo<THREE.CanvasTexture>(() => {
    const canvas = document.createElement("canvas");
    const W = 1024; // Doubled from 512 to reduce repeat count and visible tiling artifacts
    canvas.width = W;
    canvas.height = W;
    const ctx = canvas.getContext("2d")!;

    // Each canvas represents a real-world unit size.
    // tex.repeat ensures one canvas = that physical size in metres.
    let repeatX: number;
    let repeatY: number;

    if (floorType === "tile") {
      // Canvas = one 600×600mm porcelain tile
      const tileM = 0.6;
      const grout = 7; // px ≈ 8mm grout joint
      ctx.fillStyle = "#C4C3BB";
      ctx.fillRect(0, 0, W, W);
      ctx.fillStyle = floorColor;
      ctx.fillRect(grout, grout, W - 2 * grout, W - 2 * grout);
      ctx.fillStyle = "rgba(0,0,0,0.025)";
      ctx.fillRect(grout, grout, (W - 2 * grout) * 0.5, (W - 2 * grout) * 0.5);
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(grout + (W - 2 * grout) * 0.5, grout, (W - 2 * grout) * 0.5, (W - 2 * grout) * 0.5);
      repeatX = width / tileM;
      repeatY = depth / tileM;

    } else if (floorType === "parquet") {
      // Canvas = 600×600mm section, 8 planks of 75mm each (run along Y axis)
      const unitM = 0.6;
      const plankW = W / 8; // 64px ≈ 75mm
      ctx.fillStyle = floorColor;
      ctx.fillRect(0, 0, W, W);
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 === 0 ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.03)";
        ctx.fillRect(i * plankW, 0, plankW, W);
        ctx.strokeStyle = "rgba(0,0,0,0.18)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(i * plankW, 0); ctx.lineTo(i * plankW, W); ctx.stroke();
        ctx.strokeStyle = "rgba(0,0,0,0.05)";
        ctx.lineWidth = 0.5;
        for (let g = 1; g < 7; g++) {
          const gy = (W / 7) * g;
          ctx.beginPath();
          ctx.moveTo(i * plankW, gy + Math.sin(i * 1.7 + g) * 4);
          ctx.quadraticCurveTo(i * plankW + plankW * 0.5, gy + Math.cos(g) * 2, (i + 1) * plankW, gy + Math.sin(i + g) * 3);
          ctx.stroke();
        }
        if (i % 2 === 0) {
          ctx.strokeStyle = "rgba(0,0,0,0.13)";
          ctx.lineWidth = 1;
          const lineOffset = Math.sin(i * 1.8) * 30; // Increased variation (±30px) to break repeating pattern more visibly
          const lineY = W / 2 + lineOffset;
          ctx.beginPath(); ctx.moveTo(i * plankW + 2, lineY); ctx.lineTo((i + 1) * plankW - 2, lineY); ctx.stroke();
        }
      }
      repeatX = width / unitM;
      repeatY = depth / unitM;

    } else if (floorType === "laminate") {
      // Canvas = 1200×1200mm section, 6 planks of 200mm each (run along Y axis)
      const unitM = 1.2;
      const plankW = W / 6; // ≈ 85px = 200mm
      ctx.fillStyle = floorColor;
      ctx.fillRect(0, 0, W, W);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 === 0 ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)";
        ctx.fillRect(i * plankW, 0, plankW, W);
        ctx.strokeStyle = "rgba(0,0,0,0.15)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(i * plankW, 0); ctx.lineTo(i * plankW, W); ctx.stroke();
        ctx.strokeStyle = "rgba(0,0,0,0.04)";
        ctx.lineWidth = 0.5;
        for (let g = 1; g < 9; g++) {
          const gy = (W / 9) * g;
          ctx.beginPath();
          ctx.moveTo(i * plankW, gy + Math.sin(i * 2.3 + g) * 3);
          ctx.lineTo((i + 1) * plankW, gy + Math.cos(i + g * 0.7) * 3);
          ctx.stroke();
        }
        ctx.strokeStyle = "rgba(0,0,0,0.12)";
        ctx.lineWidth = 1;
        const lineOffset = Math.sin(i * 2.1) * 25; // Increased variation (±25px) to break repeating pattern more visibly
        const lineY = W / 2 + lineOffset;
        ctx.beginPath(); ctx.moveTo(i * plankW + 2, lineY); ctx.lineTo((i + 1) * plankW - 2, lineY); ctx.stroke();
      }
      repeatX = width / unitM;
      repeatY = depth / unitM;

    } else {
      // Concrete — canvas = 1×1m section with deterministic aggregate texture
      const unitM = 1.0;
      ctx.fillStyle = floorColor;
      ctx.fillRect(0, 0, W, W);
      for (let row = 0; row < W; row += 8) {
        for (let col = 0; col < W; col += 8) {
          const v = ((col * 127 + row * 31 + col * row) % 100) / 100;
          ctx.fillStyle = `rgba(0,0,0,${(v * 0.06).toFixed(3)})`;
          ctx.fillRect(col, row, 8, 8);
        }
      }
      repeatX = width / unitM;
      repeatY = depth / unitM;
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    return tex;
  }, [width, depth, floorType, floorColor]);

  // Release GPU memory when texture is replaced or component unmounts
  useEffect(() => () => { texture.dispose() }, [texture]);

  const activeTex = customTex ?? texture;

  return (
    <group onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} castShadow receiveShadow>
        <planeGeometry args={[width + 0.04, depth + 0.04]} />
        {floorConfigured ? (
          <meshStandardMaterial map={activeTex} roughness={0.55} metalness={0.05} envMapIntensity={0.4} />
        ) : (
          <meshStandardMaterial color={UNCONFIGURED_FLOOR_COLOR} roughness={0.85} metalness={0} envMapIntensity={0.25} />
        )}
      </mesh>
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} renderOrder={1}>
          <planeGeometry args={[width + 0.04, depth + 0.04]} />
          <meshBasicMaterial color="#1E40AF" opacity={0.18} transparent depthWrite={false} />
        </mesh>
      )}
    </group>
  );
});


// ─── Ceiling designs ──────────────────────────────────────────────────────────

/**
 * The room's ceiling: the structural slab, plus whatever profile is built
 * below it.
 *
 * The slab plane is always there and always casts — see the note at
 * `ceilingHidden` in RoomScene for why hiding it is done at the material and
 * not with `visible` or a layer. The profile hangs beneath it, so it is only
 * worth building when the ceiling is being looked at; the slab blocks the sun
 * either way, which is the one part that must not depend on the view.
 */
export const Ceiling = memo(function Ceiling({
  W, D, H, T, designId, settings, hidden, meshRef,
}: {
  W: number; D: number; H: number; T: number
  designId: CeilingDesignId
  settings?: Partial<CeilingSettings>
  hidden: boolean
  meshRef: MutableRefObject<THREE.Mesh | null>
}) {
  const design = ceilingDesign(designId)
  const resolved = useMemo(() => resolveCeilingSettings(design, settings), [design, settings])
  const parts = useMemo(
    () => buildCeilingParts(design, resolved, W, D, H),
    [design, resolved, W, D, H],
  )

  return (
    <group>
      <mesh ref={meshRef} position={[0, H, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <planeGeometry args={[W + 2 * T, D + 2 * T]} />
        <meshStandardMaterial
          color={resolved.color}
          roughness={0.95}
          side={THREE.FrontSide}
          colorWrite={!hidden}
          depthWrite={!hidden}
        />
      </mesh>
      {!hidden && parts.length > 0 && (
        <CeilingProfile parts={parts} color={resolved.color} stripK={resolved.stripK} />
      )}
    </group>
  )
});


/**
 * The dropped boxes and the hidden LED.
 *
 * Strips are drawn unlit and untone-mapped so they read as the source rather
 * than as a pale surface that happens to be bright: a cove LED is the one thing
 * in the room that should not respond to the room's own lighting.
 */
function CeilingProfile({
  parts, color, stripK,
}: {
  parts: CeilingPart[]
  color: string
  stripK: number
}) {
  const stripColor = kelvinToHex(stripK)
  return (
    <group>
      {parts.map((part, i) => (
        <mesh
          key={i}
          position={part.position}
          castShadow={part.kind === 'panel'}
          receiveShadow={part.kind === 'panel'}
          raycast={noRaycast}
        >
          <boxGeometry args={part.size} />
          {part.kind === 'strip' ? (
            <meshBasicMaterial color={stripColor} toneMapped={false} />
          ) : (
            <meshStandardMaterial color={color} roughness={0.92} metalness={0} />
          )}
        </mesh>
      ))}
    </group>
  )
}
