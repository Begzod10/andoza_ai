import { Suspense, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  OrbitControls,
  ContactShadows,
  PerformanceMonitor,
  AdaptiveDpr,
  AdaptiveEvents,
  Html,
  useGLTF,
  Grid,
  RoundedBox,
  GizmoHelper,
  GizmoViewport,
} from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useOutletContext, useNavigate, useLocation } from "react-router-dom";
import { useRoomStore, resolveWallCovering, resolveWallPanel, PLASTER_BASE_COLOR } from "@/store/roomStore";
import type { PlacedFurniture, UserFurnitureEntry, PlacedLight, PlacedElectrical, WallPanelSettings } from "@/store/roomStore";
import { clonePlasterMapsFor, PLASTER_NORMAL_SCALE } from "@/lib/plasterMaterial";
import { DesignPanel } from "@/components/studio/DesignPanel";
import { AddObjectSheet } from "@/components/studio/AddObjectSheet";
import SurfaceRadialMenu, { RadialIcons, type RadialSurface, type RadialItem } from "@/components/studio/SurfaceRadialMenu";
import { WallOpenings, type OpeningSel } from "@/components/studio/WallOpenings";
import { AiBuilderSheet } from "@/components/studio/AiBuilderSheet";
import RoomSettingsSheet from "@/components/studio/RoomSettingsSheet";
import { ModelImportButton } from "@/components/studio/ModelImportButton";
import { useModelImport } from "@/hooks/useModelImport";
import { useFileDrop, MODEL_FILE_RE } from "@/hooks/useFileDrop";
import { DoorLeaves, WindowSashes, type DoorToolMode } from "@/components/studio/DoorLeaves";
import type { RoomGeometry, DesignState, WallCovering, WallElement } from "@/store/roomStore";
import { createOboyTexture } from "@/lib/oboyPatterns";
import type { OboyPatternId } from "@/lib/oboyPatterns";
import { resolveElementPositions } from "@/lib/wallPositions";
import { FURNITURE_CATALOG } from "@/lib/furnitureCatalog";
import { getRooms, deleteRoom } from "@/lib/api";
import type { Room } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  WallFade, WallTopRim, CornerPosts, FloorSlab,
  useHiddenWalls, type CutawayMode,
} from "@/features/studio/diorama";
import { MebelPlanView } from "@/features/studio/MebelPlanView";
import { ReleaseGLOnUnmount, CanvasErrorBoundary } from "@/features/studio/glcleanup";
import {
  partKeyFor, resolvePartKey, resolvePartFromMesh, partLabel,
  applyHiddenParts, hasMeshesOutsidePart, setPartHighlight, exportPartToGlb,
} from "@/lib/modelParts";
import { saveModelToDb, arrayBufferToBlobUrl } from "@/lib/modelDb";
import { nanoid } from "nanoid";
import * as THREE from "three";
import { EffectComposer, N8AO, SMAA } from "@react-three/postprocessing";
import { roomExtents } from "@/lib/roomDims";
import { toDiffuseOnly } from "@/lib/modelMaterials";
import { fitShadowFrustum } from "@/lib/shadowFrustum";
import { createSkyTexture, skyIntensity, skyFogColor } from "@/lib/skyEnvironment";
import {
  ceilingDesign, resolveCeilingSettings, buildCeilingParts, DEFAULT_CEILING_DESIGN,
  type CeilingDesignId, type CeilingSettings, type CeilingPart,
} from "@/lib/ceilingDesigns";
import { sunPosition, dayOfYear, type SunState } from "@/lib/sunPosition";
import { LightFixture, fixturePose } from "@/components/studio/LightFixtures";
import { ChiroqPlanView } from "@/features/studio/ChiroqPlanView";
import type { LightTypeId } from "@/lib/lightCatalog";
import { lightType, kelvinToHex, lumensToIntensity } from "@/lib/lightCatalog";
import { RENO_STAGES, type PhaseKey } from "@/lib/phases";

// Explicit (default-on since three r152, but pinned here so a future three
// upgrade can't silently regress the color pipeline)
THREE.ColorManagement.enabled = true;

// Walls are WIDTHLESS planes: surfaces sit exactly on the room boundary, so
// corners share their edge precisely (welded), and from outside the camera
// sees straight into the room (backface-culled) — dollhouse style.
const WALL_T = 0;

// Double-click navigation: focus the orbit pivot on whatever was clicked;
// double-clicking empty space recenters on the room.
function DoubleClickFocus({
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
function KeepAutoClear() {
  const gl = useThree((s) => s.gl);
  useFrame(() => {
    if (!gl.autoClear) gl.autoClear = true;
  }, -1);
  return null;
}

// Dev-only: expose the live scene graph for debugging / smoke checks
function DevSceneHandle() {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__scene = scene;
    }
  }, [scene]);
  return null;
}

// ─── Postprocessing — N8AO ambient occlusion + SMAA anti-alias ───────────────
// Mounted only when highQuality3d && declineCount < 2.
// drei Html overlays (SwapButtons, drag handles) are DOM portals — unaffected
// by the WebGL composer.
function RealismEffects({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  return (
    <EffectComposer multisampling={0}>
      <N8AO
        halfRes
        aoRadius={0.35}
        intensity={1.1}
        distanceFalloff={0.5}
        quality="performance"
        depthAwareUpsampling
      />
      <SMAA />
    </EffectComposer>
  );
}

export interface StudioContext {
  room: Room;
  onSave: () => Promise<void>;
}

// ─── Surface color defaults ───────────────────────────────────────────────────

const CEILING_DEFAULT = "#D5D3CE";

function shadeHex(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const sh = (v: number) => Math.round(v * factor).toString(16).padStart(2, "0");
  return `#${sh(r)}${sh(g)}${sh(b)}`;
}

// ─── Floor with canvas texture ────────────────────────────────────────────────

const FLOOR_COLORS: Record<string, string> = {
  parquet: "#C9AB7E",
  laminate: "#B8906A",
  tile: "#D8D8D0",
  concrete: "#9E9E9E",
};

// ─── Shared wall-texture loader ───────────────────────────────────────────────
// All Wall instances that share the same URL reuse one THREE.Texture to avoid
// loading the same (potentially large) data-URL 4 times simultaneously.

interface TexEntry { tex: THREE.Texture; aspect: number }
const _texCache    = new Map<string, TexEntry>();
const _texPending  = new Set<string>();
const _texWaiters  = new Map<string, Array<(e: TexEntry) => void>>();

function requestSharedTexture(
  url: string,
  onLoaded: (e: TexEntry) => void,
  onError: () => void,
): () => void {
  const cached = _texCache.get(url);
  if (cached) { onLoaded(cached); return () => {}; }

  if (!_texWaiters.has(url)) _texWaiters.set(url, []);
  _texWaiters.get(url)!.push(onLoaded);

  if (!_texPending.has(url)) {
    _texPending.add(url);
    new THREE.TextureLoader().load(
      url,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.needsUpdate = true;
        const img = t.image as HTMLImageElement;
        const aspect = (img.naturalWidth || img.width || 1) / (img.naturalHeight || img.height || 1);
        const entry: TexEntry = { tex: t, aspect };
        _texCache.set(url, entry);
        _texPending.delete(url);
        for (const cb of _texWaiters.get(url) ?? []) cb(entry);
        _texWaiters.delete(url);
      },
      undefined,
      (err) => {
        console.warn('[WallTexture] load failed:', err);
        _texPending.delete(url);
        for (const _ of _texWaiters.get(url) ?? []) onError();
        _texWaiters.delete(url);
      },
    );
  }

  return () => {
    const list = _texWaiters.get(url);
    if (list) {
      const idx = list.indexOf(onLoaded);
      if (idx >= 0) list.splice(idx, 1);
    }
  };
}

function WoodFloor({
  width, depth, floorType, floorTexture, floorTextureSettings, isSelected, onClick,
}: {
  width: number; depth: number; floorType: string;
  floorTexture?: string | null;
  floorTextureSettings?: { repeatX: number; repeatY: number; offsetX: number; offsetY: number; rotation: number } | null;
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
        <meshStandardMaterial map={activeTex} roughness={0.55} metalness={0.05} envMapIntensity={0.4} />
      </mesh>
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} renderOrder={1}>
          <planeGeometry args={[width + 0.04, depth + 0.04]} />
          <meshBasicMaterial color="#D85A30" opacity={0.18} transparent depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

// ─── Wall with door/window openings ──────────────────────────────────────────

const WALLPAPER_WIDTH_M = 1.06 // standard roll width

interface WallProps {
  wallId: string;
  length: number;
  height: number;
  thickness: number;
  covering: WallCovering;
  elements: Array<{
    id: string;
    type: 'eshik' | 'deraza' | 'balkon';
    width: number;
    height: number;
    sill_height: number;
    position: number;
  }>;
  axis: "X" | "Z";
  cx: number;
  cz: number;
  isSelected?: boolean;
  onClick?: () => void;
  panelSettings?: WallPanelSettings;
  /** Suvoq bosqichi: photo-real plaster PBR material on every segment */
  plaster?: boolean;
}

/*
 * Seg stores the inner-face PLANE of each wall segment, not a box.
 *
 * Using PlaneGeometry with Three.js default FrontSide means:
 *  • From inside the room the plane's normal faces the camera → VISIBLE ✓
 *  • From outside the plane's normal faces AWAY from camera → backface-culled,
 *    invisible — exactly like 3ds Max "Backface Cull" ✓
 *
 * px/py/pz — world position of the inner face plane centre
 * ry        — Y-rotation to align the plane's +Z normal to the correct
 *             room-inward direction:
 *               Wall A (back)  cz<0  ry=0      normal = +Z  (into room)
 *               Wall C (front) cz>0  ry=π      normal = −Z
 *               Wall B (right) cx>0  ry=−π/2   normal = −X
 *               Wall D (left)  cx<0  ry=+π/2   normal = +X
 * pw/ph     — plane width × height
 */
interface Seg {
  px: number; py: number; pz: number;
  ry: number;
  pw: number; ph: number;
  uOffset: number; uRepeat: number; vRepeat: number;
  /** Horizontal start position of this segment within the full wall (mm from left edge) */
  startMm: number;
  /** Y coordinate of the bottom edge of this segment in world metres */
  startYm: number;
}

function WallSegment({
  seg,
  covering,
  baseTexture,
  imageTexture,
  texAspect,
  plaster = false,
}: {
  seg: Seg;
  covering: WallCovering;
  baseTexture: THREE.CanvasTexture | null;
  imageTexture: THREE.Texture | null;
  /** texW / texH of the uploaded image (1 for unknown / square) */
  texAspect: number;
  /** Suvoq bosqichi: render the photo-real plaster PBR material instead of the covering */
  plaster?: boolean;
}) {
  const mat = useMemo(() => {
    if (covering.kind !== 'oboy' || !baseTexture) return null;
    const t = baseTexture.clone();
    t.repeat.set(seg.uRepeat, seg.vRepeat);
    t.offset.set(seg.uOffset, 0);
    t.needsUpdate = true;
    return t;
  // covering.kind guards the early-exit so it must be a dep
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [covering.kind, baseTexture, seg.uOffset, seg.uRepeat, seg.vRepeat]);

  // 3ds-Max-style Planar UVW mapping:
  //   repeatX = tiles per metre (X scale, master scale control)
  //   repeatY = vertical stretch multiplier (1.0 = no stretch, preserves aspect)
  //   texAspect = texW/texH — used so tiles appear square when repeatX == 1 on a
  //               square texture regardless of wall proportions.
  //   UV continuity: each segment's UV start is derived from its physical position
  //   within the full wall so the pattern continues seamlessly across door/window cuts.
  const imgMat = useMemo(() => {
    if (covering.kind !== 'texture' || !imageTexture) return null;
    const t = imageTexture.clone();
    t.colorSpace = imageTexture.colorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;

    const s = covering.repeatX;          // tiles per metre (U axis)
    const sV = s * texAspect * covering.repeatY; // tiles per metre (V axis, aspect-corrected + user stretch)

    // Horizontal: U = (wallPositionM * s + userOffsetX)
    const uStart = (seg.startMm / 1000) * s + covering.offsetX;
    const uOffset = ((uStart % 1) + 1) % 1;  // keep positive
    const uRepeat = seg.pw * s;

    // Vertical: V = (wallBottomM * sV + userOffsetY)
    const vStart = seg.startYm * sV + covering.offsetY;
    const vOffset = ((vStart % 1) + 1) % 1;
    const vRepeat = seg.ph * sV;

    t.repeat.set(uRepeat, vRepeat);
    t.offset.set(uOffset, vOffset);
    t.rotation = covering.rotation;
    t.center.set(0.5, 0.5);
    t.needsUpdate = true;
    return t;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [covering.kind, imageTexture, texAspect, seg.startMm, seg.startYm, seg.pw, seg.ph,
      covering.kind === 'texture' ? covering.repeatX : 0,
      covering.kind === 'texture' ? covering.repeatY : 0,
      covering.kind === 'texture' ? covering.offsetX : 0,
      covering.kind === 'texture' ? covering.offsetY : 0,
      covering.kind === 'texture' ? covering.rotation : 0,
  ]);

  // Suvoq (plaster) phase: world-anchored PBR maps, cloned per segment so the
  // pattern flows uninterrupted across door/window cuts. Clones share the
  // underlying image — loaded once for the whole session.
  const showPlaster = plaster || covering.kind === 'plaster';
  const plasterMaps = useMemo(() => {
    if (!showPlaster) return null;
    return clonePlasterMapsFor(seg.pw, seg.ph, seg.startMm / 1000, seg.startYm);
  }, [showPlaster, seg.pw, seg.ph, seg.startMm, seg.startYm]);

  const paintColor = covering.kind === 'paint' ? covering.color : '#ffffff';

  return (
    <mesh position={[seg.px, seg.py, seg.pz]} rotation={[0, seg.ry, 0]} castShadow receiveShadow>
      <planeGeometry args={[seg.pw, seg.ph]} />
      {showPlaster && plasterMaps ? (
        <meshStandardMaterial
          map={plasterMaps.map}
          normalMap={plasterMaps.normalMap}
          normalScale={PLASTER_NORMAL_SCALE}
          roughnessMap={plasterMaps.roughnessMap}
          aoMap={plasterMaps.aoMap}
          // Full-strength AO makes the sun-averted walls go near-black with
          // real photo maps (the scene's ambient fill is only ~0.18).
          aoMapIntensity={0.3}
          roughness={1}
          metalness={0}
          // The apartment HDR is a warm outdoor scene; at high intensity it
          // casts neutral-grey plaster brown. Keep IBL low so raw concrete
          // reads as concrete, and let the analytic lights carry the shaping.
          envMapIntensity={0.3}
        />
      ) : covering.kind === 'paint' ? (
        <meshStandardMaterial color={paintColor} roughness={0.88} metalness={0} envMapIntensity={0.3} />
      ) : covering.kind === 'texture' ? (
        <meshStandardMaterial map={imgMat ?? undefined} color="#ffffff" roughness={0.65} metalness={0} envMapIntensity={0.3} />
      ) : (
        <meshStandardMaterial map={mat ?? undefined} color="#ffffff" roughness={0.9} metalness={0} envMapIntensity={0.2} />
      )}
    </mesh>
  );
}

type ResolvedEl = { position: number; width: number; height: number; sill_height: number };

function WallPanelGrid({
  wallLengthM,
  wallHeightM,
  thickness,
  axis,
  cx,
  cz,
  settings,
  elements,
  covering,
  imageTexture,
  texAspect,
}: {
  wallLengthM: number;
  wallHeightM: number;
  thickness: number;
  axis: 'X' | 'Z';
  cx: number;
  cz: number;
  settings: WallPanelSettings;
  covering?: WallCovering;
  imageTexture?: THREE.Texture | null;
  texAspect?: number;
  elements: ResolvedEl[];
}) {
  const pw = (settings.rotation === 90 ? settings.height : settings.width) / 1000;
  const ph = (settings.rotation === 90 ? settings.width : settings.height) / 1000;

  // Cloned texture scaled to a single panel's physical size
  const panelTex = useMemo(() => {
    if (covering?.kind !== 'texture' || !imageTexture) return null;
    const s = covering.repeatX;
    const t = imageTexture.clone();
    t.colorSpace = imageTexture.colorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(pw * s, ph * s * (texAspect ?? 1) * covering.repeatY);
    t.rotation = covering.rotation;
    t.center.set(0.5, 0.5);
    t.needsUpdate = true;
    return t;
  }, [covering, imageTexture, texAspect, pw, ph]);

  const panels = useMemo(() => {
    const pw = (settings.rotation === 90 ? settings.height : settings.width) / 1000;
    const ph = (settings.rotation === 90 ? settings.width : settings.height) / 1000;
    const pd = settings.depth / 1000;
    const gapM = Math.max(0, settings.gap / 1000);
    const stride = pw + gapM;

    if (pw <= 0 || ph <= 0 || stride <= 0 || wallLengthM <= 0 || wallHeightM <= 0) return [];

    const faceDir = axis === 'X'
      ? (cz <= 0 ? 1 : -1)
      : (cx >= 0 ? -1 : 1);
    const depthOffset = faceDir * (thickness / 2 + pd / 2 + 0.001);
    const wallLeft = -wallLengthM / 2;

    // Pre-convert openings to meters for overlap checks
    const openings = elements.map((el) => ({
      l: el.position / 1000,
      r: (el.position + el.width) / 1000,
      b: el.sill_height / 1000,
      t: (el.sill_height + el.height) / 1000,
    }));

    const items: Array<{ x: number; y: number; z: number; aw: number; ah: number; pd: number }> = [];

    // Merge a list of {b,t} intervals (must be pre-sorted by b)
    function mergeIntervals(segs: Array<{ b: number; t: number }>) {
      const out: Array<{ b: number; t: number }> = [];
      for (const seg of segs) {
        if (out.length === 0 || out[out.length - 1].t <= seg.b) {
          out.push({ b: seg.b, t: seg.t });
        } else {
          out[out.length - 1].t = Math.max(out[out.length - 1].t, seg.t);
        }
      }
      return out;
    }

    // Rows from bottom. Only the first row may be clipped (when panel is taller than wall).
    // Subsequent rows stop before a partial strip at the top would appear.
    for (let r = 0; ; r++) {
      const rowStart = r * (ph + gapM);
      if (rowStart >= wallHeightM) break;
      if (r > 0 && wallHeightM - rowStart < ph / 2) break;
      const rowH = Math.min(ph, wallHeightM - rowStart);
      const rowEnd = rowStart + rowH;

      // Columns from left — last column is clipped to remaining width
      for (let c = 0; ; c++) {
        const colStart = c * stride;
        if (colStart >= wallLengthM) break;
        const colEnd = colStart + Math.min(pw, wallLengthM - colStart);

        // Split column at every opening's left/right edge that falls inside [colStart, colEnd].
        // This gives horizontal sub-strips, each of which is either fully free or fully
        // over an opening — avoiding panels that straddle window boundaries.
        const hBreaks = new Set<number>([colStart, colEnd]);
        for (const o of openings) {
          if (o.l > colStart && o.l < colEnd) hBreaks.add(o.l);
          if (o.r > colStart && o.r < colEnd) hBreaks.add(o.r);
        }
        const hSorted = [...hBreaks].sort((a, b) => a - b);

        for (let hi = 0; hi < hSorted.length - 1; hi++) {
          const sl = hSorted[hi];
          const sr = hSorted[hi + 1];
          const sw = sr - sl;
          const sCenterAlong = wallLeft + (sl + sr) / 2;

          const pushSeg = (segCY: number, segH: number) => {
            if (axis === 'X') {
              items.push({ x: cx + sCenterAlong, y: segCY, z: cz + depthOffset, aw: sw, ah: segH, pd });
            } else {
              items.push({ x: cx + depthOffset, y: segCY, z: cz + sCenterAlong, aw: sw, ah: segH, pd });
            }
          };

          // Openings that overlap this horizontal sub-strip
          const hOverlap = openings.filter((o) => sl < o.r && sr > o.l);

          if (hOverlap.length === 0) {
            // No opening in this strip → full-height panel segment
            pushSeg(rowStart + rowH / 2, rowH);
          } else {
            // Opening present → render only the vertical free segments (above/below openings)
            const blocked = hOverlap
              .map((o) => ({ b: Math.max(o.b, rowStart), t: Math.min(o.t, rowEnd) }))
              .filter((seg) => seg.b < seg.t)
              .sort((a, b) => a.b - b.b);
            const merged = mergeIntervals(blocked);
            let cursor = rowStart;
            for (const seg of merged) {
              if (cursor < seg.b) {
                const segH = seg.b - cursor;
                pushSeg(cursor + segH / 2, segH);
              }
              cursor = seg.t;
            }
            if (cursor < rowEnd) {
              const segH = rowEnd - cursor;
              pushSeg(cursor + segH / 2, segH);
            }
          }
        }
      }
    }
    return items;
  }, [settings, wallLengthM, wallHeightM, thickness, axis, cx, cz, elements]);

  const chamferMm = settings.chamfer ?? 0;

  return (
    <>
      {panels.map((p, i) => {
        const bw = axis === 'X' ? p.aw : p.pd;
        const bd = axis === 'X' ? p.pd : p.aw;
        const maxR = Math.min(bw, p.ah, bd) / 2 - 0.0005;
        const radius = chamferMm > 0 ? Math.min(chamferMm / 1000, maxR) : 0;
        const matProps = panelTex
          ? { map: panelTex, color: '#ffffff', roughness: 0.65, metalness: 0 }
          : { color: settings.color, roughness: 0.45, metalness: 0.05 };
        if (radius > 0.0004) {
          return (
            <RoundedBox key={i} position={[p.x, p.y, p.z]} args={[bw, p.ah, bd]} radius={radius} smoothness={3} castShadow receiveShadow>
              <meshStandardMaterial {...matProps} />
            </RoundedBox>
          );
        }
        return (
          <mesh key={i} position={[p.x, p.y, p.z]} castShadow receiveShadow>
            <boxGeometry args={[bw, p.ah, bd]} />
            <meshStandardMaterial {...matProps} />
          </mesh>
        );
      })}
    </>
  );
}

function Wall({ length, height, thickness, covering, elements, axis, cx, cz, isSelected = false, onClick, panelSettings, plaster = false }: WallProps) {
  const oboyTexture = useMemo(() => {
    if (covering.kind !== 'oboy') return null;
    return createOboyTexture(covering.patternId as OboyPatternId, covering.baseColor, covering.accentColor);
  }, [
    covering.kind,
    covering.kind === 'oboy' ? covering.patternId : '',
    covering.kind === 'oboy' ? covering.baseColor : '',
    covering.kind === 'oboy' ? covering.accentColor : '',
  ]);

  const [imageTexture, setImageTexture] = useState<THREE.Texture | null>(null);
  const [texAspect, setTexAspect] = useState(1); // texW / texH
  const textureUrl = covering.kind === 'texture' ? covering.url : null;
  const { invalidate } = useThree();

  useEffect(() => {
    if (!textureUrl) { setImageTexture(null); setTexAspect(1); return; }
    let cancelled = false;

    // Use the cached entry immediately when already loaded
    const cached = _texCache.get(textureUrl);
    if (cached) {
      setTexAspect(cached.aspect);
      setImageTexture(cached.tex);
      return;
    }

    const unsub = requestSharedTexture(
      textureUrl,
      (entry) => { if (!cancelled) { setTexAspect(entry.aspect); setImageTexture(entry.tex); } },
      () => { if (!cancelled) { setImageTexture(null); setTexAspect(1); } },
    );
    return () => { cancelled = true; unsub(); };
  }, [textureUrl]);

  useEffect(() => { if (imageTexture) invalidate(); }, [imageTexture, invalidate]);


  const resolvedElements = useMemo(
    () => resolveElementPositions(elements, length * 1000),
    [elements, length],
  );

  const segments = useMemo(() => {
    const segs: Seg[] = [];
    const s = 1 / 1000;

    function makeSeg(
      posX: number, posY: number, posZ: number,
      sw: number, sh: number, sd: number,
      startMm: number,
    ): Seg {
      const segLenM = axis === 'X' ? sw : sd
      const startM = startMm / 1000
      const uOffset = (startM % WALLPAPER_WIDTH_M) / WALLPAPER_WIDTH_M
      const uRepeat = segLenM / WALLPAPER_WIDTH_M
      const vRepeat = sh / WALLPAPER_WIDTH_M

      let px: number, py: number = posY, pz: number, ry: number, pw: number
      const ph = sh

      if (axis === 'X') {
        // Thickness runs in Z. Inner face offset ± T/2 along Z from centre.
        const faceDir = posZ <= 0 ? 1 : -1   // Wall A: cz<0 → +Z; Wall C: cz>0 → −Z
        px = posX
        pz = posZ + faceDir * thickness / 2
        ry = faceDir > 0 ? 0 : Math.PI
        pw = sw
      } else {
        // axis === 'Z': thickness runs in X. Inner face offset ± T/2 along X.
        const faceDir = posX >= 0 ? -1 : 1   // Wall B: cx>0 → −X; Wall D: cx<0 → +X
        px = posX + faceDir * thickness / 2
        pz = posZ
        ry = faceDir > 0 ? Math.PI / 2 : -Math.PI / 2
        pw = sd
      }

      const startYm = posY - sh / 2;  // Y of bottom edge of this segment
      return { px, py, pz, ry, pw, ph, uOffset, uRepeat, vRepeat, startMm, startYm }
    }

    if (resolvedElements.length === 0) {
      segs.push(makeSeg(
        cx, height / 2, cz,
        axis === 'X' ? length : thickness,
        height,
        axis === 'Z' ? length : thickness,
        0,
      ));
      return segs;
    }

    const sorted = [...resolvedElements].sort((a, b) => a.position - b.position);
    let cursor = 0;

    for (const el of sorted) {
      const elLeft = el.position;
      const elRight = el.position + el.width;
      const elTop = el.sill_height + el.height;

      if (elLeft > cursor) {
        const segW = (elLeft - cursor) * s;
        const offset = ((cursor + elLeft) / 2 - length * 500) * s;
        segs.push(axis === 'X'
          ? makeSeg(cx + offset, height / 2, cz, segW, height, thickness, cursor)
          : makeSeg(cx, height / 2, cz + offset, thickness, height, segW, cursor));
      }

      const elTopM = elTop * s;
      if (elTopM < height) {
        const panH = height - elTopM;
        const panCY = elTopM + panH / 2;
        const offset = ((elLeft + elRight) / 2 - length * 500) * s;
        const panW = el.width * s;
        segs.push(axis === 'X'
          ? makeSeg(cx + offset, panCY, cz, panW, panH, thickness, elLeft)
          : makeSeg(cx, panCY, cz + offset, thickness, panH, panW, elLeft));
      }

      if (el.sill_height > 0) {
        const silH = el.sill_height * s;
        const offset = ((elLeft + elRight) / 2 - length * 500) * s;
        const panW = el.width * s;
        segs.push(axis === 'X'
          ? makeSeg(cx + offset, silH / 2, cz, panW, silH, thickness, elLeft)
          : makeSeg(cx, silH / 2, cz + offset, thickness, silH, panW, elLeft));
      }

      cursor = elRight;
    }

    const totalMM = length * 1000;
    if (cursor < totalMM) {
      const segW = (totalMM - cursor) * s;
      const offset = ((cursor + totalMM) / 2 - length * 500) * s;
      segs.push(axis === 'X'
        ? makeSeg(cx + offset, height / 2, cz, segW, height, thickness, cursor)
        : makeSeg(cx, height / 2, cz + offset, thickness, height, segW, cursor));
    }

    return segs;
  }, [resolvedElements, length, height, thickness, axis, cx, cz]);

  // Selection is shown as a wireframe frame around the whole wall face (like
  // the blue box on a selected light) rather than tinting the wall red — the
  // colour of the wall stays true while it is being edited.
  const selectionFrame = useMemo(() => {
    if (!isSelected) return null
    const faceDir = axis === 'X' ? (cz <= 0 ? 1 : -1) : (cx >= 0 ? -1 : 1)
    const eps = 0.02
    const px = axis === 'X' ? cx : cx + faceDir * (thickness / 2 + eps)
    const pz = axis === 'X' ? cz + faceDir * (thickness / 2 + eps) : cz
    const ry = axis === 'X' ? (faceDir > 0 ? 0 : Math.PI) : (faceDir > 0 ? Math.PI / 2 : -Math.PI / 2)
    return { px, pz, ry, geo: new THREE.EdgesGeometry(new THREE.PlaneGeometry(length, height)) }
  }, [isSelected, axis, cx, cz, thickness, length, height])

  return (
    <group onClick={onClick}>
      {segments.map((seg, i) => (
        <WallSegment
          key={`${i}-${covering.kind === 'oboy' ? covering.patternId : 'p'}`}
          seg={seg}
          covering={covering}
          baseTexture={oboyTexture}
          imageTexture={imageTexture}
          texAspect={texAspect}
          plaster={plaster}
        />
      ))}
      {selectionFrame && (
        <lineSegments
          geometry={selectionFrame.geo}
          position={[selectionFrame.px, height / 2, selectionFrame.pz]}
          rotation={[0, selectionFrame.ry, 0]}
        >
          <lineBasicMaterial color="#2563EB" />
        </lineSegments>
      )}
      {panelSettings?.enabled && (
        <WallPanelGrid
          wallLengthM={length}
          wallHeightM={height}
          thickness={thickness}
          axis={axis}
          cx={cx}
          cz={cz}
          settings={panelSettings}
          elements={resolvedElements}
          covering={covering}
          imageTexture={imageTexture}
          texAspect={texAspect}
        />
      )}
    </group>
  );
}

// ─── Window glass panes ───────────────────────────────────────────────────────

function WindowFrames({
  geometry,
  wallWidth,
  wallDepth,
  hiddenWalls,
}: {
  geometry: RoomGeometry;
  wallWidth: number;
  wallDepth: number;
  hiddenWalls?: ReadonlySet<string>;
}) {
  const frames: React.ReactElement[] = [];
  const s = 1 / 1000;
  const FRAME_W = 0.05; // 5cm frame width
  const frameMat = <meshStandardMaterial color="#C0B8A8" roughness={0.6} metalness={0.1} />;

  const wallDefs = [
    { id: "A", axis: "X" as const, cz: -wallDepth / 2, cx: 0, length: wallWidth },
    { id: "C", axis: "X" as const, cz: wallDepth / 2, cx: 0, length: wallWidth },
    { id: "B", axis: "Z" as const, cx: wallWidth / 2, cz: 0, length: wallDepth },
    { id: "D", axis: "Z" as const, cx: -wallWidth / 2, cz: 0, length: wallDepth },
  ];

  for (const wd of wallDefs) {
    if (hiddenWalls?.has(wd.id)) continue;
    const wall = geometry.walls.find((w) => w.id === wd.id);
    if (!wall) continue;

    const resolvedWallEls = resolveElementPositions(wall.elements, wd.length * 1000);
    for (const el of resolvedWallEls) {
      if (el.type !== "deraza" && el.type !== "balkon") continue;

      const elW = el.width * s;
      const elH = el.height * s;
      const elBottomY = el.sill_height * s;
      const elTopY = elBottomY + elH;
      const offset = (el.position + el.width / 2 - wd.length * 500) * s;

      const px = wd.axis === "X" ? wd.cx + offset : wd.cx;
      const pz = wd.axis === "Z" ? wd.cz + offset : wd.cz;
      const isHorizontal = wd.axis === "X";
      const fW = isHorizontal ? elW : FRAME_W;
      const fD = isHorizontal ? FRAME_W : elW;

      const key = `frame-${wd.id}-${el.id ?? el.position}`;
      // Jambs offset along the WALL'S length axis (X for A/C, Z for B/D) —
      // offsetting X on side walls pushed them perpendicular out of the wall
      const jamb = elW / 2 - FRAME_W / 2;
      const midY = (elBottomY + elTopY) / 2;

      // Left frame
      frames.push(
        <mesh key={`${key}-L`} position={isHorizontal ? [px - jamb, midY, pz] : [px, midY, pz - jamb]}>
          <boxGeometry args={[FRAME_W, elH + 2 * FRAME_W, FRAME_W]} />
          {frameMat}
        </mesh>,
      );

      // Right frame
      frames.push(
        <mesh key={`${key}-R`} position={isHorizontal ? [px + jamb, midY, pz] : [px, midY, pz + jamb]}>
          <boxGeometry args={[FRAME_W, elH + 2 * FRAME_W, FRAME_W]} />
          {frameMat}
        </mesh>,
      );

      // Top frame
      frames.push(
        <mesh key={`${key}-T`} position={[px, elTopY + FRAME_W / 2, pz]}>
          <boxGeometry args={[fW + 2 * FRAME_W, FRAME_W, fD]} />
          {frameMat}
        </mesh>,
      );

      // Sill (bottom frame with visible edge and detail)
      frames.push(
        <mesh key={`${key}-S`} position={[px, elBottomY - FRAME_W / 2, pz]}>
          <boxGeometry args={[fW + 2 * FRAME_W, FRAME_W, fD]} />
          {frameMat}
        </mesh>,
      );

      // Sill lip detail (slight overhang for visual interest)
      frames.push(
        <mesh key={`${key}-SL`} position={[px, elBottomY - FRAME_W - 0.005, pz]}>
          <boxGeometry args={[fW + 2 * FRAME_W + 0.01, 0.005, fD + 0.01]} />
          <meshStandardMaterial color="#D4C4B4" roughness={0.5} metalness={0.1} />
        </mesh>,
      );
    }
  }
  return <>{frames}</>;
}

function DoorFrames({
  geometry,
  wallWidth,
  wallDepth,
  hiddenWalls,
}: {
  geometry: RoomGeometry;
  wallWidth: number;
  wallDepth: number;
  hiddenWalls?: ReadonlySet<string>;
}) {
  const frames: React.ReactElement[] = [];
  const s = 1 / 1000;
  const FRAME_W = 0.05; // 5cm frame width
  const frameMat = <meshStandardMaterial color="#8B7355" roughness={0.7} metalness={0.05} />;

  const wallDefs = [
    { id: "A", axis: "X" as const, cz: -wallDepth / 2, cx: 0, length: wallWidth },
    { id: "C", axis: "X" as const, cz: wallDepth / 2, cx: 0, length: wallWidth },
    { id: "B", axis: "Z" as const, cx: wallWidth / 2, cz: 0, length: wallDepth },
    { id: "D", axis: "Z" as const, cx: -wallWidth / 2, cz: 0, length: wallDepth },
  ];

  for (const wd of wallDefs) {
    if (hiddenWalls?.has(wd.id)) continue;
    const wall = geometry.walls.find((w) => w.id === wd.id);
    if (!wall) continue;

    const resolvedWallEls = resolveElementPositions(wall.elements, wd.length * 1000);
    for (const el of resolvedWallEls) {
      if (el.type !== "eshik") continue; // Only doors

      const elW = el.width * s;
      const elH = el.height * s;
      const elBottomY = el.sill_height * s;
      const elTopY = elBottomY + elH;
      const offset = (el.position + el.width / 2 - wd.length * 500) * s;

      const px = wd.axis === "X" ? wd.cx + offset : wd.cx;
      const pz = wd.axis === "Z" ? wd.cz + offset : wd.cz;
      const isHorizontal = wd.axis === "X";
      const fW = isHorizontal ? elW : FRAME_W;
      const fD = isHorizontal ? FRAME_W : elW;

      const key = `door-${wd.id}-${el.id ?? el.position}`;
      // Jambs offset along the WALL'S length axis (X for A/C, Z for B/D)
      const jamb = elW / 2 - FRAME_W / 2;
      const midY = (elBottomY + elTopY) / 2;

      // Left frame
      frames.push(
        <mesh key={`${key}-L`} position={isHorizontal ? [px - jamb, midY, pz] : [px, midY, pz - jamb]}>
          <boxGeometry args={[FRAME_W, elH + FRAME_W, FRAME_W]} />
          {frameMat}
        </mesh>,
      );

      // Right frame
      frames.push(
        <mesh key={`${key}-R`} position={isHorizontal ? [px + jamb, midY, pz] : [px, midY, pz + jamb]}>
          <boxGeometry args={[FRAME_W, elH + FRAME_W, FRAME_W]} />
          {frameMat}
        </mesh>,
      );

      // Top frame
      frames.push(
        <mesh key={`${key}-T`} position={[px, elTopY + FRAME_W / 2, pz]}>
          <boxGeometry args={[fW + 2 * FRAME_W, FRAME_W, fD]} />
          {frameMat}
        </mesh>,
      );

      // Threshold (door sill at floor level) with wear finish
      frames.push(
        <mesh key={`${key}-H`} position={[px, 0.01, pz]}>
          <boxGeometry args={[fW + 2 * FRAME_W, 0.01, fD]} />
          <meshStandardMaterial
            color="#5A4A3A"
            roughness={0.75}
            metalness={0.08}
            envMapIntensity={0.1}
          />
        </mesh>,
      );
    }
  }
  return <>{frames}</>;
}

// ─── Baseboard trim ────────────────────────────────────────────────────────────

/** Returns (centerLocal, segLen) pairs in meters, skipping floor-level openings. */
function boardSegments(
  wallLenM: number,
  elements: WallElement[],
): Array<{ center: number; len: number }> {
  const wallLenMm = wallLenM * 1000;
  const BOARD_H_MM = 100; // keep in sync with Baseboard h = 0.1
  const resolved = resolveElementPositions(elements, wallLenMm);
  // The board must break at ANY opening that reaches the floor: doors,
  // balcony doors, and floor-to-ceiling windows (sill below board height).
  const cuts = resolved
    .filter(e => (e.sill_height ?? 0) < BOARD_H_MM)
    .sort((a, b) => a.position - b.position);

  if (cuts.length === 0) return [{ center: 0, len: wallLenM }];

  const segs: Array<{ center: number; len: number }> = [];
  let cursor = 0;
  for (const cut of cuts) {
    if (cut.position > cursor) {
      const lenMm = cut.position - cursor;
      segs.push({ center: ((cursor + cut.position) / 2 - wallLenMm / 2) / 1000, len: lenMm / 1000 });
    }
    cursor = Math.max(cursor, cut.position + cut.width);
  }
  if (cursor < wallLenMm) {
    segs.push({ center: ((cursor + wallLenMm) / 2 - wallLenMm / 2) / 1000, len: (wallLenMm - cursor) / 1000 });
  }
  return segs;
}

function Baseboard({ width, depth, geometry, hiddenWalls }: { width: number; depth: number; geometry: RoomGeometry; hiddenWalls?: ReadonlySet<string> }) {
  const h = 0.1;
  const t = 0.02;
  const color = "#E0D8CC";

  const wallA = geometry.walls.find(w => w.id === 'A');
  const wallB = geometry.walls.find(w => w.id === 'B');
  const wallC = geometry.walls.find(w => w.id === 'C');
  const wallD = geometry.walls.find(w => w.id === 'D');

  const segsA = boardSegments(width, wallA?.elements ?? []);
  const segsC = boardSegments(width, wallC?.elements ?? []);
  const segsB = boardSegments(depth, wallB?.elements ?? []);
  const segsD = boardSegments(depth, wallD?.elements ?? []);

  const mat = <meshStandardMaterial color={color} roughness={0.35} metalness={0.02} envMapIntensity={0.4} />;
  return (
    <group>
      {!hiddenWalls?.has('A') && segsA.map((s, i) => (
        <mesh key={`A${i}`} position={[s.center, h / 2, -depth / 2 + t / 2 - 0.006]}>
          <boxGeometry args={[s.len, h, t]} />{mat}
        </mesh>
      ))}
      {!hiddenWalls?.has('C') && segsC.map((s, i) => (
        <mesh key={`C${i}`} position={[s.center, h / 2, depth / 2 - t / 2 + 0.006]}>
          <boxGeometry args={[s.len, h, t]} />{mat}
        </mesh>
      ))}
      {!hiddenWalls?.has('B') && segsB.map((s, i) => (
        <mesh key={`B${i}`} position={[width / 2 - t / 2 + 0.006, h / 2, s.center]}>
          <boxGeometry args={[t, h, s.len]} />{mat}
        </mesh>
      ))}
      {!hiddenWalls?.has('D') && segsD.map((s, i) => (
        <mesh key={`D${i}`} position={[-width / 2 + t / 2 - 0.006, h / 2, s.center]}>
          <boxGeometry args={[t, h, s.len]} />{mat}
        </mesh>
      ))}
    </group>
  );
}

// ─── Ceiling disk lights ──────────────────────────────────────────────────────

function computeDiskLightPositions(W: number, D: number): [number, number][] {
  const minSpacing = 0.6;
  const usableX = W * 0.5;  // 25% offset from each side wall
  const usableZ = D * 0.5;
  const maxNx = Math.max(1, Math.floor(usableX / minSpacing) + 1);
  const maxNz = Math.max(1, Math.floor(usableZ / minSpacing) + 1);
  const target = Math.max(1, Math.round((W * D) / 4));
  const aspect = W / D;

  let bestNx = 1, bestNz = 1, bestScore = Infinity;
  for (let nx = 1; nx <= Math.min(target, maxNx); nx++) {
    for (const nz of [Math.round(target / nx), Math.ceil(target / nx)]) {
      if (nz < 1 || nz > maxNz) continue;
      const spacingX = nx === 1 ? Infinity : usableX / (nx - 1);
      const spacingZ = nz === 1 ? Infinity : usableZ / (nz - 1);
      if (spacingX < minSpacing || spacingZ < minSpacing) continue;
      const score = Math.abs(Math.log((nx / nz) / aspect)) + Math.abs(nx * nz - target) / target * 0.5;
      if (score < bestScore) { bestScore = score; bestNx = nx; bestNz = nz; }
    }
  }

  const positions: [number, number][] = [];
  for (let ix = 0; ix < bestNx; ix++) {
    const x = bestNx === 1 ? 0 : -usableX / 2 + ix * (usableX / (bestNx - 1));
    for (let iz = 0; iz < bestNz; iz++) {
      const z = bestNz === 1 ? 0 : -usableZ / 2 + iz * (usableZ / (bestNz - 1));
      positions.push([x, z]);
    }
  }
  return positions;
}

function CeilingLightDisk({ x, z, height, emit = true }: {
  x: number; z: number; height: number; emit?: boolean
}) {
  return (
    <group>
      <mesh position={[x, height - 0.009, z]}>
        <cylinderGeometry args={[0.068, 0.062, 0.018, 24]} />
        <meshStandardMaterial color="#BFBBB0" metalness={0.65} roughness={0.28} />
      </mesh>
      <mesh position={[x, height - 0.002, z]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.05, 24]} />
        <meshStandardMaterial
          color={emit ? "#F0F8FF" : "#707070"}
          emissive={emit ? "#C8E8FF" : "#000000"}
          emissiveIntensity={emit ? 1.9 : 0}
          roughness={1}
        />
      </mesh>
    </group>
  );
}

// CeilingLights renders auto-grid ONLY when no user lights are placed.
// User-placed lights are rendered + made draggable by DraggableLightModels (in Canvas).
// Real pointLights are pooled: max 4 on highQuality, max 2 on mobile, evenly spread
// across the fixture grid so total output stays constant regardless of fixture count.
// Fixture disks always react to lightsOn via emissiveIntensity (uniform visual toggle).
function CeilingLights({
  width, depth, height, lightsOn, highQuality,
}: {
  width: number; depth: number; height: number;
  lightsOn: boolean;
  highQuality: boolean;
}) {
  const userLightsCount = useRoomStore((s) => s.lights.length);
  const autoPositions = useMemo(
    () => computeDiskLightPositions(width, depth),
    [width, depth],
  );

  if (userLightsCount > 0) return null;

  const spread = Math.max(width, depth) * 1.9;
  const nLights = highQuality
    ? Math.min(4, autoPositions.length)
    : Math.min(2, autoPositions.length);
  const perIntensity = 1.6 / Math.max(1, nLights);

  // Pick evenly-spaced positions from the auto-grid for the real pointLights
  const poolPositions: [number, number][] = [];
  if (autoPositions.length > 0 && nLights > 0) {
    const step = autoPositions.length / nLights;
    for (let k = 0; k < nLights; k++) {
      const idx = Math.min(Math.round(k * step), autoPositions.length - 1);
      poolPositions.push(autoPositions[idx]);
    }
  }

  return (
    <group>
      {/* Emissive disks — always rendered, brightness follows lightsOn */}
      {autoPositions.map(([x, z], i) => (
        <CeilingLightDisk key={i} x={x} z={z} height={height} emit={lightsOn} />
      ))}
      {/* Pooled real pointLights — only when on */}
      {lightsOn && poolPositions.map(([x, z], k) => (
        <pointLight
          key={k}
          position={[x, height - 0.06, z]}
          color="#D8EEFF"
          intensity={perIntensity}
          distance={spread}
          decay={2}
        />
      ))}
    </group>
  );
}

// ─── User-placed lights, shared by every view ─────────────────────────────────

/**
 * The real emitters for the user-placed set.
 *
 * Only a few fixtures actually light the room — `nLights` of them, spread
 * evenly through the list — while every fixture still glows. Pooling keeps
 * frame time flat as the count grows, and is invisible otherwise because each
 * pooled light carries its own colour temperature, brightness and beam.
 */
function PooledLightEmitters({
  lights, roomW, roomD, roomH, lightsOn, highQuality,
}: {
  lights: PlacedLight[]
  roomW: number
  roomD: number
  roomH: number
  lightsOn: boolean
  highQuality: boolean
}) {
  if (!lightsOn || lights.length === 0) return null

  const nLights = highQuality ? Math.min(4, lights.length) : Math.min(2, lights.length)
  const perIntensity = 1.4 / Math.max(1, nLights)
  const spread = Math.max(roomW, roomD) * 1.9
  const pooled = nLights > 0
    ? Array.from({ length: nLights }, (_, k) => lights[Math.min(Math.round(k * lights.length / nLights), lights.length - 1)])
    : []

  return (
    <>
      {pooled.filter((l) => !l.off).map((l, k) => {
        const t = lightType(l.type)
        const pose = fixturePose(l, t, roomW, roomD, roomH)
        const color = kelvinToHex(l.colorK ?? t.colorK)
        const intensity = perIntensity * lumensToIntensity(t.lumens, l.brightnessPct ?? 100)
        const beam = l.beamDeg ?? t.beamDeg

        // A beam angle means a cone: aim it down, tilted by the fixture's own
        // tilt so the pool of light lands where the body is pointing.
        if (beam !== undefined) {
          const tilt = l.tiltRad ?? 0
          const yaw = l.rotation ?? 0
          const reach = Math.max(1.5, pose.y)
          return (
            <spotLight
              key={k}
              position={[pose.x, pose.y - 0.05, pose.z]}
              target-position={[
                pose.x + Math.sin(tilt) * Math.sin(yaw) * reach,
                Math.max(0, pose.y - reach),
                pose.z + Math.sin(tilt) * Math.cos(yaw) * reach,
              ]}
              color={color}
              intensity={intensity * 2.2}
              angle={THREE.MathUtils.degToRad(beam) / 2}
              penumbra={0.45}
              distance={spread}
              decay={2}
            />
          )
        }
        return (
          <pointLight
            key={k}
            position={[pose.x, pose.y - 0.06, pose.z]}
            color={color}
            intensity={intensity}
            distance={spread}
            decay={2}
          />
        )
      })}
    </>
  )
}

/**
 * A single real emitter that glides with a fixture while it is being dragged.
 *
 * The pooled emitters read the store, which is only written on drop, so on its
 * own the illumination would stay put and jump at the end. This follows the
 * live drag position every frame (same maths as the pool) so the pool of light
 * travels under the fixture as you move it. It exists only during the drag.
 */
function DragEmitter({
  light, roomW, roomD, roomH, highQuality, lightsCount, dragPosRef,
}: {
  light: PlacedLight
  roomW: number
  roomD: number
  roomH: number
  highQuality: boolean
  lightsCount: number
  dragPosRef: React.MutableRefObject<THREE.Vector2>
}) {
  const t = lightType(light.type)
  const color = kelvinToHex(light.colorK ?? t.colorK)
  const beam = light.beamDeg ?? t.beamDeg
  const spread = Math.max(roomW, roomD) * 1.9
  const nLights = highQuality ? Math.min(4, lightsCount) : Math.min(2, lightsCount)
  const intensity = (1.4 / Math.max(1, nLights)) * lumensToIntensity(t.lumens, light.brightnessPct ?? 100)
  const lightRef = useRef<THREE.SpotLight | THREE.PointLight>(null)

  useFrame(() => {
    const l = lightRef.current
    if (!l) return
    const pose = fixturePose(
      { ...light, xMm: dragPosRef.current.x, zMm: dragPosRef.current.y },
      t, roomW, roomD, roomH,
    )
    l.position.set(pose.x, pose.y - (beam !== undefined ? 0.05 : 0.06), pose.z)
    if (beam !== undefined && 'target' in l) {
      const tilt = light.tiltRad ?? 0
      const yaw = light.rotation ?? 0
      const reach = Math.max(1.5, pose.y)
      l.target.position.set(
        pose.x + Math.sin(tilt) * Math.sin(yaw) * reach,
        Math.max(0, pose.y - reach),
        pose.z + Math.sin(tilt) * Math.cos(yaw) * reach,
      )
      l.target.updateMatrixWorld()
    }
  })

  if (beam !== undefined) {
    return (
      <spotLight
        ref={lightRef as React.Ref<THREE.SpotLight>}
        color={color}
        intensity={intensity * 2.2}
        angle={THREE.MathUtils.degToRad(beam) / 2}
        penumbra={0.45}
        distance={spread}
        decay={2}
      />
    )
  }
  return (
    <pointLight
      ref={lightRef as React.Ref<THREE.PointLight>}
      color={color}
      intensity={intensity}
      distance={spread}
      decay={2}
    />
  )
}

/**
 * User-placed lights, read-only.
 *
 * The editor gets DraggableLightModels; every other view — the walkthrough,
 * the elektr 3D preview — renders this, so a fixture placed in Chiroqlar is
 * lit and drawn the same way wherever the room is shown. Without it those
 * views fall dark the moment the first fixture is placed, because CeilingLights
 * stands down as soon as the user has placed any.
 */
export function PlacedLights({
  roomW, roomD, roomH, lightsOn, highQuality,
}: {
  roomW: number
  roomD: number
  roomH: number
  lightsOn: boolean
  highQuality: boolean
}) {
  const lights = useRoomStore((s) => s.lights)
  if (lights.length === 0) return null

  return (
    <>
      <PooledLightEmitters
        lights={lights}
        roomW={roomW}
        roomD={roomD}
        roomH={roomH}
        lightsOn={lightsOn}
        highQuality={highQuality}
      />
      {lights.map((l) => {
        const t = lightType(l.type)
        const pose = fixturePose(l, t, roomW, roomD, roomH)
        return (
          <group key={l.id} position={[pose.x, pose.y, pose.z]} rotation={[0, pose.rot, 0]}>
            <LightFixture light={l} on={lightsOn} />
          </group>
        )
      })}
    </>
  )
}

// ─── Draggable ceiling lights (user-placed from elektr menu) ──────────────────

function DraggableLightModels({
  controlsRef,
  roomW,
  roomD,
  roomH,
  lightsOn,
  highQuality,
  selectedId,
  onSelect,
}: {
  controlsRef: RefObject<OrbitControlsImpl | null>
  roomW: number
  roomD: number
  roomH: number
  lightsOn: boolean
  highQuality: boolean
  selectedId?: string | null
  onSelect?: (id: string | null) => void
}) {
  const lights = useRoomStore((s) => s.lights)
  const moveLight = useRoomStore((s) => s.moveLight)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const draggingIdRef = useRef<string | null>(null)
  const dragPosRef = useRef(new THREE.Vector2())
  const lightsRef = useRef(lights)
  lightsRef.current = lights
  const { camera, gl } = useThree()
  const ceilingPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), roomH), [roomH])
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const hitPoint = useRef(new THREE.Vector3())
  const groupRefs = useRef(new Map<string, THREE.Group>())

  function startDrag(light: PlacedLight, e: ThreeEvent<PointerEvent>) {
    e.stopPropagation()
    dragPosRef.current.set(light.xMm, light.zMm)
    draggingIdRef.current = light.id
    setDraggingId(light.id)
    if (controlsRef.current) controlsRef.current.enabled = false
    document.body.style.cursor = 'grabbing'
  }

  function commitDrag() {
    const id = draggingIdRef.current
    if (!id) return
    moveLight(id, Math.round(dragPosRef.current.x), Math.round(dragPosRef.current.y))
    draggingIdRef.current = null
    setDraggingId(null)
    if (controlsRef.current) controlsRef.current.enabled = true
    document.body.style.cursor = ''
  }

  useEffect(() => {
    if (!draggingId) return
    const canvas = gl.domElement
    const halfW = (roomW / 2) * 1000
    const halfD = (roomD / 2) * 1000

    const handleMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      if (!raycaster.ray.intersectPlane(ceilingPlane, hitPoint.current)) return
      const xMm = Math.max(-halfW, Math.min(halfW, hitPoint.current.x * 1000)) + halfW
      const zMm = Math.max(-halfD, Math.min(halfD, hitPoint.current.z * 1000)) + halfD
      dragPosRef.current.set(xMm, zMm)
    }

    canvas.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', commitDrag)
    return () => {
      canvas.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', commitDrag)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingId, roomW, roomD, roomH])

  // Glide the fixture along with the pointer every frame while dragging. The
  // store is only written on drop (commitDrag), so without this the fixture
  // would sit at its old spot and jump to the new one only after release.
  useFrame(() => {
    const id = draggingIdRef.current
    if (!id) return
    const g = groupRefs.current.get(id)
    const l = lightsRef.current.find((x) => x.id === id)
    if (!g || !l) return
    const pose = fixturePose(
      { ...l, xMm: dragPosRef.current.x, zMm: dragPosRef.current.y },
      lightType(l.type),
      roomW,
      roomD,
      roomH,
    )
    g.position.set(pose.x, pose.y, pose.z)
  })

  if (lights.length === 0) return null
  const draggedLight = draggingId ? lights.find((l) => l.id === draggingId) ?? null : null
  // While dragging, the dragged light is lit by DragEmitter (which follows the
  // pointer). Keeping it in the pool too would leave a second, stationary light
  // burning at its old store position until drop, so drop it from the pool.
  const pooledLights = draggedLight ? lights.filter((l) => l.id !== draggedLight.id) : lights
  return (
    <>
      {/* Same emitters every other view gets — see PooledLightEmitters. */}
      <PooledLightEmitters
        lights={pooledLights}
        roomW={roomW}
        roomD={roomD}
        roomH={roomH}
        lightsOn={lightsOn}
        highQuality={highQuality}
      />

      {/* While a fixture is being dragged, a dedicated emitter follows it so the
          illumination travels with the body instead of jumping only on drop. */}
      {lightsOn && draggedLight && !draggedLight.off && (
        <DragEmitter
          light={draggedLight}
          roomW={roomW}
          roomD={roomD}
          roomH={roomH}
          highQuality={highQuality}
          lightsCount={lights.length}
          dragPosRef={dragPosRef}
        />
      )}

      {lights.map((l) => {
        const t = lightType(l.type)
        const pose = fixturePose(l, t, roomW, roomD, roomH)
        const isDragging = draggingId === l.id
        const isSelected = selectedId === l.id
        return (
          <group
            key={l.id}
            ref={(g) => {
              if (g) groupRefs.current.set(l.id, g)
              else groupRefs.current.delete(l.id)
            }}
            position={[pose.x, pose.y, pose.z]}
            rotation={[0, pose.rot, 0]}
          >
            <LightFixture light={l} on={lightsOn} />
            {/* Invisible grab/select handle over the fixture */}
            <mesh
              onPointerDown={(e) => {
                e.stopPropagation()
                onSelect?.(l.id)
                // Direct-drag in any tool mode: a plain click leaves the light
                // where it is (dragPos starts at its current spot), a drag moves
                // it along the ceiling. No need to switch to the Siljitish tool.
                startDrag(l, e)
              }}
              onPointerEnter={() => { document.body.style.cursor = 'grab' }}
              onPointerLeave={() => { if (!isDragging) document.body.style.cursor = '' }}
            >
              <sphereGeometry args={[Math.max(0.14, t.sizeM.w * 0.6), 12, 10]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            {isSelected && (
              <lineSegments>
                <edgesGeometry
                  args={[new THREE.BoxGeometry(
                    t.sizeM.w + 0.06,
                    t.sizeM.h + 0.06,
                    t.sizeM.d + 0.06,
                  )]}
                />
                <lineBasicMaterial color="#2563EB" />
              </lineSegments>
            )}
          </group>
        )
      })}
    </>
  )
}

// ─── Wall-mounted electrical devices ─────────────────────────────────────────

const ELECTRICAL_DIMS: Record<string, { w: number; h: number }> = {
  switch1:      { w: 0.08, h: 0.08 },
  switch2:      { w: 0.14, h: 0.08 },
  socket1:      { w: 0.08, h: 0.08 },
  socket2:      { w: 0.14, h: 0.08 },
  socket_media: { w: 0.18, h: 0.08 },
  // panel is a cabinet, not a thin faceplate
  panel:        { w: 0.40, h: 0.50 },
}

// ─── Draggable electrical items (3D) ─────────────────────────────────────────

function getWallPlane(wallId: 'A' | 'B' | 'C' | 'D', W: number, D: number): THREE.Plane {
  switch (wallId) {
    case 'A': return new THREE.Plane(new THREE.Vector3(0, 0, 1),  D / 2)
    case 'C': return new THREE.Plane(new THREE.Vector3(0, 0, -1), D / 2)
    case 'D': return new THREE.Plane(new THREE.Vector3(1, 0, 0),  W / 2)
    case 'B': return new THREE.Plane(new THREE.Vector3(-1, 0, 0), W / 2)
  }
}

function DraggableElectricalItem({
  el, W, D, isDragging, dragPosMmRef, onPointerDown,
}: {
  el: PlacedElectrical
  W: number; D: number
  isDragging: boolean
  dragPosMmRef: React.MutableRefObject<number>
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void
}) {
  const groupRef = useRef<THREE.Group>(null)
  const isPanel = el.type === 'panel'
  const dim = ELECTRICAL_DIMS[el.type] ?? { w: 0.08, h: 0.08 }
  const depth = isPanel ? 0.12 : 0.018
  const T = 0.004
  const isSwitch = el.type.startsWith('switch')
  const isH = el.wallId === 'A' || el.wallId === 'C'

  // Compute static position (the axis that stays fixed during drag)
  const { px, py, pz, ry } = useMemo(() => {
    const cy = el.heightMm / 1000 + dim.h / 2
    const p = el.positionMm / 1000
    switch (el.wallId) {
      case 'A': return { px: p - W / 2, py: cy, pz: -(D / 2) + depth / 2 + T, ry: 0 }
      case 'C': return { px: p - W / 2, py: cy, pz: D / 2 - depth / 2 - T, ry: Math.PI }
      case 'D': return { px: -(W / 2) + depth / 2 + T, py: cy, pz: p - D / 2, ry: Math.PI / 2 }
      case 'B': return { px: W / 2 - depth / 2 - T, py: cy, pz: p - D / 2, ry: -Math.PI / 2 }
      default: return { px: 0, py: cy, pz: 0, ry: 0 }
    }
  }, [el, W, D, dim.h, depth])

  useFrame(() => {
    if (!isDragging || !groupRef.current) return
    const pos = dragPosMmRef.current / 1000
    if (isH) groupRef.current.position.x = pos - W / 2
    else     groupRef.current.position.z = pos - D / 2
  })

  if (isPanel) {
    return (
      <group ref={groupRef} position={[px, py, pz]} rotation={[0, ry, 0]}>
        <mesh castShadow
          onPointerDown={onPointerDown}
          onPointerEnter={() => { document.body.style.cursor = 'grab' }}
          onPointerLeave={() => { if (!isDragging) document.body.style.cursor = '' }}>
          <boxGeometry args={[dim.w, dim.h, depth]} />
          <meshStandardMaterial color="#E8E4DC" roughness={0.6} metalness={0.1}
            emissive={isDragging ? '#4466AA' : '#000'} emissiveIntensity={isDragging ? 0.08 : 0}/>
        </mesh>
        <mesh position={[0, 0, depth / 2 + 0.002]}>
          <boxGeometry args={[dim.w - 0.02, dim.h - 0.02, 0.01]} />
          <meshStandardMaterial color="#1B3784" roughness={0.4} metalness={0.15} />
        </mesh>
        {[-0.08, 0, 0.08].map((rowY, ri) =>
          [-0.08, 0.08].map((colX, ci) => (
            <mesh key={`${ri}-${ci}`} position={[colX, rowY, depth / 2 + 0.008]}>
              <boxGeometry args={[0.06, 0.04, 0.006]} />
              <meshStandardMaterial color="#F0F0F0" roughness={0.5} />
            </mesh>
          ))
        )}
        <mesh position={[dim.w / 2 - 0.03, 0, depth / 2 + 0.012]}>
          <boxGeometry args={[0.012, 0.04, 0.008]} />
          <meshStandardMaterial color="#C0B8A8" metalness={0.6} roughness={0.3} />
        </mesh>
      </group>
    )
  }

  return (
    <group ref={groupRef} position={[px, py, pz]} rotation={[0, ry, 0]}>
      <mesh castShadow
        onPointerDown={onPointerDown}
        onPointerEnter={() => { document.body.style.cursor = 'grab' }}
        onPointerLeave={() => { if (!isDragging) document.body.style.cursor = '' }}>
        <boxGeometry args={[dim.w, dim.h, depth]} />
        <meshStandardMaterial color="#F5F5F0" roughness={0.5} metalness={0.05}
          emissive={isDragging ? '#4466AA' : '#000'} emissiveIntensity={isDragging ? 0.1 : 0}/>
      </mesh>
      {isSwitch ? (
        <mesh position={[0, 0.005, depth / 2 + 0.001]}>
          <boxGeometry args={[dim.w * 0.7, dim.h * 0.55, 0.004]} />
          <meshStandardMaterial color="#1B3784" roughness={0.4} metalness={0.1} />
        </mesh>
      ) : (
        <>
          <mesh position={[-0.012, 0.008, depth / 2 + 0.001]}>
            <cylinderGeometry args={[0.004, 0.004, 0.003, 12]} />
            <meshStandardMaterial color="#1B3784" />
          </mesh>
          <mesh position={[0.012, 0.008, depth / 2 + 0.001]}>
            <cylinderGeometry args={[0.004, 0.004, 0.003, 12]} />
            <meshStandardMaterial color="#1B3784" />
          </mesh>
        </>
      )}
    </group>
  )
}

function DraggableElectricalModels({
  controlsRef, W, D,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>
  W: number; D: number
}) {
  const electricals = useRoomStore(s => s.electricals)
  const moveElectrical = useRoomStore(s => s.moveElectrical)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const draggingIdRef = useRef<string | null>(null)
  const dragPosMmRef = useRef(0)
  const electricalsRef = useRef(electricals)
  electricalsRef.current = electricals

  const { camera, gl } = useThree()
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const hitPoint = useRef(new THREE.Vector3())

  function startDrag(el: PlacedElectrical, e: ThreeEvent<PointerEvent>) {
    e.stopPropagation()
    dragPosMmRef.current = el.positionMm
    draggingIdRef.current = el.id
    setDraggingId(el.id)
    if (controlsRef.current) controlsRef.current.enabled = false
    document.body.style.cursor = 'grabbing'
  }

  function commitDrag() {
    const id = draggingIdRef.current
    if (!id) return
    moveElectrical(id, Math.round(dragPosMmRef.current))
    draggingIdRef.current = null
    setDraggingId(null)
    if (controlsRef.current) controlsRef.current.enabled = true
    document.body.style.cursor = ''
  }

  useEffect(() => {
    if (!draggingId) return
    const el = electricalsRef.current.find(e => e.id === draggingId)
    if (!el) return

    const wallPlane = getWallPlane(el.wallId as 'A' | 'B' | 'C' | 'D', W, D)
    const isH = el.wallId === 'A' || el.wallId === 'C'
    const wallLenMm = isH ? W * 1000 : D * 1000
    const canvas = gl.domElement

    const handleMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      if (!raycaster.ray.intersectPlane(wallPlane, hitPoint.current)) return
      let posMm = isH
        ? (hitPoint.current.x + W / 2) * 1000
        : (hitPoint.current.z + D / 2) * 1000
      posMm = Math.max(100, Math.min(wallLenMm - 100, posMm))
      dragPosMmRef.current = posMm
    }

    canvas.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', commitDrag)
    return () => {
      canvas.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', commitDrag)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingId, W, D])

  if (electricals.length === 0) return null
  return (
    <>
      {electricals.map(el => (
        <DraggableElectricalItem
          key={el.id}
          el={el} W={W} D={D}
          isDragging={draggingId === el.id}
          dragPosMmRef={dragPosMmRef}
          onPointerDown={(e) => startDrag(el, e)}
        />
      ))}
    </>
  )
}

// ─── Corner shadow accents ────────────────────────────────────────────────────

function CornerShadows({ width, depth, composerActive }: { width: number; depth: number; composerActive: boolean }) {
  // Halve opacity when N8AO composer is active to avoid double-darkening corners
  const opacity = composerActive ? 0.07 : 0.15;
  const corners: [number, number][] = [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [-width / 2, depth / 2],
    [width / 2, depth / 2],
  ];
  return (
    <group>
      {corners.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.01, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.5, 0.5]} />
          <meshBasicMaterial color="#000000" transparent opacity={opacity} />
        </mesh>
      ))}
    </group>
  );
}

/** For meshes that must stay in the scene but out of every pick. */
const noRaycast = () => {}

/** Fractional hours as a wall clock — 13.25 → "13:15". */
function formatClock(hour: number): string {
  const h = Math.floor(hour)
  const m = Math.round((hour - h) * 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

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
function Ceiling({
  W, D, H, T, designId, settings, hidden, meshRef,
}: {
  W: number; D: number; H: number; T: number
  designId: CeilingDesignId
  settings?: Partial<CeilingSettings>
  hidden: boolean
  meshRef: React.MutableRefObject<THREE.Mesh | null>
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
}

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

/**
 * Installs the generated sky as both the view out of the window and the room's
 * image-based lighting.
 *
 * Both, from one texture, on purpose: a sky that is dark in the window while
 * still filling the room with midday bounce is the mismatch this whole thing
 * exists to remove.
 */
export function BrandedSky({ sun }: { sun: SunState }) {
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)
  const texture = useMemo(() => createSkyTexture(sun), [sun])

  useEffect(() => {
    const prevBg = scene.background
    const prevEnv = scene.environment
    scene.background = texture
    scene.environment = texture
    scene.environmentIntensity = skyIntensity(sun)
    invalidate()
    return () => {
      if (scene.background === texture) scene.background = prevBg
      if (scene.environment === texture) scene.environment = prevEnv
      texture.dispose()
    }
  }, [scene, texture, sun, invalidate])

  return null
}

// ─── Lighting ─────────────────────────────────────────────────────────────────


export function SceneLighting({
  width, depth, height, highQuality, sun,
}: {
  width: number; depth: number; height: number; highQuality: boolean
  /**
   * Where the sun actually stands, from `sunPosition`. Omit it and the light
   * falls back to the fixed studio key — which is what the elektr preview and
   * the walkthrough still want, since neither offers a clock to set.
   */
  sun?: SunState
}) {
  // No layer juggling here on purpose. Enabling a layer on `shadow.camera`
  // looks like it should let the shadow map see objects the view camera hides,
  // and does nothing at all: three culls shadow casters against the *view*
  // camera's layers (WebGLShadowMap's renderObject tests
  // `object.layers.test(camera.layers)` with the camera it was handed, which is
  // the one you are looking through). Hiding a caster is done at the material
  // instead — see the ceiling in RoomScene.

  const mapSize = highQuality ? 2048 : 1024

  // Far enough out that a low sun still clears the room instead of standing
  // inside its own shadow frustum.
  const dist = Math.max(width, depth, height) * 1.6 + 4
  const position: [number, number, number] = sun
    ? [sun.direction[0] * dist, sun.direction[1] * dist, sun.direction[2] * dist]
    : [width * 0.3, height * 1.8, depth * 0.3]

  // Fit the shadow frustum to the room as the sun actually sees it.
  //
  // These bounds are in the LIGHT's view space, not the world's, so a fixed box
  // around the plan is only ever right for a sun straight overhead. As the sun
  // drops, the room's silhouette from up there grows tall and slides sideways,
  // and whatever falls outside the frustum samples as having no occluder at
  // all — which is how a closed ceiling ended up with a hard-edged wedge of
  // sunlight lying across the walls beneath it.
  //
  // Projecting the room's eight corners onto the light's own axes costs
  // nothing and is right from every direction.
  const shadowBox = fitShadowFrustum(position, width, height, depth)

  // Sky bounce follows the sun down. Without this the room keeps a full midday
  // fill under an orange dusk key, which reads as a colour bug rather than as
  // evening. The floor of 0.18 is what keeps a night room navigable.
  const daylight = sun
    ? Math.max(0.18, Math.pow(Math.sin(Math.max(sun.altitude, 0) * (Math.PI / 180)), 0.6))
    : 1

  return (
    <>
      {/* Warm low-angle directional "sun" for form-shading and realistic shadows */}
      <directionalLight
        color={sun ? sun.color : "#FFF3DE"}
        intensity={sun ? sun.intensity : highQuality ? 1.3 : 1.0}
        position={position}
        // A set sun contributes nothing, so its shadow map is pure cost.
        castShadow={sun ? sun.isUp : true}
        shadow-mapSize={[mapSize, mapSize]}
        shadow-camera-left={-shadowBox.hw}
        shadow-camera-right={shadowBox.hw}
        shadow-camera-top={shadowBox.hh}
        shadow-camera-bottom={-shadowBox.hh}
        shadow-camera-near={shadowBox.near}
        shadow-camera-far={shadowBox.far}
        shadow-bias={-0.0008}
        shadow-normalBias={0.02}
        shadow-radius={4}
      />
      {/* Cool sky-bounce fill light — much dimmer so shadows read clearly */}
      <hemisphereLight color="#DCE8FF" groundColor="#CFC6B4" intensity={0.35 * daylight} />
      {/* Ambient floor to prevent pitch-black occluded areas */}
      <ambientLight color="#FFFFFF" intensity={0.18 * daylight} />
    </>
  );
}

// ─── In-scene swap buttons ────────────────────────────────────────────────────

const SwapButtons = memo(function SwapButtons({ W, D, H }: { W: number; D: number; H: number }) {
  const { geometry, swapAdjacentElements } = useRoomStore();
  const s = 1 / 1000;
  const T = WALL_T;
  const T_MM = WALL_T * 1000;
  const buttonY = H * 0.42;

  const wallDefs = useMemo(() => [
    { id: "A", axis: "X" as const, cx: 0,                cz: -(D / 2 + T / 2), wallLenM: W,         elOffset: 0    },
    { id: "C", axis: "X" as const, cx: 0,                cz:   D / 2 + T / 2,  wallLenM: W,         elOffset: 0    },
    { id: "B", axis: "Z" as const, cx:  W / 2 + T / 2,  cz: 0,                wallLenM: D + 2 * T, elOffset: T_MM },
    { id: "D", axis: "Z" as const, cx: -(W / 2 + T / 2), cz: 0,               wallLenM: D + 2 * T, elOffset: T_MM },
  ], [W, D]);

  const items: React.ReactElement[] = [];

  for (const wd of wallDefs) {
    const wall = geometry.walls.find((w) => w.id === wd.id);
    if (!wall) continue;
    if (wall.elements.filter((e) => e.type === "eshik" || e.type === "deraza").length < 2) continue;

    const rawLenMm = (wd.id === "B" || wd.id === "D") ? D * 1000 : wd.wallLenM * 1000;
    const resolved = resolveElementPositions(wall.elements, rawLenMm);
    const sorted = resolved
      .filter((e) => e.type === "eshik" || e.type === "deraza")
      .map((e) => ({ ...e, position: e.position + wd.elOffset }))
      .sort((a, b) => a.position - b.position);

    for (let i = 0; i < sorted.length - 1; i++) {
      const el1 = sorted[i];
      const el2 = sorted[i + 1];
      const gapMidMm = (el1.position + el1.width + el2.position) / 2;
      const wallLenMm = wd.wallLenM * 1000;
      const localOffset = (gapMidMm - wallLenMm / 2) * s;

      const px = wd.axis === "X" ? wd.cx + localOffset : wd.cx;
      const pz = wd.axis === "Z" ? wd.cz + localOffset : wd.cz;

      // Capture the exact two IDs this button is responsible for
      const wId = wd.id;
      const e1Id = el1.id;
      const e2Id = el2.id;

      items.push(
        <Html key={`swap-${wd.id}-${i}`} position={[px, buttonY, pz]} center zIndexRange={[50, 0]}>
          <button
            onClick={() => swapAdjacentElements(wId, e1Id, e2Id)}
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              border: "1px solid rgba(0,0,0,0.14)",
              background: "rgba(255,255,255,0.90)",
              cursor: "pointer",
              fontSize: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
              userSelect: "none",
            }}
          >
            ⇄
          </button>
        </Html>,
      );
    }
  }

  return <>{items}</>;
});

// ─── Add-room "+" buttons shown around the room in top-down view ──────────────

const ADD_ROOM_BTN_STYLE: React.CSSProperties = {
  width: '44px',
  height: '44px',
  borderRadius: '50%',
  border: '2.5px solid #D85A30',
  background: 'rgba(255,255,255,0.92)',
  cursor: 'pointer',
  fontSize: '22px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 2px 12px rgba(0,0,0,0.22)',
  color: '#D85A30',
  fontWeight: 'bold',
  userSelect: 'none',
  lineHeight: 1,
};

export type RoomSide = 'north' | 'south' | 'east' | 'west';

function AddRoomButtons({ W, D, H, onAdd, disabled }: { W: number; D: number; H: number; onAdd: (side: RoomSide) => void; disabled?: boolean }) {
  const btnY = H * 0.5;
  const gap = 1.5;

  const sides: { key: RoomSide; pos: [number, number, number] }[] = [
    { key: 'north', pos: [0,             btnY, -(D / 2 + gap)] },
    { key: 'south', pos: [0,             btnY,  D / 2 + gap]   },
    { key: 'east',  pos: [ W / 2 + gap,  btnY, 0]              },
    { key: 'west',  pos: [-(W / 2 + gap), btnY, 0]             },
  ];

  return (
    <>
      {sides.map(({ key, pos }) => (
        <Html key={key} position={pos} center zIndexRange={[100, 0]}>
          <button
            style={{ ...ADD_ROOM_BTN_STYLE, opacity: disabled ? 0.6 : 1, cursor: disabled ? 'wait' : 'pointer' }}
            onClick={() => onAdd(key)}
            disabled={disabled}
            title="Xona qo'shish"
          >
            {disabled ? '…' : '+'}
          </button>
        </Html>
      ))}
    </>
  );
}

// ─── Sibling rooms (top view floor plan) ──────────────────────────────────────
// Renders the apartment's other rooms as flat clickable outlines beside the
// active room. Data and navigation come in as props: router/query contexts
// don't bridge into the R3F Canvas tree.

const SIBLING_LABEL_STYLE: React.CSSProperties = {
  padding: '4px 12px',
  borderRadius: 999,
  border: '1px solid #E5E0D5',
  background: 'rgba(255,255,255,0.92)',
  color: '#4A4438',
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
};

const SIBLING_DELETE_STYLE: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 999,
  border: '1px solid #FECACA',
  background: 'rgba(255,255,255,0.92)',
  color: '#DC2626',
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1,
  cursor: 'pointer',
  boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

function roomFootprint(r: Room, activeId: string, activeW: number, activeD: number): { w: number; d: number } {
  if (r.id === activeId) return { w: activeW, d: activeD };
  const wallB = r.geometry?.walls?.find((w) => w.id === 'B');
  const wallA = r.geometry?.walls?.find((w) => w.id === 'A');
  return { w: wallB?.length ?? 3, d: wallA?.length ?? 4 };
}

function roomLayoutPos(r: Room | undefined): { x: number; z: number } | undefined {
  const p = (r?.state as { layoutPos?: { x: number; z: number } } | null | undefined)?.layoutPos;
  return p && Number.isFinite(p.x) && Number.isFinite(p.z) ? p : undefined;
}

/**
 * Absolute apartment position for every room, in ONE shared frame:
 * rooms with a stored layoutPos use it verbatim; legacy rooms (no position)
 * form a row along X with the first of them at the origin — the same origin
 * the "+ add room" flow assumes for unpositioned anchors.
 */
function computeAbsolutePositions(
  rooms: Room[],
  activeId: string,
  activeW: number,
  activeD: number,
): Map<string, { x: number; z: number }> {
  const GAP = 1.2;
  const abs = new Map<string, { x: number; z: number }>();
  let cursor = 0;
  let originOffset: number | null = null;
  for (const r of rooms) {
    const stored = roomLayoutPos(r);
    if (stored) {
      abs.set(r.id, stored);
      continue;
    }
    const { w } = roomFootprint(r, activeId, activeW, activeD);
    const slot = cursor + w / 2;
    cursor += w + GAP;
    if (originOffset === null) originOffset = slot; // first legacy room = origin
    abs.set(r.id, { x: slot - originOffset, z: 0 });
  }
  return abs;
}

function SiblingRooms({
  rooms,
  activeId,
  activeW,
  activeD,
  activePos,
  onOpen,
  onDelete,
}: {
  rooms: Room[];
  activeId: string;
  activeW: number;
  activeD: number;
  activePos: { x: number; z: number } | null;
  onOpen: (roomId: string) => void;
  onDelete: (roomId: string, name: string) => void;
}) {
  const layout = useMemo(() => {
    if (rooms.length < 2) return [];
    const abs = computeAbsolutePositions(rooms, activeId, activeW, activeD);
    // The view is centred on the active room — subtract its absolute position.
    const anchor = activePos ?? abs.get(activeId) ?? { x: 0, z: 0 };
    return rooms
      .filter((r) => r.id !== activeId)
      .map((r) => {
        const { w, d } = roomFootprint(r, activeId, activeW, activeD);
        const p = abs.get(r.id) ?? { x: 0, z: 0 };
        return { room: r, w, d, x: p.x - anchor.x, z: p.z - anchor.z };
      });
  }, [rooms, activeId, activeW, activeD, activePos]);

  return (
    <>
      {layout.map(({ room: sib, w, d, x, z }) => {
        const open = () => onOpen(sib.id);
        const h = sib.ceiling_h ?? 2.7;
        const walls: Array<{ p: [number, number, number]; s: [number, number, number] }> = [
          { p: [0, h / 2, -d / 2], s: [w + 0.08, h, 0.08] },
          { p: [0, h / 2, d / 2], s: [w + 0.08, h, 0.08] },
          { p: [-w / 2, h / 2, 0], s: [0.08, h, d] },
          { p: [w / 2, h / 2, 0], s: [0.08, h, d] },
        ];
        return (
          <group key={sib.id} position={[x, 0, z]}>
            <mesh
              position={[0, 0.02, 0]}
              onClick={(e) => { e.stopPropagation(); open(); }}
              onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
              onPointerOut={() => { document.body.style.cursor = 'auto'; }}
            >
              <boxGeometry args={[w, 0.04, d]} />
              <meshStandardMaterial color="#D9C9A8" transparent opacity={0.85} />
            </mesh>
            {walls.map((seg, i) => (
              <mesh key={i} position={seg.p}>
                <boxGeometry args={seg.s} />
                <meshStandardMaterial color="#C9C2B4" transparent opacity={0.65} />
              </mesh>
            ))}
            <Html position={[0, h + 0.3, 0]} center zIndexRange={[90, 0]}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button style={SIBLING_LABEL_STYLE} onClick={open} title="Xonani ochish">
                  {sib.name} ↗
                </button>
                <button
                  style={SIBLING_DELETE_STYLE}
                  onClick={(e) => { e.stopPropagation(); onDelete(sib.id, sib.name); }}
                  title="Xonani o'chirish"
                >
                  ✕
                </button>
              </div>
            </Html>
          </group>
        );
      })}
    </>
  );
}

// ─── Shared furniture entry (catalog + user-uploaded) ─────────────────────────

type AnyFurnitureEntry = {
  id: string
  modelPath: string
  scale: number
  sizeM: { w: number; d: number; h: number }
  hasTextures?: boolean
}

function useFurnitureEntry(furnitureId: string): AnyFurnitureEntry | undefined {
  const userFurniture = useRoomStore((s) => s.userFurniture)
  return (
    FURNITURE_CATALOG.find((f) => f.id === furnitureId) ??
    userFurniture.find((f) => f.id === furnitureId)
  )
}

/** Most parts detailed in the import diagnostic — see the note in prepareMesh. */
const REPORT_LIMIT = 40

/** Set shadows on every mesh + strip its materials down to colour.
 *  Preserves single-vs-array structure. */
function prepareMesh(obj: THREE.Object3D, debugLabel?: string) {
  const report: Record<string, unknown>[] = []
  let parts = 0
  obj.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.castShadow = true
    child.receiveShadow = true
    if (Array.isArray(child.material)) {
      child.material = child.material.map(toDiffuseOnly)
    } else {
      child.material = toDiffuseOnly(child.material as THREE.Material)
    }
    if (!import.meta.env.DEV || !debugLabel) return
    parts += 1
    // Collect a sample only. An imported model can carry thousands of parts
    // (3ds Max/Corona exports routinely do), and console.table on a list that
    // long blocks the main thread for tens of seconds — the studio came up
    // "unresponsive" purely from logging about the model it had just loaded.
    if (report.length >= REPORT_LIMIT) return
    const mats = Array.isArray(child.material) ? child.material : [child.material]
    for (const m of mats) {
      const s = m as THREE.MeshStandardMaterial
      report.push({
        mesh: child.name,
        material: s.name,
        map: !!s.map,
        mapPx: s.map?.image ? `${s.map.image.width}x${s.map.image.height}` : '—',
        uv: !!child.geometry.getAttribute('uv'),
        color: s.color?.getHexString?.(),
        metalness: s.metalness,
        roughness: s.roughness,
        vertexColors: s.vertexColors,
      })
    }
  })
  if (report.length) {
    // Why a model renders untextured is invisible from the outside: a bound map
    // can still be blank, unwrapped, or drowned by a metallic response.
    const omitted = parts - report.length
    console.groupCollapsed(
      `[furniture] ${debugLabel} — ${parts} part(s)` +
      (omitted > 0 ? `, showing first ${report.length}` : ''),
    )
    console.table(report)
    console.groupEnd()
  }
}

/** Apply per-material color tints. Uses '*' as wildcard for all materials. */
function applyColorOverrides(obj: THREE.Object3D, overrides: Record<string, string>) {
  const wildcard = overrides['*']
  obj.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const mats = Array.isArray(child.material) ? child.material : [child.material]
    mats.forEach((m) => {
      if (!(m instanceof THREE.MeshStandardMaterial)) return
      const named = overrides[m.name]
      if (named) m.color.set(named)
      // A wildcard tint multiplies into the texture, so applying the default
      // white to a mapped material is a no-op at best — and a way to wash a
      // model out at worst. Named overrides stay explicit and still apply.
      else if (wildcard && !m.map) m.color.set(wildcard)
    })
  })
}

/** Mounts the interactive 3D doors and windows. The wrapper is what lets the
 *  cutaway hook run inside the Canvas while its controls live on the page. */
function OpeningLayer({
  geometry, W, D, cutaway, toolMode, controlsRef, selectedId, onSelect,
}: {
  geometry: RoomGeometry;
  W: number;
  D: number;
  cutaway: CutawayMode;
  toolMode: ToolMode;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const hiddenWalls = useHiddenWalls(cutaway);
  const shared = {
    geometry,
    wallWidth: W,
    wallDepth: D,
    hiddenWalls,
    // Doors/windows have no 'part' concept (that's furniture sub-object
    // editing) — fall back to 'select' so this stays a no-op for them.
    toolMode: (toolMode === 'part' ? 'select' : toolMode) as DoorToolMode,
    controlsRef,
    selectedId,
    onSelect,
  };
  return (
    <>
      <DoorLeaves {...shared} />
      <WindowSashes {...shared} />
    </>
  );
}

// ─── Placed furniture renderer ────────────────────────────────────────────────

function FurnitureItem({ item }: { item: PlacedFurniture }) {
  const entry = useFurnitureEntry(item.furniture_id)
  const modelPath = entry?.modelPath ?? ''
  const { scene } = useGLTF(modelPath || '/models/table_boconcept_hauge.glb')
  const cloned = useMemo(() => {
    const c = scene.clone(true)
    applyHiddenParts(c, item.hiddenParts)
    // Only user-imported models are worth reporting on — catalog GLBs are known good
    prepareMesh(c, entry && 'blobId' in entry ? entry.id : undefined)
    return c
  }, [scene, entry, item.hiddenParts]);

  // Compute bottom offset ONCE per clone, before R3F touches the object's position.
  // Storing scale-independent value so it stays correct when scaleOverride changes.
  const yOffUnit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(cloned)
    return isFinite(box.min.y) ? -box.min.y : 0
  }, [cloned]);

  useLayoutEffect(() => {
    if (!item.colorOverrides || Object.keys(item.colorOverrides).length === 0) return
    applyColorOverrides(cloned, item.colorOverrides)
  }, [cloned, item.colorOverrides])

  if (!entry || !modelPath) return null;
  const s = entry.scale * (item.scaleOverride ?? 1);
  return (
    <primitive
      object={cloned}
      position={[item.x / 1000, yOffUnit * s, item.y / 1000]}
      rotation={[0, item.rotation, 0]}
      scale={s}
    />
  );
}

export function FurnitureModels() {
  const furniture = useRoomStore((s) => s.furniture);
  if (furniture.length === 0) return null;
  return (
    <>
      {furniture.map((item) => (
        <FurnitureItem key={item.id} item={item} />
      ))}
    </>
  );
}

// Preload all catalog models so first render is instant
FURNITURE_CATALOG.forEach((e) => useGLTF.preload(e.modelPath));

// ─── Draggable furniture (ThreeDPage only) ────────────────────────────────────

type ToolMode = 'select' | 'move' | 'rotate' | 'scale' | 'part'

/** Part selection: which sub-object of which placed item is active. */
export interface SelectedPart {
  itemId: string
  partKey: string
  label: string
}

function DraggableFurnitureItem({
  item,
  isDragging,
  isSelected,
  toolMode,
  dragPosRef,
  dragRotRef,
  dragScaleRef,
  onMeshPointerDown,
  onButtonPointerDown,
  onFootprint,
  selectedPartKey,
  onSelectPart,
}: {
  item: PlacedFurniture
  isDragging: boolean
  isSelected: boolean
  toolMode: ToolMode
  dragPosRef: RefObject<THREE.Vector3>
  dragRotRef: RefObject<number>
  dragScaleRef: RefObject<number>
  onMeshPointerDown: (e: ThreeEvent<PointerEvent>) => void
  onButtonPointerDown: (e: React.PointerEvent) => void
  onFootprint: (id: string, hw: number, hd: number) => void
  /** Active part key when this item owns the current part selection */
  selectedPartKey: string | null
  onSelectPart: (part: SelectedPart | null) => void
}) {
  const entry = useFurnitureEntry(item.furniture_id)
  const modelPath = entry?.modelPath ?? ''
  const { scene } = useGLTF(modelPath || '/models/table_boconcept_hauge.glb')
  const cloned = useMemo(() => {
    const c = scene.clone(true)
    applyHiddenParts(c, item.hiddenParts)
    // Only user-imported models are worth reporting on — catalog GLBs are known good
    prepareMesh(c, entry && 'blobId' in entry ? entry.id : undefined)
    return c
  }, [scene, entry, item.hiddenParts])
  const groupRef = useRef<THREE.Group>(null)
  const primitiveRef = useRef<THREE.Object3D>(null)
  const selRef = useRef<THREE.Group>(null)
  const { invalidate } = useThree()
  const [detaching, setDetaching] = useState(false)

  // If pruning removed the last mesh, the item is an empty shell — drop it.
  useEffect(() => {
    let hasMesh = false
    cloned.traverse((c) => { if ((c as THREE.Mesh).isMesh) hasMesh = true })
    if (!hasMesh) useRoomStore.getState().removeFurniture(item.id)
  }, [cloned, item.id])

  // Highlight the selected part; cleanup restores the materials (the node may
  // already be pruned on cleanup — resolvePartKey then returns null, fine).
  useEffect(() => {
    if (!selectedPartKey) return
    const node = resolvePartKey(cloned, selectedPartKey)
    if (!node) return
    setPartHighlight(node, true)
    invalidate()
    return () => { setPartHighlight(node, false); invalidate() }
  }, [selectedPartKey, cloned, invalidate])

  function handlePartClick(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation()
    const part = resolvePartFromMesh(cloned, e.object)
    const key = partKeyFor(cloned, part)
    if (!key) return
    onSelectPart({ itemId: item.id, partKey: key, label: partLabel(part) })
  }

  function deleteSelectedPart() {
    if (!selectedPartKey) return
    const node = resolvePartKey(cloned, selectedPartKey)
    onSelectPart(null)
    if (node && !hasMeshesOutsidePart(cloned, node)) {
      // Last visible part — removing it leaves an invisible, unclickable shell
      useRoomStore.getState().removeFurniture(item.id)
      return
    }
    useRoomStore.getState().hideFurniturePart(item.id, selectedPartKey)
  }

  async function detachSelectedPart() {
    if (!selectedPartKey || detaching) return
    const node = resolvePartKey(cloned, selectedPartKey)
    if (!node) return
    setDetaching(true)
    try {
      const { buffer, sizeM, worldCenter } = await exportPartToGlb(node)
      const id = nanoid()
      await saveModelToDb(id, buffer)
      const path = arrayBufferToBlobUrl(buffer)
      useGLTF.preload(path)
      const store = useRoomStore.getState()
      store.addUserFurniture({
        id,
        name: partLabel(node),
        emoji: '🧩',
        blobId: id,
        modelPath: path,
        scale: 1, // world rotation+scale are baked into the exported GLB
        sizeM,
        hasTextures: entry?.hasTextures ?? false,
      })
      store.placeFurniture({
        id: `furn_${id}`,
        furniture_id: id,
        x: worldCenter.x * 1000,
        y: worldCenter.z * 1000,
        rotation: 0,
      })
      onSelectPart(null)
      if (hasMeshesOutsidePart(cloned, node)) {
        store.hideFurniturePart(item.id, selectedPartKey)
      } else {
        store.removeFurniture(item.id)
      }
    } catch (err) {
      console.error('[PartDetach] failed:', err)
      alert("Qismni ajratib bo'lmadi: " + (err instanceof Error ? err.message : 'xato'))
    } finally {
      setDetaching(false)
    }
  }

  // Compute Y offset and XZ footprint ONCE per clone, before R3F sets position.
  const { yOffUnit, geomHW, geomHD, geomHH, geomCX, geomCZ } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(cloned)
    const ok = isFinite(box.min.x)
    return {
      yOffUnit: ok ? -box.min.y : 0,
      geomHW: ok ? (box.max.x - box.min.x) / 2 : 0.3,
      geomHD: ok ? (box.max.z - box.min.z) / 2 : 0.3,
      geomHH: ok ? (box.max.y - box.min.y) / 2 : 0.5,
      // Bounding-box centre in the model's local space — many models pivot at
      // a corner, so the selection cage must centre on the GEOMETRY, not the
      // pivot, or cage and mesh visibly disagree.
      geomCX: ok ? (box.min.x + box.max.x) / 2 : 0,
      geomCZ: ok ? (box.min.z + box.max.z) / 2 : 0,
    }
  }, [cloned])

  // Report actual footprint to parent for collision detection
  useEffect(() => {
    if (!entry) return
    const s = entry.scale * (item.scaleOverride ?? 1)
    onFootprint(item.id, geomHW * s, geomHD * s)
  }, [item.id, geomHW, geomHD, entry, item.scaleOverride, onFootprint])

  useLayoutEffect(() => {
    if (!item.colorOverrides || Object.keys(item.colorOverrides).length === 0) return
    applyColorOverrides(cloned, item.colorOverrides)
  }, [cloned, item.colorOverrides])

  useFrame(() => {
    if (!isDragging) {
      // restore the cage after a live-scale drag hid it
      if (selRef.current && !selRef.current.visible) selRef.current.visible = true
      return
    }
    if (toolMode === 'move' && groupRef.current && dragPosRef.current) {
      groupRef.current.position.x = dragPosRef.current.x
      groupRef.current.position.z = dragPosRef.current.z
    } else if (toolMode === 'rotate' && primitiveRef.current && dragRotRef.current !== null) {
      primitiveRef.current.rotation.y = dragRotRef.current
      // keep the selection cage glued to the model during live rotation
      if (selRef.current) selRef.current.rotation.y = dragRotRef.current
    } else if (toolMode === 'scale' && primitiveRef.current && entry) {
      const liveScale = entry.scale * (dragScaleRef.current ?? 1)
      primitiveRef.current.scale.setScalar(liveScale)
      // cage is sized for the committed scale — hide it while live-scaling
      if (selRef.current) selRef.current.visible = false
    }
  })

  // Clean 12-edge selection cage — a triangle wireframe draws face diagonals,
  // which reads as a "rotated" box around the model.
  const so0 = item.scaleOverride ?? 1
  const cageGeo = useMemo(() => {
    if (!entry) return null
    const sc = entry.scale * so0
    const w = geomHW * sc * 2 + 0.06
    const d = geomHD * sc * 2 + 0.06
    // Height from the real geometry — catalog sizeM.h can disagree with it
    const h = geomHH * sc * 2 + 0.06
    return new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d))
  }, [entry, so0, geomHW, geomHD, geomHH])
  useEffect(() => () => { cageGeo?.dispose() }, [cageGeo])

  if (!entry || !modelPath) return null

  const so = item.scaleOverride ?? 1
  const s = entry.scale * so
  const yOff = yOffUnit * s
  const modelH = (entry.sizeM.h ?? 1) * so
  const buttonH = modelH + 0.18
  const btnActive = isDragging
  const fw = geomHW * s * 2   // actual footprint width
  const fd = geomHD * s * 2   // actual footprint depth
  const meshCursor = toolMode === 'select' ? 'pointer'
                   : toolMode === 'part'   ? 'crosshair'
                   : toolMode === 'rotate' ? 'ew-resize'
                   : toolMode === 'scale'  ? 'ns-resize'
                   : 'grab'

  return (
    <group ref={groupRef} position={[item.x / 1000, 0, item.y / 1000]}>
      <primitive
        ref={primitiveRef}
        object={cloned}
        position={[0, yOff, 0]}
        rotation={[0, item.rotation, 0]}
        scale={s}
        onPointerDown={toolMode === 'part' ? handlePartClick : onMeshPointerDown}
        onPointerEnter={() => { document.body.style.cursor = meshCursor }}
        onPointerLeave={() => { if (!isDragging) document.body.style.cursor = '' }}
      />
      {/* Part-mode action bar — floats above the model while a part is selected */}
      {toolMode === 'part' && selectedPartKey && (
        <Html position={[0, buttonH, 0]} center zIndexRange={[110, 0]} style={{ pointerEvents: 'none' }}>
          <div
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              pointerEvents: 'all', display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.96)', borderRadius: 10, padding: '5px 8px',
              boxShadow: '0 4px 14px rgba(0,0,0,0.25)', border: '1px solid rgba(0,0,0,0.08)',
              whiteSpace: 'nowrap', userSelect: 'none',
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {partLabel(resolvePartKey(cloned, selectedPartKey) ?? cloned)}
            </span>
            <button
              onClick={detachSelectedPart}
              disabled={detaching}
              title="Qismni alohida obyekt sifatida ajratish"
              style={{
                fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 7,
                border: '1px solid #2563EB', background: '#EFF6FF', color: '#2563EB',
                cursor: detaching ? 'wait' : 'pointer',
              }}
            >
              {detaching ? '⏳' : 'Ajratish'}
            </button>
            <button
              onClick={deleteSelectedPart}
              disabled={detaching}
              title="Qismni o'chirish"
              style={{
                fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 7,
                border: '1px solid #DC2626', background: '#FEF2F2', color: '#DC2626',
                cursor: 'pointer',
              }}
            >
              O'chirish
            </button>
            <button
              onClick={() => onSelectPart(null)}
              title="Bekor qilish"
              style={{
                fontSize: 11, fontWeight: 700, padding: '3px 6px', borderRadius: 7,
                border: 'none', background: 'transparent', color: '#9CA3AF', cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        </Html>
      )}
      {/* Selection indicators — rotate WITH the model and centre on its
          bounding box (models often pivot at a corner, not the middle) */}
      {isSelected && (
        <group ref={selRef} rotation={[0, item.rotation, 0]}>
          <group position={[geomCX * s, 0, geomCZ * s]}>
            {/* Flat footprint outline — clearly visible in top/isometric view */}
            <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[fw + 0.08, fd + 0.08]} />
              <meshBasicMaterial color="#2563EB" transparent opacity={0} />
            </mesh>
            {/* Ground-level border rect using 4 thin box edges */}
            {[
              { pos: [0, 0.012, -(fd / 2 + 0.04)] as [number,number,number], scale: [fw + 0.08, 0.012, 0.012] as [number,number,number] },
              { pos: [0, 0.012,  (fd / 2 + 0.04)] as [number,number,number], scale: [fw + 0.08, 0.012, 0.012] as [number,number,number] },
              { pos: [-(fw / 2 + 0.04), 0.012, 0] as [number,number,number], scale: [0.012, 0.012, fd + 0.08] as [number,number,number] },
              { pos: [ (fw / 2 + 0.04), 0.012, 0] as [number,number,number], scale: [0.012, 0.012, fd + 0.08] as [number,number,number] },
            ].map((edge, i) => (
              <mesh key={i} position={edge.pos}>
                <boxGeometry args={edge.scale} />
                <meshBasicMaterial color="#2563EB" />
              </mesh>
            ))}
            {/* 3D selection cage — pure box EDGES (a triangle wireframe would
                draw face diagonals that read as a rotated box) */}
            {cageGeo && (
              <lineSegments geometry={cageGeo} position={[0, geomHH * s, 0]}>
                <lineBasicMaterial color="#2563EB" />
              </lineSegments>
            )}
          </group>
        </group>
      )}
      {toolMode === 'move' && (
        <Html position={[0, buttonH, 0]} center zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }}>
          <button
            onPointerDown={(e) => { e.stopPropagation(); onButtonPointerDown(e) }}
            title="Siljitish"
            style={{
              pointerEvents: 'all', width: 30, height: 30, borderRadius: '50%',
              border: btnActive ? '2px solid #1E40AF' : '1.5px solid rgba(0,0,0,0.18)',
              background: btnActive ? '#1E40AF' : 'rgba(255,255,255,0.92)',
              color: btnActive ? '#fff' : '#555',
              cursor: btnActive ? 'grabbing' : 'grab',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.22)', userSelect: 'none', touchAction: 'none',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11 3l-4 4h3v3H7V7l-4 4 4 4v-3h3v3H7l4 4 4-4h-3v-3h3v3l4-4-4-4v3h-3V7h3l-4-4z"/>
            </svg>
          </button>
        </Html>
      )}
      {toolMode === 'rotate' && (
        <Html position={[0, buttonH, 0]} center zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }}>
          <button
            onPointerDown={(e) => { e.stopPropagation(); onButtonPointerDown(e) }}
            title="Aylantirish"
            style={{
              pointerEvents: 'all', width: 30, height: 30, borderRadius: '50%',
              border: btnActive ? '2px solid #1E40AF' : '1.5px solid rgba(0,0,0,0.18)',
              background: btnActive ? '#1E40AF' : 'rgba(255,255,255,0.92)',
              color: btnActive ? '#fff' : '#555',
              cursor: 'ew-resize',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.22)', userSelect: 'none', touchAction: 'none',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
          </button>
        </Html>
      )}
      {toolMode === 'scale' && (
        <Html position={[0, buttonH, 0]} center zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }}>
          <button
            onPointerDown={(e) => { e.stopPropagation(); onButtonPointerDown(e) }}
            title="O'lcham o'zgartirish"
            style={{
              pointerEvents: 'all', width: 30, height: 30, borderRadius: '50%',
              border: btnActive ? '2px solid #059669' : '1.5px solid rgba(0,0,0,0.18)',
              background: btnActive ? '#059669' : 'rgba(255,255,255,0.92)',
              color: btnActive ? '#fff' : '#555',
              cursor: 'ns-resize',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.22)', userSelect: 'none', touchAction: 'none',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 21H3M21 3H3M12 7v10M9 10l3-3 3 3M9 14l3 3 3-3"/>
            </svg>
          </button>
        </Html>
      )}
    </group>
  )
}

function DraggableFurnitureModels({
  controlsRef,
  roomW,
  roomD,
  toolMode,
  selectedId,
  onSelectItem,
  selectedPart,
  onSelectPart,
}: {
  controlsRef: RefObject<OrbitControlsImpl | null>
  roomW: number
  roomD: number
  toolMode: ToolMode
  selectedId: string | null
  onSelectItem: (id: string) => void
  selectedPart: SelectedPart | null
  onSelectPart: (part: SelectedPart | null) => void
}) {
  const furniture = useRoomStore((s) => s.furniture)
  const userFurniture = useRoomStore((s) => s.userFurniture)
  const moveFurniture = useRoomStore((s) => s.moveFurniture)
  const resizeFurniture = useRoomStore((s) => s.resizeFurniture)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dragPosRef = useRef(new THREE.Vector3())
  const dragRotRef = useRef(0)
  const dragScaleRef = useRef(1)
  const draggingIdRef = useRef<string | null>(null)
  const furnitureRef = useRef(furniture)
  furnitureRef.current = furniture
  const dragHalfRef = useRef({ w: 0.3, d: 0.3 })
  const rotateStartXRef = useRef(0)
  const scaleStartYRef = useRef(0)
  const scaleStartValueRef = useRef(1)
  const rotateStartAngleRef = useRef(0)
  const { camera, gl } = useThree()
  const floorPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), [])
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const hitPoint = useRef(new THREE.Vector3())
  // Actual XZ half-extents reported by each item from its real geometry bounding box
  const footprintsRef = useRef<Map<string, { hw: number; hd: number }>>(new Map())
  const handleFootprint = useCallback((id: string, hw: number, hd: number) => {
    footprintsRef.current.set(id, { hw, hd })
  }, [])

  function resolveEntry(furnitureId: string): AnyFurnitureEntry | undefined {
    return (
      FURNITURE_CATALOG.find((f) => f.id === furnitureId) ??
      (userFurniture as UserFurnitureEntry[]).find((f) => f.id === furnitureId)
    )
  }

  // Half-extents of an item's AABB after its yaw rotation — a model authored
  // long along Z and rotated 90° occupies X, and vice versa. Using unrotated
  // extents locked dragging on one axis for rotated large items.
  function rotatedHalf(hw: number, hd: number, rot: number): { hw: number; hd: number } {
    const c = Math.abs(Math.cos(rot))
    const s = Math.abs(Math.sin(rot))
    return { hw: hw * c + hd * s, hd: hw * s + hd * c }
  }

  // AABB overlap test using actual geometry footprints, not catalog sizeM
  function wouldCollide(draggingId: string, nx: number, nz: number): boolean {
    const all = furnitureRef.current
    const aFP0 = footprintsRef.current.get(draggingId)
    if (!aFP0) return false
    const dragItem = all.find((f) => f.id === draggingId)
    const aFP = rotatedHalf(aFP0.hw, aFP0.hd, dragItem?.rotation ?? 0)
    const GAP = 0.03 // 3 cm minimum clearance

    for (const f of all) {
      if (f.id === draggingId) continue
      const bFP0 = footprintsRef.current.get(f.id)
      if (!bFP0) continue
      const bFP = rotatedHalf(bFP0.hw, bFP0.hd, f.rotation)
      const dx = Math.abs(nx - f.x / 1000)
      const dz = Math.abs(nz - f.y / 1000)
      if (dx < aFP.hw + bFP.hw + GAP && dz < aFP.hd + bFP.hd + GAP) return true
    }
    return false
  }

  function activateDrag(item: PlacedFurniture, clientX: number, clientY = 0) {
    onSelectItem(item.id)
    if (toolMode === 'move') {
      // Prefer actual geometry footprint; fall back to catalog sizeM
      const fp = footprintsRef.current.get(item.id)
      const entry = resolveEntry(item.furniture_id)
      const so = item.scaleOverride ?? 1
      const hw0 = fp?.hw ?? (entry?.sizeM.w ?? 0.6) * so / 2
      const hd0 = fp?.hd ?? (entry?.sizeM.d ?? 0.6) * so / 2
      // Wall clamping must use the ROTATED extents, or a long model turned
      // 90° gets its free axis locked against the walls
      const { hw, hd } = rotatedHalf(hw0, hd0, item.rotation)
      const WALL_MARGIN = 0.05 // 5 cm clearance from wall inner face
      dragHalfRef.current = { w: hw + WALL_MARGIN, d: hd + WALL_MARGIN }
      dragPosRef.current.set(item.x / 1000, 0, item.y / 1000)
      document.body.style.cursor = 'grabbing'
    } else if (toolMode === 'rotate') {
      rotateStartXRef.current = clientX
      rotateStartAngleRef.current = item.rotation
      dragRotRef.current = item.rotation
      document.body.style.cursor = 'ew-resize'
    } else if (toolMode === 'scale') {
      const so = item.scaleOverride ?? 1
      scaleStartYRef.current = clientY
      scaleStartValueRef.current = so
      dragScaleRef.current = so
      document.body.style.cursor = 'ns-resize'
    }
    draggingIdRef.current = item.id
    setDraggingId(item.id)
    if (controlsRef.current) controlsRef.current.enabled = false
  }

  function startDragFromMesh(item: PlacedFurniture, e: ThreeEvent<PointerEvent>) {
    e.stopPropagation()
    if (toolMode === 'select') { onSelectItem(item.id); return }
    activateDrag(item, e.clientX, e.clientY)
  }

  function startDragFromButton(item: PlacedFurniture, e: React.PointerEvent) {
    e.stopPropagation()
    e.preventDefault()
    if (toolMode === 'select') { onSelectItem(item.id); return }
    activateDrag(item, e.clientX, e.clientY)
  }

  function commitDrag() {
    const id = draggingIdRef.current
    if (!id) return
    const item = furnitureRef.current.find((f) => f.id === id)
    if (item) {
      if (toolMode === 'move') {
        moveFurniture(id, dragPosRef.current.x * 1000, dragPosRef.current.z * 1000, item.rotation)
      } else if (toolMode === 'rotate') {
        moveFurniture(id, item.x, item.y, dragRotRef.current)
      } else if (toolMode === 'scale') {
        resizeFurniture(id, dragScaleRef.current)
      }
    }
    draggingIdRef.current = null
    setDraggingId(null)
    if (controlsRef.current) controlsRef.current.enabled = true
    document.body.style.cursor = ''
  }

  useEffect(() => {
    if (!draggingId) return
    const canvas = gl.domElement

    const handleMove = (e: PointerEvent) => {
      if (toolMode === 'move') {
        const rect = canvas.getBoundingClientRect()
        const ndc = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        )
        raycaster.setFromCamera(ndc, camera)
        if (!raycaster.ray.intersectPlane(floorPlane, hitPoint.current)) return
        const { w, d } = dragHalfRef.current
        const halfW = roomW / 2
        const halfD = roomD / 2
        const snap = 0.05
        const rawX = Math.max(-halfW + w, Math.min(halfW - w, hitPoint.current.x))
        const rawZ = Math.max(-halfD + d, Math.min(halfD - d, hitPoint.current.z))
        const x = Math.round(rawX / snap) * snap
        const z = Math.round(rawZ / snap) * snap
        // Only update position if it doesn't overlap another item
        if (!wouldCollide(draggingIdRef.current!, x, z)) {
          dragPosRef.current.set(x, 0, z)
        }
      } else if (toolMode === 'rotate') {
        const deltaX = e.clientX - rotateStartXRef.current
        const rawRot = rotateStartAngleRef.current - deltaX * (Math.PI / 120)
        const step = 5 * (Math.PI / 180)
        dragRotRef.current = Math.round(rawRot / step) * step
      } else if (toolMode === 'scale') {
        const deltaY = scaleStartYRef.current - e.clientY // drag up = bigger
        // Generous bounds: unit-misdetected imports may need large corrections
        const newScale = Math.max(0.05, Math.min(20, scaleStartValueRef.current * Math.pow(2, deltaY / 200)))
        dragScaleRef.current = newScale
      }
    }

    canvas.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', commitDrag)
    return () => {
      canvas.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', commitDrag)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingId, toolMode, roomW, roomD])

  return (
    <>
      {/* An item whose entry no longer resolves — its uploaded model was
          deleted from the library — must render NOTHING. Drawing it anyway
          made it fall through to the catalog fallback model below, leaving a
          phantom table set standing where the deleted furniture had been. */}
      {furniture.filter((item) => !!resolveEntry(item.furniture_id)).map((item) => (
        <Suspense key={item.id} fallback={null}>
          <DraggableFurnitureItem
            item={item}
            isDragging={draggingId === item.id}
            isSelected={selectedId === item.id}
            toolMode={toolMode}
            dragPosRef={dragPosRef}
            dragRotRef={dragRotRef}
            dragScaleRef={dragScaleRef}
            onMeshPointerDown={(e) => startDragFromMesh(item, e)}
            onButtonPointerDown={(e) => startDragFromButton(item, e)}
            onFootprint={handleFootprint}
            selectedPartKey={selectedPart?.itemId === item.id ? selectedPart.partKey : null}
            onSelectPart={onSelectPart}
          />
        </Suspense>
      ))}
    </>
  )
}

// ─── Full room scene ──────────────────────────────────────────────────────────

function shadeCovering(covering: WallCovering, factor: number): WallCovering {
  // Plaster carries no colour of its own — the PBR maps and the scene lights
  // do the shading, so a per-wall tint here would only fight them.
  if (covering.kind === 'plaster') return covering
  if (covering.kind === 'paint') {
    return { kind: 'paint', color: shadeHex(covering.color, factor) }
  }
  if (covering.kind === 'texture') {
    return { ...covering }
  }
  // For oboy, shade the baseColor only (accent stays vivid)
  return { ...covering, baseColor: shadeHex(covering.baseColor, factor) }
}

// ─── N-wall polygon room shell ────────────────────────────────────────────────
//
// Used when the room has non-ABCD wall IDs (e.g. from a RoomPlan scan).
// Renders a polygon floor/ceiling and N wall boxes positioned along each edge.
// Windows/doors and baseboards are omitted for now (Phase 5 enhancement).

function NWallRoomShell({
  geometry,
  H,
  designState,
  selectedWall,
  onWallClick,
}: {
  geometry: RoomGeometry;
  H: number;
  designState: DesignState;
  selectedWall?: string | null;
  onWallClick?: (id: string) => void;
}) {
  const verts = geometry.vertices!
  const n = verts.length

  // Centroid for centering polygon at origin (metres)
  const cxM = verts.reduce((s, [x]) => s + x, 0) / n / 1000
  const czM = verts.reduce((s, [, z]) => s + z, 0) / n / 1000

  // Centred vertices in metres (XZ plane)
  const centred = useMemo(
    () => verts.map(([x, z]) => [x / 1000 - cxM, z / 1000 - czM] as [number, number]),
    // Stable dep: stringify only the numeric values so reference changes don't cause churn
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [verts.map(v => v.join(',')).join(';')]
  )

  // Filter degenerate vertices: near-duplicates AND near-collinear points
  const filteredCentred = useMemo(() => {
    const filtered: [number, number][] = []
    for (let i = 0; i < centred.length; i++) {
      const [x0, z0] = centred[(i - 1 + centred.length) % centred.length]
      const [x1, z1] = centred[i]
      const [x2, z2] = centred[(i + 1) % centred.length]
      const dx1 = x1 - x0, dz1 = z1 - z0
      const dx2 = x2 - x1, dz2 = z2 - z1
      // Skip if near-duplicate successor
      if (Math.sqrt(dx2 * dx2 + dz2 * dz2) < 0.01) continue
      // Skip if near-collinear with neighbours (cross-product area threshold)
      const cross = Math.abs(dx1 * dz2 - dz1 * dx2)
      const mag1 = Math.sqrt(dx1 * dx1 + dz1 * dz1)
      const mag2 = Math.sqrt(dx2 * dx2 + dz2 * dz2)
      if (mag1 > 0 && mag2 > 0 && cross < 0.0001 * mag1 * mag2) continue
      filtered.push([x1, z1])
    }
    return filtered.length > 2 ? filtered : centred
  }, [centred])

  const buildShape = (verts: [number, number][]) => {
    const shape = new THREE.Shape()
    shape.moveTo(verts[0][0], verts[0][1])
    for (let i = 1; i < verts.length; i++) shape.lineTo(verts[i][0], verts[i][1])
    shape.closePath()
    return new THREE.ShapeGeometry(shape)
  }

  const polyGeo = useMemo(() => buildShape(filteredCentred), [filteredCentred])

  const T = 0.02  // polygon walls stay as boxes — 2cm minimum to avoid degenerate geometry

  return (
    <group>
      {/* Floor — ShapeGeometry in XY plane, rotated to XZ at Y=0 */}
      <mesh geometry={polyGeo} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <meshStandardMaterial
          color={FLOOR_COLORS[designState.floorType] ?? '#C9AB7E'}
          roughness={0.8}
        />
      </mesh>

      {/* Ceiling, as a shadow caster only.
          A scanned room is always drawn open-topped, so this never needs to be
          seen — but without it the sun falls straight through the roof onto the
          floor, which is what gave the ABCD rooms away. Writing neither colour
          nor depth keeps it in the shadow map while drawing nothing, so it also
          cannot bring back the bright sliver this mesh was switched off to
          diagnose (that turned out to be a mis-rotated plane in the other room
          shell, fixed there). */}
      <mesh
        geometry={polyGeo}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, H, 0]}
        castShadow
        raycast={noRaycast}
      >
        <meshStandardMaterial
          color={CEILING_DEFAULT}
          roughness={0.95}
          side={THREE.DoubleSide}
          colorWrite={false}
          depthWrite={false}
        />
      </mesh>

      {/* One wall box per polygon edge */}
      {centred.map(([x1, z1], i) => {
        const [x2, z2] = centred[(i + 1) % n]
        const dx = x2 - x1
        const dz = z2 - z1
        const length = Math.sqrt(dx * dx + dz * dz)
        if (length < 0.01) return null

        const wall = geometry.walls[i]
        const wallId = wall?.id ?? String(i)

        // Rotation: atan2(-dz, dx) aligns box local-X with edge direction (dx,dz)
        const ry = Math.atan2(-dz, dx)

        // Alternate shade factor for depth cues (avoid all walls looking identical)
        const shadeFactor = i % 2 === 0 ? 0.92 : 0.82
        const covering = shadeCovering(
          resolveWallCovering(designState.wallCoverings, wallId),
          shadeFactor,
        )
        const baseColor = covering.kind === 'plaster' ? PLASTER_BASE_COLOR
          : covering.kind === 'paint' ? covering.color
          : covering.kind === 'texture' ? covering.color
          : covering.baseColor
        const isSelected = selectedWall === wallId

        return (
          <mesh
            key={wallId}
            position={[(x1 + x2) / 2, H / 2, (z1 + z2) / 2]}
            rotation={[0, ry, 0]}
            castShadow
            receiveShadow
            onClick={() => onWallClick?.(wallId)}
          >
            <boxGeometry args={[length, H, T]} />
            <meshStandardMaterial color={baseColor} roughness={0.85} />
            {isSelected && (
              <lineSegments>
                <edgesGeometry args={[new THREE.BoxGeometry(length + 0.03, H + 0.03, T + 0.03)]} />
                <lineBasicMaterial color="#2563EB" />
              </lineSegments>
            )}
          </mesh>
        )
      })}
    </group>
  )
}

// ─── Full room scene ──────────────────────────────────────────────────────────

export function RoomScene({
  room,
  geometry,
  topView,
  designState,
  showContactShadows,
  composerActive,
  highQuality,
  lightsOn,
  cutaway = 'off',
  selectedWall,
  onWallClick,
  isFloorSelected,
  onFloorClick,
  holdBind,
  plasterWalls = false,
}: {
  room: Room;
  geometry: RoomGeometry;
  topView: boolean;
  designState: DesignState;
  showContactShadows: boolean;
  composerActive: boolean;
  highQuality: boolean;
  lightsOn: boolean;
  cutaway?: CutawayMode;
  selectedWall?: string | null;
  onWallClick?: (id: string) => void;
  isFloorSelected?: boolean;
  onFloorClick?: () => void;
  /** Long-press handler bundles per surface — spread onto wrapping groups so a
   *  press-and-hold on a wall/ceiling/floor opens the radial context menu. */
  holdBind?: (surface: RadialSurface, wallId?: string) => Record<string, unknown>;
  /** Suvoq bosqichi ko'rinishi: barcha devorlar photo-real plaster bilan */
  plasterWalls?: boolean;
}) {
  // Legacy 4-wall ABCD rectangle — use the existing precise rendering.
  // Any other layout (N-wall from RoomPlan) uses NWallRoomShell.
  const isLegacyAbcd =
    geometry.walls.length === 4 &&
    geometry.walls[0]?.id === 'A' &&
    geometry.walls[1]?.id === 'B' &&
    geometry.walls[2]?.id === 'C' &&
    geometry.walls[3]?.id === 'D'

  const wallA = geometry.walls.find((w) => w.id === "A");
  const wallB = geometry.walls.find((w) => w.id === "B");

  // Extents come from the walls themselves: X is wall A, Z is wall B. Reading
  // room.width as X (it is wall B's length) transposed the whole room against
  // its own walls, so an 8×5 room rendered 5×8 — the 3D and the 2D plan then
  // showed different rooms, and openings on wall A sat past its end.
  const { W, D } = roomExtents(geometry, { W: room.length, D: room.width })
  const H = (room.ceiling_height > 0 ? room.ceiling_height : 2.7);
  const T = WALL_T; // thin plane-like walls (shared constant)
  const wallC = geometry.walls.find((w) => w.id === "C");
  const wallD = geometry.walls.find((w) => w.id === "D");

  // Per-wall coverings with depth shading
  const coveringA = shadeCovering(resolveWallCovering(designState.wallCoverings, 'A'), 0.92);
  const coveringB = shadeCovering(resolveWallCovering(designState.wallCoverings, 'B'), 0.82);
  const coveringC = shadeCovering(resolveWallCovering(designState.wallCoverings, 'C'), 0.92);
  const coveringD = shadeCovering(resolveWallCovering(designState.wallCoverings, 'D'), 0.82);

  // Per-wall panel settings
  const panelsA = resolveWallPanel(designState.wallPanels, 'A');
  const panelsB = resolveWallPanel(designState.wallPanels, 'B');
  const panelsC = resolveWallPanel(designState.wallPanels, 'C');
  const panelsD = resolveWallPanel(designState.wallPanels, 'D');

  /*
   * Shell topology — "inner walls smaller in width":
   *
   *   Walls B and D (sides) span the FULL OUTER depth D+2T — they own the
   *   four corners.  Walls A and C (back/front) span only the INNER width W
   *   and fit between B and D.
   *
   *   Top-down plan (T = 0.25 m):
   *
   *     ←D+2T→
   *     ┌─────┐
   *     │ ┌─┐ │  ← Wall A (inner W only)
   *     │ │ │ │  ← B (left) / D (right) own corners + inner strip
   *     │ └─┘ │  ← Wall C (inner W only)
   *     └─────┘
   *
   *   Result:
   *   • Interior L-corners: A inner face (z=±D/2) meets B inner face (x=±W/2)
   *     at a perfect right angle, no overlap.
   *   • Exterior: B/D outer face (x=±(W/2+T)) runs the full outer height
   *     including corners — no exposed end-cap faces, no seams.
   *
   *   Element positions in B/D are stored relative to the interior span D.
   *   Pre-resolve them, then shift by T so they land within the D+2T wall.
   */
  const T_MM = Math.round(T * 1000);
  const elementsBOuter = resolveElementPositions(wallB?.elements ?? [], D * 1000)
    .map(el => ({ ...el, position: el.position + T_MM }));
  const elementsDOuter = resolveElementPositions(wallD?.elements ?? [], D * 1000)
    .map(el => ({ ...el, position: el.position + T_MM }));

  const ceilingRef = useRef<THREE.Mesh | null>(null)

  // Cutaway: which walls are currently hidden (auto = camera-facing, diorama = fixed pair)
  const hiddenWalls = useHiddenWalls(cutaway)
  const cutawayOn = cutaway !== 'off'

  // Top view and the cutaway diorama both look into an open-topped box. That is
  // a viewing convention, not a hole in the building: the room still has a roof,
  // and the sun must still stop at it. Let it through and daylight lands
  // straight on the floor with hard shadows of the walls across it — the
  // giveaway that the "room" is a doll's house.
  //
  // So the ceiling is hidden the only way a shadow caster can be. `visible =
  // false` drops it out of the shadow map (WebGLShadowMap returns early on it),
  // and so does parking it on a layer the camera ignores — casters are culled
  // against the *view* camera's layers, never the shadow camera's, which is why
  // the layer trick this replaces quietly stopped blocking anything. Writing
  // neither colour nor depth leaves it fully present in the pass and draws
  // nothing.
  const ceilingHidden = topView || cutawayOn

  // Invisible must also mean unclickable — otherwise the hidden ceiling
  // swallows every pick in top view, which is where the plan is edited.
  useLayoutEffect(() => {
    const mesh = ceilingRef.current
    if (!mesh) return
    mesh.raycast = ceilingHidden ? noRaycast : THREE.Mesh.prototype.raycast
  }, [ceilingHidden])

  return (
    <group>
      {isLegacyAbcd ? (
        <>
          <group {...(holdBind?.('floor') ?? {})}>
            <WoodFloor
              width={W} depth={D} floorType={designState.floorType}
              floorTexture={designState.floorTexture}
              floorTextureSettings={designState.floorTextureSettings}
              isSelected={isFloorSelected}
              onClick={onFloorClick}
            />
          </group>

          {/* Ceiling — always present for shadow casting; layer 2 in topView hides from camera.
              PlaneGeometry is built in the XY plane with its normal on +Z (see three.js
              PlaneGeometry source: vertices pushed as (x, -y, 0), normals (0, 0, 1)).
              A previous refactor (box→plane, commit e8b4b6b) dropped the rotation that
              the box replaced, leaving this as a giant *vertical* Y-Z slab bisecting the
              room instead of a horizontal ceiling — the real source of the long-standing
              "bright triangular artifact" (a sliver of that mis-oriented slab poking past
              the wall silhouette at grazing angles). Rotating +90° about X lays the plane
              flat in the XZ plane at y = H with its normal pointing down (-Y), i.e. facing
              into the room so FrontSide correctly renders the interior-facing side. */}
          <group {...(holdBind?.('ceiling') ?? {})}>
            <Ceiling
              W={W} D={D} H={H} T={T}
              designId={designState.ceiling?.design ?? DEFAULT_CEILING_DESIGN}
              settings={designState.ceiling?.settings}
              hidden={ceilingHidden}
              meshRef={ceilingRef}
            />
          </group>

          {/* All walls re-enabled */}
          {/* Wall A — back, inner width W only, inner face at z = -D/2 */}
          <WallFade hidden={hiddenWalls.has('A')}>
            <group {...(holdBind?.('wall', 'A') ?? {})}>
              <Wall plaster={plasterWalls} wallId="A" length={W} height={H} thickness={T} covering={coveringA}
                elements={wallA?.elements ?? []} axis="X" cx={0} cz={-(D / 2 + T / 2)}
                isSelected={selectedWall === 'A'} onClick={() => onWallClick?.('A')}
                panelSettings={panelsA} />
            </group>

            {cutawayOn && <WallTopRim length={W} thickness={T} axis="X" cx={0} cz={-(D / 2 + T / 2)} height={H} />}
          </WallFade>

          {/* Wall B — right, full outer depth D+2T (owns corners), inner face at x = +W/2 */}
          <WallFade hidden={hiddenWalls.has('B')}>
            <group {...(holdBind?.('wall', 'B') ?? {})}>
              <Wall plaster={plasterWalls} wallId="B" length={D + 2 * T} height={H} thickness={T} covering={coveringB}
                elements={elementsBOuter} axis="Z" cx={W / 2 + T / 2} cz={0}
                isSelected={selectedWall === 'B'} onClick={() => onWallClick?.('B')}
                panelSettings={panelsB} />
            </group>

            {cutawayOn && <WallTopRim length={D + 2 * T} thickness={T} axis="Z" cx={W / 2 + T / 2} cz={0} height={H} />}
          </WallFade>

          {/* Wall C — front, inner width W only, inner face at z = +D/2 */}
          <WallFade hidden={hiddenWalls.has('C')}>
            <group {...(holdBind?.('wall', 'C') ?? {})}>
              <Wall plaster={plasterWalls} wallId="C" length={W} height={H} thickness={T} covering={coveringC}
                elements={wallC?.elements ?? []} axis="X" cx={0} cz={D / 2 + T / 2}
                isSelected={selectedWall === 'C'} onClick={() => onWallClick?.('C')}
                panelSettings={panelsC} />
            </group>

            {cutawayOn && <WallTopRim length={W} thickness={T} axis="X" cx={0} cz={D / 2 + T / 2} height={H} />}
          </WallFade>

          {/* Wall D — left, full outer depth D+2T (owns corners), inner face at x = -W/2 */}
          <WallFade hidden={hiddenWalls.has('D')}>
            <group {...(holdBind?.('wall', 'D') ?? {})}>
              <Wall plaster={plasterWalls} wallId="D" length={D + 2 * T} height={H} thickness={T} covering={coveringD}
                elements={elementsDOuter} axis="Z" cx={-(W / 2 + T / 2)} cz={0}
                isSelected={selectedWall === 'D'} onClick={() => onWallClick?.('D')}
                panelSettings={panelsD} />
            </group>

            {cutawayOn && <WallTopRim length={D + 2 * T} thickness={T} axis="Z" cx={-(W / 2 + T / 2)} cz={0} height={H} />}
          </WallFade>

          <WindowFrames geometry={geometry} wallWidth={W} wallDepth={D} hiddenWalls={hiddenWalls} />
          <DoorFrames geometry={geometry} wallWidth={W} wallDepth={D} hiddenWalls={hiddenWalls} />
          <Baseboard width={W} depth={D} geometry={geometry} hiddenWalls={hiddenWalls} />
          {/* CornerShadows disabled: real directional shadows now provide corner depth */}
          {false && <CornerShadows width={W} depth={D} composerActive={composerActive} />}

          {/* Diorama frame: floating slab + corner posts outlining the box */}
          {cutawayOn && <>
            <FloorSlab W={W} D={D} T={T} />
            <CornerPosts W={W} D={D} T={T} H={H} />
          </>}
        </>
      ) : (
        /* N-wall polygon room — only available when geometry.vertices is set */
        geometry.vertices && geometry.vertices.length >= 3 ? (
          <NWallRoomShell
            geometry={geometry}
            H={H}
            designState={designState}
            selectedWall={selectedWall}
            onWallClick={onWallClick}
          />
        ) : null
      )}

      <CeilingLights width={W} depth={D} height={H} lightsOn={lightsOn} highQuality={highQuality} />

      {/* Ground contact shadows for furniture grounding */}
      {showContactShadows && (
        <ContactShadows
          position={[0, 0.005, 0]}
          opacity={composerActive ? 0.35 : 0.5}
          scale={Math.max(W, D) * 1.4}
          blur={2.2}
          far={2}
          resolution={512}
          color="#000000"
        />
      )}
    </group>
  );
}

// ─── View presets ─────────────────────────────────────────────────────────────

type ViewPreset = "corner" | "front" | "back" | "top";

const VIEW_LABELS: Record<ViewPreset, string> = {
  corner: "Burchak",
  front:  "Old tomon",
  back:   "3D",
  top:    "Yuqori",
};

/*
 * All perspective presets place the camera INSIDE the room so only the
 * interior wall faces (facing toward the camera) are ever visible — like
 * 3ds Max backface culling.  The orbit radius is clamped to ≤ 88% of the
 * shortest half-dimension so the user can never drag the camera outside.
 *
 * Top view is the only mode that lifts the camera above the room; it is
 * treated as an architectural plan view and gets a relaxed maxDistance.
 */
function getCamera(preset: ViewPreset, W: number, D: number, H: number) {
  const eyeH  = H * 0.56;          // eye-level height inside the room
  const cx     = W * 0.34;          // ~34% from centre toward a side wall
  const cz     = D * 0.34;
  const lookH  = H * 0.42;          // look-at height (slightly below eye)
  switch (preset) {
    // Interior corner: standing near back-left, looking toward front-right
    case "corner": return {
      position: [-cx, eyeH, -cz] as [number,number,number],
      target:   [ cx * 0.3, lookH, cz * 0.3] as [number,number,number],
    };
    // Front wall: standing near front, looking toward back
    case "front": return {
      position: [0, eyeH,  cz] as [number,number,number],
      target:   [0, lookH, -cz * 0.4] as [number,number,number],
    };
    // Back wall: standing near back, looking toward front
    case "back": return {
      position: [0, eyeH,  -cz] as [number,number,number],
      target:   [0, lookH,  cz * 0.4] as [number,number,number],
    };
    // Top / plan view — aerial only
    case "top": return {
      position: [W * 0.08, H * 3.5, 0] as [number,number,number],
      target:   [0, 0, 0]               as [number,number,number],
    };
  }
}

/**
 * Push a framing away from its target so a narrower canvas still shows the
 * whole room.
 *
 * The presets above are written in room units only, so they implicitly assume
 * the wide 3D-tab canvas. The Mebelirovka tab gives the viewport roughly half
 * that width, and a perspective camera's horizontal field of view shrinks with
 * the aspect ratio — same pose, less room visible. Scaling the eye-to-target
 * distance restores the framing. The result is capped at `maxDist` because
 * OrbitControls clamps beyond it, and a target the animator can never reach
 * would leave it lerping forever.
 */
function fitFramingToAspect(
  cam: { position: [number, number, number]; target: [number, number, number] },
  scale: number,
  maxDist: number,
) {
  if (scale <= 1) return cam;
  const [px, py, pz] = cam.position;
  const [tx, ty, tz] = cam.target;
  const dx = px - tx, dy = py - ty, dz = pz - tz;
  const dist = Math.hypot(dx, dy, dz);
  if (dist === 0) return cam;
  const s = Math.min(dist * scale, maxDist * 0.98) / dist;
  return {
    position: [tx + dx * s, ty + dy * s, tz + dz * s] as [number, number, number],
    target: cam.target,
  };
}

// ─── Camera animator (lerp, no Canvas remount) ────────────────────────────────

function CameraAnimator({
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export type { PhaseKey } from "@/lib/phases"

// Touch/mobile studio. The studio is embedded in a mobile WebView, which can
// (wrongly) report a fine pointer — so `(pointer:fine)` is unreliable here.
// Detect real touch capability, plus the same narrow-viewport breakpoint the
// mobile layout uses (lg = 1024px), so the hint matches the responsive chrome.
const isTouch =
  typeof window !== 'undefined' &&
  (('ontouchstart' in window) ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 1023px)').matches))

export default function ThreeDPage() {
  const { room, onSave } = useOutletContext<StudioContext>();
  const { geometry, designState, highQuality3d, resetRoom, placeFurniture, addElement, updateElement, removeElement } = useRoomStore();
  const navigate = useNavigate();
  const [addingRoom, setAddingRoom] = useState(false);

  async function handleAddRoom(side: RoomSide) {
    if (addingRoom) return;
    setAddingRoom(true);
    try { await onSave(); } catch { /* continue even if save fails (offline mode) */ }
    setAddingRoom(false);
    const aptId = room.apartment_id && room.apartment_id !== 'local' ? room.apartment_id : null;
    // Anchor info for directional placement — captured before resetRoom clears it
    const myPos = useRoomStore.getState().layoutPos ?? { x: 0, z: 0 };
    // Carry the current view into the new room's studio (fresh mount there)
    sessionStorage.setItem('uytamir-studio-entry-view', preset);
    // Clear the current room from the store (roomId, draftId, geometry, …).
    // The wizard's handleSave() bails out when roomId is already set, so a
    // stale roomId means the new room is never created via createRoom().
    resetRoom();
    if (aptId) {
      const q = new URLSearchParams({
        apartmentId: aptId,
        side,
        ax: String(myPos.x),
        az: String(myPos.z),
        aw: String(W),
        ad: String(D),
      });
      navigate(`/wizard?${q.toString()}`);
    } else {
      navigate('/wizard');
    }
  }

  // Same orientation the scene uses: X is wall A, Z is wall B
  const { W, D } = roomExtents(geometry, { W: room.length, D: room.width });
  const H = room.ceiling_height > 0 ? room.ceiling_height : 2.7;

  // The add-room flow stashes the view it was started from (usually 'top'),
  // so the NEW room's studio opens in the same framing, centred on the room.
  // The flag is cleared in an effect, NOT in the initializer — StrictMode
  // runs initializers twice and the second pass would lose the value.
  const [preset, setPreset] = useState<ViewPreset>(() =>
    sessionStorage.getItem('uytamir-studio-entry-view') === 'top' ? 'top' : 'back',
  );
  useEffect(() => {
    sessionStorage.removeItem('uytamir-studio-entry-view');
  }, []);
  const [presetVersion, setPresetVersion] = useState(0);
  const [dpr, setDpr] = useState<number | [number, number]>([1, 2]);
  // Two consecutive PerformanceMonitor declines required before killing shadows / composer
  const [declineCount, setDeclineCount] = useState(0);
  const showContactShadows = declineCount < 2;
  const useComposer = highQuality3d && declineCount < 2;
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [lightsOn, setLightsOn] = useState(true);
  const [sceneLightOn, setSceneLightOn] = useState(true);
  // Shared with the walkthrough — see the note on `sunHour` in the store.
  const sunHour = useRoomStore((st) => st.sunHour);
  const setSunHour = useRoomStore((st) => st.setSunHour);
  const today = useMemo(() => dayOfYear(new Date()), []);
  // Site defaults to Tashkent (sunPosition's DEFAULT_SITE), and the room sits
  // in the app's own frame — wall A's outward face is north, the same north
  // AddRoomButtons uses. Between them the arc is fully determined, so there is
  // nothing here for the user to set.
  const sun = useMemo(() => sunPosition({
    hour: sunHour,
    dayOfYear: today,
    peakIntensity: highQuality3d ? 1.3 : 1.0,
  }), [sunHour, today, highQuality3d]);
  const [cutaway, setCutaway] = useState<CutawayMode>('off');
  const [showHelp, setShowHelp] = useState(false);
  // 0 = full quality; 1 = safe-mode retry after a WebGL context failure
  const [glAttempt, setGlAttempt] = useState(0);
  const [selectedFurId, setSelectedFurId] = useState<string | null>(null);
  const [selectedPart, setSelectedPart] = useState<SelectedPart | null>(null);
  const [selectedDoorId, setSelectedDoorId] = useState<string | null>(null);
  const [selectedLightId, setSelectedLightId] = useState<string | null>(null);
  // Fixture armed in the palette; the next click in the 2D plan places it.
  const [armedLightType, setArmedLightType] = useState<LightTypeId | null>(null);
  const [angleInputDeg, setAngleInputDeg] = useState('');
  const furniture = useRoomStore((s) => s.furniture);
  const moveFurniture = useRoomStore((s) => s.moveFurniture);
  const activeLayoutPos = useRoomStore((s) => s.layoutPos);
  // The Mebelirovka and Chiroqlar tabs open the same editor, pre-set to the
  // furnishing / lighting phase
  const location = useLocation();
  const pathname = location.pathname;
  const isMebelTab = pathname.endsWith('/mebel');
  const isChiroqTab = pathname.endsWith('/chiroqlar');
  // Optional starting phase from the URL (?phase=…). The mobile wall-condition
  // step sets it so the studio opens on the first renovation stage that still
  // needs doing (an already-plastered wall skips Suvoq, a puttied wall skips
  // Suvoq + Shpaklovka). Earlier stages then render as done via the existing
  // positional check-mark logic. Falls back to the historical 'boyoq' default.
  const phaseParam = new URLSearchParams(location.search).get('phase')
  const initialPhase: PhaseKey = isMebelTab
    ? 'mebel'
    : isChiroqTab
      ? 'chiroq'
      : RENO_STAGES.some((s) => s.key === phaseParam)
        ? (phaseParam as PhaseKey)
        : 'boyoq'
  const [activePhase, setActivePhase] = useState<PhaseKey>(initialPhase)
  // Mebelirovka: door/window editor sheet (reuses the room settings sheet)
  const [elementsSheetOpen, setElementsSheetOpen] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showAiSheet, setShowAiSheet] = useState(false);
  const [selectedWall, setSelectedWall] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(false);

  // ── Surface radial menu (long-press "aylana" on a wall/ceiling/floor) ──
  // The top phase-stepper is hidden (see SHOW_PHASE_STEPPER); design actions
  // are reached by pressing-and-holding a surface, which opens a ring of
  // context icons at the press point.
  const [radial, setRadial] = useState<
    { surface: RadialSurface; wallId?: string; x: number; y: number; point?: { x: number; y: number; z: number } } | null
  >(null);
  // World-space hit point of the press, captured from the raycast so a created
  // window/door lands exactly where the wall was touched.
  const holdPoint = useRef<{ x: number; y: number; z: number } | null>(null);
  // Currently-selected window/door (for the move/edit/delete toolbar).
  const [selOpening, setSelOpening] = useState<OpeningSel | null>(null);
  const holdTimer = useRef<number | null>(null);
  const holdStart = useRef<{ x: number; y: number } | null>(null);
  // True from the moment a long-press fires until the next surface click, so
  // the click that ends the hold doesn't ALSO run the tap-select behaviour.
  const heldRef = useRef(false);

  // ── Drop a model file straight into the room ────────────────────────
  // Imported like a picked file, then placed immediately and the Mebel phase
  // opened, so the dropped object is both visible and editable in one gesture.
  const { importFiles: importModelFiles, status: modelDropStatus, warn: modelDropWarn } = useModelImport();
  const { isOver: modelDropOver, dropProps: viewportDropProps } = useFileDrop({
    accept: (f) => MODEL_FILE_RE.test(f.name),
    disabled: modelDropStatus === 'loading',
    onDrop: (files) => {
      if (!files.some((f) => /\.(glb|gltf|obj|fbx)$/i.test(f.name))) return;
      void importModelFiles(files).then((entryId) => {
        if (!entryId) return;
        const placed = useRoomStore.getState().furniture.length;
        placeFurniture({
          id: nanoid(),
          furniture_id: entryId,
          x: (placed * 300) % 1000,
          y: (placed * 300) % 1000,
          rotation: 0,
        });
        setActivePhase('mebel');
      });
    },
  });

  /**
   * Select a wall (or the floor) and, from a decorating phase, open the paint
   * panel for it — that jump is the whole point of clicking a surface there.
   *
   * Phases that own the panel for a placement workflow keep it. Forcing
   * 'boyoq' unconditionally meant one stray click on a wall replaced the
   * lighting panel mid-task, and since nothing switched back, the fixtures the
   * user was placing became unreachable.
   */
  function focusSurface(id: string) {
    // Highlight the surface + drop any selected window/door. The design
    // actions themselves now live in the radial menu (openSurfaceMenu), which
    // opens on the same click — so we no longer force the paint panel here.
    setSelOpening(null);
    setSelectedWall(id);
  }

  /**
   * Open the surface radial ("aylana") menu at the tap/click point. This is the
   * PRIMARY trigger now (works with a single mouse click on desktop and a tap
   * on touch); the long-press path below still works as an alternative. The
   * click carries the R3F world hit (`e.point`) so a created window/door lands
   * exactly where the surface was tapped.
   */
  function openSurfaceMenu(surface: RadialSurface, wallId: string | undefined, e: any) {
    // If a long-press already opened the menu, its trailing click must not
    // reopen/replace it.
    if (heldRef.current) { heldRef.current = false; return; }
    const x = e?.nativeEvent?.clientX ?? e?.clientX ?? 0;
    const y = e?.nativeEvent?.clientY ?? e?.clientY ?? 0;
    const point = e?.point ? { x: e.point.x, y: e.point.y, z: e.point.z } : (holdPoint.current ?? undefined);
    if (controlsRef.current) controlsRef.current.enabled = false;
    setRadial({ surface, wallId, x, y, point });
  }
  const addSheetSection: 'wallpaper' | 'lyustra' | 'furniture' =
    activePhase === 'boyoq' ? 'wallpaper' : activePhase === 'montaj' ? 'lyustra' : 'furniture';
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // ── Long-press detection on 3D surfaces ─────────────────────────────
  // R3F pointer events bubble from the surface meshes up to the wrapping
  // <group>s that spread these handlers. A ~460ms hold that doesn't drift
  // opens the radial menu at the press point; any real drag (camera orbit)
  // cancels it first.
  const HOLD_MS = 460;
  const HOLD_MOVE_TOL = 12; // px of finger travel that still counts as a hold
  function clearHold() {
    if (holdTimer.current != null) { window.clearTimeout(holdTimer.current); holdTimer.current = null; }
    holdStart.current = null;
  }
  function startHold(surface: RadialSurface, wallId: string | undefined, e: { nativeEvent?: PointerEvent; clientX?: number; clientY?: number; point?: { x: number; y: number; z: number }; stopPropagation?: () => void }) {
    const cx = e.nativeEvent?.clientX ?? e.clientX ?? 0;
    const cy = e.nativeEvent?.clientY ?? e.clientY ?? 0;
    // The R3F event's world intersection point — where on the wall it was hit.
    holdPoint.current = e.point ? { x: e.point.x, y: e.point.y, z: e.point.z } : null;
    holdStart.current = { x: cx, y: cy };
    clearHoldTimerOnly();
    holdTimer.current = window.setTimeout(() => {
      heldRef.current = true;
      // Freeze the camera so menu taps don't orbit the room, and drop any
      // active selection highlight noise.
      if (controlsRef.current) controlsRef.current.enabled = false;
      setRadial({ surface, wallId, x: cx, y: cy, point: holdPoint.current ?? undefined });
    }, HOLD_MS);
  }
  function clearHoldTimerOnly() {
    if (holdTimer.current != null) { window.clearTimeout(holdTimer.current); holdTimer.current = null; }
  }
  function moveHold(e: { nativeEvent?: PointerEvent; clientX?: number; clientY?: number }) {
    if (!holdStart.current) return;
    const cx = e.nativeEvent?.clientX ?? e.clientX ?? 0;
    const cy = e.nativeEvent?.clientY ?? e.clientY ?? 0;
    if (Math.hypot(cx - holdStart.current.x, cy - holdStart.current.y) > HOLD_MOVE_TOL) clearHold();
  }
  function closeRadial() {
    setRadial(null);
    if (controlsRef.current) controlsRef.current.enabled = true;
    // Safety net: if the trailing click never arrived, don't leave the guard
    // armed or the next genuine tap would be swallowed.
    heldRef.current = false;
  }
  /** Pointer handlers to spread onto a surface's wrapping <group>. */
  function holdBind(surface: RadialSurface, wallId?: string) {
    return {
      onClick: (e: any) => openSurfaceMenu(surface, wallId, e),
      onPointerDown: (e: any) => startHold(surface, wallId, e),
      onPointerMove: (e: any) => moveHold(e),
      onPointerUp: () => clearHold(),
      onPointerLeave: () => clearHold(),
      onPointerCancel: () => clearHold(),
    };
  }

  /**
   * The four rectangular walls in the room's own frame. Each wall runs along
   * one world axis; its "left edge" (where local `position` = 0) is at
   * `centerAlong − length/2` on that axis. This is the single source of truth
   * for converting a world raycast hit into a wall-local (u = along, v = up)
   * coordinate — so a created opening is pinned to the clicked wall and can
   * never be computed against another wall.
   */
  function wallGeom(wallId: string): { axis: 'X' | 'Z'; length: number; leftAlong: number } | null {
    switch (wallId) {
      case 'A': return { axis: 'X', length: W, leftAlong: -W / 2 };
      case 'C': return { axis: 'X', length: W, leftAlong: -W / 2 };
      case 'B': return { axis: 'Z', length: D, leftAlong: -D / 2 };
      case 'D': return { axis: 'Z', length: D, leftAlong: -D / 2 };
      default: return null;
    }
  }

  /**
   * Create a window ('deraza') or door ('eshik') ON the given wall, centred on
   * the world hit `point`, in the wall's LOCAL coordinate system:
   *   position    = mm from the wall's left edge to the opening's left edge
   *   sill_height = mm from the floor to the opening's bottom (doors: always 0)
   * Both are clamped so the opening stays fully within the wall. Because we key
   * `addElement(wallId, …)` and store only wall-local numbers, the opening is
   * bound to this wall and cannot jump to another.
   */
  function createOpening(wallId: string, point: { x: number; y: number; z: number } | undefined, type: 'deraza' | 'eshik') {
    const g = wallGeom(wallId);
    if (!g || !point) return;
    const isDoor = type === 'eshik';
    const widthMm = 900;
    const heightMm = isDoor ? 2100 : 1200;
    const wallLenMm = g.length * 1000;
    const wallHMm = H * 1000;

    // Along-wall hit → left-edge offset, centred on the click.
    const along = g.axis === 'X' ? point.x : point.z;      // metres, world
    const uMm = (along - g.leftAlong) * 1000;              // mm from left edge
    const position = Math.max(0, Math.min(wallLenMm - widthMm, uMm - widthMm / 2));

    // Vertical: doors sit on the floor; windows centre on the hit height.
    let sill_height = 0;
    if (!isDoor) {
      const vMm = point.y * 1000;
      sill_height = Math.max(0, Math.min(wallHMm - heightMm, vMm - heightMm / 2));
    }

    addElement(wallId, { type, width: widthMm, height: heightMm, sill_height, position });
    setSelectedWall(wallId);
  }

  /** The context actions offered for each surface. Each opens the matching
   *  existing panel/sheet — the exact wiring is easy to retarget later. */
  function buildRadialItems(r: { surface: RadialSurface; wallId?: string; point?: { x: number; y: number; z: number } }): RadialItem[] {
    if (r.surface === 'wall') {
      return [
        {
          key: 'paint', label: 'Rang', icon: RadialIcons.paint,
          onSelect: () => { setSelectedWall(r.wallId ?? 'ALL'); setActivePhase('boyoq'); setShowPanel(true); },
        },
        {
          key: 'window', label: 'Oyna', icon: RadialIcons.window,
          onSelect: () => { if (r.wallId) createOpening(r.wallId, r.point, 'deraza'); },
        },
        {
          key: 'door', label: 'Eshik', icon: RadialIcons.door,
          onSelect: () => { if (r.wallId) createOpening(r.wallId, r.point, 'eshik'); },
        },
      ];
    }
    if (r.surface === 'ceiling') {
      return [
        {
          key: 'light', label: 'Chiroq', icon: RadialIcons.light,
          onSelect: () => { setActivePhase('chiroq'); setShowPanel(true); },
        },
        {
          key: 'ceiling', label: 'Shift turi', icon: RadialIcons.ceiling,
          onSelect: () => { setSelectedWall('CEILING'); setActivePhase('boyoq'); setShowPanel(true); },
        },
      ];
    }
    // floor
    return [
      {
        key: 'object', label: 'Narsa', icon: RadialIcons.add,
        onSelect: () => setShowAddSheet(true),
      },
      {
        key: 'floor', label: 'Pol turi', icon: RadialIcons.floor,
        onSelect: () => { setSelectedWall('FLOOR'); setActivePhase('pol'); setShowPanel(true); },
      },
    ];
  }

  // Live aspect ratio of the 3D canvas. The Mebelirovka tab hands the viewport
  // only half the width, so the framing has to be recomputed per tab instead of
  // being derived from the room dimensions alone.
  const canvasBoxRef = useRef<HTMLDivElement | null>(null);
  const [canvasAspect, setCanvasAspect] = useState(16 / 9);
  const lastCanvasWidth = useRef(0);
  useEffect(() => {
    const el = canvasBoxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      setCanvasAspect(width / height);
      // Any tab switch resizes this slot under a camera that keeps its old
      // pose, so the room ends up off to one side. Re-run the framing whenever
      // the width really changes — keyed on size rather than on which tab is
      // open, so it covers both directions and survives a remount.
      const prev = lastCanvasWidth.current;
      lastCanvasWidth.current = width;
      if (prev > 0 && Math.abs(width - prev) / prev > 0.05) {
        setPresetVersion((n) => n + 1);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 1 on a comfortably wide canvas, growing as it narrows. Capped so a very
  // slim viewport doesn't fling the camera into the far plane.
  const fitScale = useMemo(() => {
    const REF_ASPECT = 1.6;
    return canvasAspect >= REF_ASPECT ? 1 : Math.min(REF_ASPECT / canvasAspect, 2.2);
  }, [canvasAspect]);

  const topView = preset === "top";

  // Sibling rooms for the top-view floor plan (fetched outside the Canvas —
  // contexts don't bridge into the R3F tree)
  const aptId = room.apartment_id && room.apartment_id !== 'local' ? room.apartment_id : null;
  const queryClient = useQueryClient();
  const { data: aptRooms } = useQuery({
    queryKey: ['apt-rooms', aptId],
    queryFn: () => getRooms(aptId!),
    enabled: topView && !!aptId,
    staleTime: 5_000,
  });

  async function handleDeleteSibling(id: string, name: string) {
    if (!window.confirm(`"${name}" xonasini o'chirishni tasdiqlaysizmi? Bu amalni qaytarib bo'lmaydi.`)) return;
    try {
      await deleteRoom(id);
      queryClient.invalidateQueries({ queryKey: ['apt-rooms', aptId] });
    } catch (err) {
      alert("Xonani o'chirib bo'lmadi: " + (err instanceof Error ? err.message : 'xato'));
    }
  }

  // Backfill: legacy rooms have no stored position. Assign this room its slot
  // in the shared absolute frame so the "+ add room" anchor math and the
  // sibling rendering agree; the next save persists it.
  useEffect(() => {
    if (!aptRooms) return;
    const s = useRoomStore.getState();
    if (s.layoutPos || s.roomId !== room.id) return;
    const pos = computeAbsolutePositions(aptRooms, room.id, W, D).get(room.id);
    if (pos) s.setLayoutPos(pos);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aptRooms, room.id]);

  const cam = useMemo(() => {
    // Cutaway modes view the room from OUTSIDE as a three-quarter product shot
    if (cutaway !== 'off' && preset !== 'top') {
      return fitFramingToAspect({
        position: [W * 0.9 + 2.5, H * 1.8, D * 0.9 + 2.5] as [number, number, number],
        target: [0, H * 0.32, 0] as [number, number, number],
      }, fitScale, Math.max(W, D) * 4 + 6);
    }
    const base = getCamera(preset, W, D, H);
    // Only the aerial framing is re-fitted: the corner/front/back presets stand
    // the camera inside the room, where pulling back would push it through a
    // wall rather than reveal more of the floor.
    return preset === 'top'
      ? fitFramingToAspect(base, fitScale, Math.max(W, D) * 4)
      : base;
  }, [preset, cutaway, W, D, H, fitScale]);

  // Keyboard shortcuts — desktop power-user navigation
  const selectedFurIdRef = useRef<string | null>(null);
  selectedFurIdRef.current = selectedFurId;
  const selectedPartRef = useRef<SelectedPart | null>(null);
  selectedPartRef.current = selectedPart;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      switch (e.key.toLowerCase()) {
        case '1': setToolMode('select'); break;
        case '2': setToolMode('move'); break;
        case '3': setToolMode('rotate'); break;
        case '4': setToolMode('scale'); break;
        case '5': setToolMode('part'); break;
        case 't': setPreset((p) => (p === 'top' ? 'back' : 'top')); setPresetVersion((n) => n + 1); break;
        case 'k': setCutaway((m) => (m === 'off' ? 'auto' : m === 'auto' ? 'diorama' : 'off')); break;
        case 'n': setSceneLightOn((v) => !v); break;
        case 'l': setLightsOn((v) => !v); break;
        case 'f':
        case 'home': setPresetVersion((n) => n + 1); break;
        case 'delete':
        case 'backspace': {
          // A selected part takes precedence over the whole item
          const part = selectedPartRef.current;
          if (part) {
            useRoomStore.getState().hideFurniturePart(part.itemId, part.partKey);
            setSelectedPart(null);
            break;
          }
          const id = selectedFurIdRef.current;
          if (id) {
            useRoomStore.getState().removeFurniture(id);
            setSelectedFurId(null);
          }
          break;
        }
        case 'escape': setSelectedPart(null); setSelectedFurId(null); setSelectedWall(null); setShowHelp(false); break;
        case '?': setShowHelp((v) => !v); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Leaving part mode (or switching rooms) drops any live part selection
  useEffect(() => {
    if (toolMode !== 'part') setSelectedPart(null);
  }, [toolMode]);
  useEffect(() => { setSelectedPart(null); }, [room.id]);

  // Recenter the camera on the room's centre when the cutaway mode changes or
  // a DIFFERENT room loads (switching rooms only changes the :roomId param —
  // the page does not remount, so pan/orbit drift would otherwise carry over).
  // Skips the mount pass: the initial framing comes from initCam, not an
  // animation.
  const camKeyRef = useRef<{ roomId: string; cutaway: CutawayMode } | null>(null);
  useEffect(() => {
    const prev = camKeyRef.current;
    camKeyRef.current = { roomId: room.id, cutaway };
    if (!prev) return;
    if (prev.roomId !== room.id || prev.cutaway !== cutaway) {
      setPresetVersion((n) => n + 1);
    }
  }, [room.id, cutaway]);

  // Limit orbit radius to shorter room dimension so camera stays inside
  const interiorMaxDist = Math.min(W, D) * 0.85;
  // Top view: keep camera above ceiling — ceiling is hidden so user can scroll "through" it
  const topMinDist = H * 2.4;
  const maxPolarAngle = Math.PI * 0.88;

  // Initial camera position — only used on first mount
  const initCam = useMemo(
    () => getCamera("corner", W, D, H),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const activeIdx = RENO_STAGES.findIndex(s => s.key === activePhase);

  // The renovation phase stepper is superseded by the per-surface radial menu
  // (long-press a wall/ceiling/floor). Flip to true to bring the top stepper
  // back. The view/camera toolbar below it is kept.
  const SHOW_PHASE_STEPPER = false;

  return (
    <div className="flex flex-col lg:flex-row h-full">

      {/* ── Mobile: horizontal phase strip (hidden — replaced by surface radial menu) ── */}
      {SHOW_PHASE_STEPPER && (
      <div className="flex lg:hidden shrink-0 overflow-x-auto bg-surface border-b border-gray-200 select-none" style={{ scrollbarWidth: 'none' }}>
        {RENO_STAGES.map((stage, i) => {
          const status = i < activeIdx ? 'done' : i === activeIdx ? 'current' : 'pending';
          return (
            <button
              key={stage.key}
              onClick={() => setActivePhase(stage.key)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 lg:py-2.5 text-[11px] font-semibold whitespace-nowrap border-b-2 transition-colors ${
                status === 'current' ? 'border-brand text-brand' :
                status === 'done'    ? 'border-transparent text-success' :
                                       'border-transparent text-gray-400'
              }`}
            >
              {status === 'done' && (
                <svg width="10" height="10" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1.5 5.5l3 3 5-5"/>
                </svg>
              )}
              {status === 'current' && <span className="w-1.5 h-1.5 rounded-full bg-brand inline-block" />}
              {stage.label}
            </button>
          );
        })}
      </div>
      )}

      {/* ── Desktop: left phase stepper sidebar (hidden — replaced by surface radial menu) ── */}
      {SHOW_PHASE_STEPPER && (
      <nav className="hidden lg:flex w-36 shrink-0 bg-surface border-r border-gray-200 flex-col pt-3 select-none">
        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest px-4 mb-2">Bosqichlar</p>
        {RENO_STAGES.map((stage, i) => {
          const status = i < activeIdx ? 'done' : i === activeIdx ? 'current' : 'pending';
          return (
            <button
              key={stage.key}
              onClick={() => setActivePhase(stage.key)}
              className={`w-full flex items-center gap-2 px-4 py-2.5 text-[12px] font-semibold text-left transition-colors ${
                status === 'current'
                  ? 'bg-brand text-white'
                  : status === 'done'
                  ? 'text-success hover:bg-gray-50'
                  : 'text-gray-400 hover:bg-gray-50'
              }`}
            >
              {status === 'done' && (
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M1.5 5.5l3 3 5-5"/>
                </svg>
              )}
              {status === 'current' && (
                <span className="w-2 h-2 rounded-full bg-white/90 animate-pulse inline-block shrink-0" />
              )}
              {status === 'pending' && (
                <span className="w-2 h-2 rounded-full bg-gray-300 inline-block shrink-0" />
              )}
              <span className="leading-tight">{stage.label}</span>
            </button>
          );
        })}
      </nav>
      )}

      {/* ── Center: toolbar + canvas ─────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Toolbar */}
        <div className="flex items-center gap-2 lg:gap-1.5 px-2 lg:px-4 py-1 lg:py-2 bg-surface border-b border-gray-200 shrink-0 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          <span className="text-xs font-medium text-gray-500 mr-0.5 shrink-0 hidden sm:block">Ko'rinish:</span>
          {(["back", "top"] as ViewPreset[]).map((v) => (
            <button
              key={v}
              onClick={() => { setPreset(v); setPresetVersion(n => n + 1) }}
              className={`shrink-0 px-2.5 py-1 rounded-full text-xs transition-colors ${
                preset === v
                  ? "bg-brand text-white font-medium"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-700"
              }`}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
          {/* Open the tools + design drawer. Every view/edit control now
              lives inside it, so the viewport stays clean. */}
          <button
            onClick={() => setShowPanel(v => !v)}
            title="Asboblar va dizayn"
            className={`ml-auto flex items-center justify-center gap-1.5 px-3 py-2 lg:py-1.5 min-h-[44px] lg:min-h-0 rounded-full text-xs font-medium transition-colors shrink-0 border ${
              showPanel ? 'bg-brand text-white border-brand' : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            <span>Sozlamalar</span>
          </button>
        </div>

        {/* Canvas area */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* Mebelirovka: 2D plan editor beside the live 3D viewport */}
        {isMebelTab && (
          <div className="h-[38%] lg:h-auto lg:w-1/2 min-h-0 shrink-0 border-b lg:border-b-0 lg:border-r border-gray-200 bg-[#F6F4EF]">
            <MebelPlanView />
          </div>
        )}
        {/* Chiroqlar: reflected ceiling plan beside the live 3D viewport */}
        {isChiroqTab && (
          <div className="h-[38%] lg:h-auto lg:w-1/2 min-h-0 shrink-0 border-b lg:border-b-0 lg:border-r border-gray-200 bg-[#F6F4EF]">
            <ChiroqPlanView
              armedType={armedLightType}
              onPlaced={() => setArmedLightType(null)}
              selectedId={selectedLightId}
              onSelect={setSelectedLightId}
            />
          </div>
        )}
        {/* min-w-0 is load-bearing: R3F sets a pixel width/height ON the canvas
            element, which becomes its intrinsic size. A flex item defaults to
            min-width:auto, so once the canvas had been sized for the full-width
            3D tab, this column refused to shrink below that width when the plan
            editor claimed half the row — the canvas kept its old width, spilled
            under the design panel, and the centred render ended up off to the
            right. overflow-hidden keeps any future spill inside the slot. */}
        <div ref={canvasBoxRef} className="flex-1 min-w-0 min-h-0 relative overflow-hidden" {...viewportDropProps}>

          {/* Model drag & drop over the viewport */}
          {(modelDropOver || modelDropStatus === 'loading') && (
            <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-brand/10 backdrop-blur-[1px] border-4 border-dashed border-brand rounded-lg">
              <div className="bg-white/95 rounded-2xl px-6 py-4 shadow-xl text-center">
                <p className="text-2xl mb-1">{modelDropStatus === 'loading' ? '⏳' : '📦'}</p>
                <p className="text-sm font-bold text-gray-900">
                  {modelDropStatus === 'loading' ? 'Model yuklanmoqda...' : "Modelni xonaga qo'yib yuboring"}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">GLB · GLTF · OBJ · FBX (+ teksturalari)</p>
              </div>
            </div>
          )}
          {modelDropWarn && (
            <p className="absolute top-3 left-1/2 -translate-x-1/2 z-40 max-w-[80%] bg-amber-50 border border-amber-200 text-amber-700 text-[11px] px-3 py-1.5 rounded-lg shadow">
              {modelDropWarn}
            </p>
          )}

          {/* Hint overlay — bottom-left of canvas */}
          <p className="absolute bottom-16 left-4 z-10 text-[10px] text-gray-500/70 pointer-events-none select-none">
            {isTouch
              ? "Bir barmoq: aylantirish · Ikki barmoq: surish/masshtab · 2× bosish: fokus"
              : "Chap: aylantirish · O'ng: surish · G'ildirak: zoom · 2× bosish: fokus"}
          </p>

          {/* Navigation help card */}
          {showHelp && (
            <div className="absolute top-3 right-3 z-30 w-72 max-w-[90%] bg-white/97 backdrop-blur rounded-2xl shadow-xl border border-gray-200 p-4 text-[12px] leading-5 text-gray-700">
              <div className="flex items-center justify-between mb-2">
                <p className="font-bold text-gray-900">Boshqaruv</p>
                <button onClick={() => setShowHelp(false)} className="text-gray-400 hover:text-gray-600 font-bold">✕</button>
              </div>
              <p className="font-semibold text-gray-500 text-[10px] uppercase tracking-wide mb-1">Sichqoncha</p>
              <ul className="space-y-0.5 mb-2">
                <li>Chap tugma — aylantirish</li>
                <li>O'ng / o'rta tugma — surish</li>
                <li>G'ildirak — yaqinlashtirish</li>
                <li>Ikki marta bosish — shu nuqtaga fokus</li>
                <li>Bo'sh joyga ikki marta — markazga qaytish</li>
                <li>Pastki o'ngdagi o'qlar — ko'rinishni burish</li>
              </ul>
              <p className="font-semibold text-gray-500 text-[10px] uppercase tracking-wide mb-1">Sensor ekran</p>
              <ul className="space-y-0.5 mb-2">
                <li>Bir barmoq — aylantirish</li>
                <li>Ikki barmoq — surish va masshtab</li>
              </ul>
              <p className="font-semibold text-gray-500 text-[10px] uppercase tracking-wide mb-1">Klaviatura</p>
              <ul className="space-y-0.5">
                <li><b>1–5</b> — Tanlash / Siljitish / Aylantirish / O'lcham / Qismlar</li>
                <li><b>T</b> — Yuqoridan / 3D &nbsp; <b>K</b> — Kesma</li>
                <li><b>N</b> — Kun/Tun &nbsp; <b>L</b> — Chiroqlar</li>
                <li><b>F</b> — Markazlash &nbsp; <b>Del</b> — O'chirish</li>
                <li><b>Esc</b> — bekor qilish</li>
              </ul>
            </div>
          )}

          {/* Mebelirovka quick actions — doors/windows editor + 3D model import */}
          {isMebelTab && (
            <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
              <button
                onClick={() => setElementsSheetOpen(true)}
                title="Eshik va derazalarni qo'shish yoki tahrirlash"
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/95 border border-gray-200 shadow-md text-[12px] font-semibold text-gray-700 hover:bg-white transition-colors"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="3" width="9" height="18" rx="1" />
                  <circle cx="10.5" cy="12" r="0.8" fill="currentColor" />
                  <rect x="16" y="6" width="5" height="7" rx="0.5" />
                  <path d="M18.5 6v7M16 9.5h5" />
                </svg>
                Eshik / Deraza
              </button>
              <div className="[&>button]:w-full">
                <ModelImportButton compact />
              </div>
            </div>
          )}

          {/* Bottom CTA */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
            <button
              onClick={() => setShowAddSheet(true)}
              className="pointer-events-auto flex items-center gap-2 px-6 py-3 text-white rounded-[20px] font-bold text-[15px] active:scale-[0.97] transition-transform"
              style={{ background: "linear-gradient(135deg,#F97316 0%,#EA580C 100%)", boxShadow: "0 12px 28px -8px rgba(249,115,22,.65)" }}
            >
              <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <path d="M8.5 2.5v12M2.5 8.5h12"/>
              </svg>
              Buyum qo'shish
            </button>
          </div>

        <CanvasErrorBoundary
          key={glAttempt}
          onError={() => {
            // One automatic retry with safer GL settings — pressured iGPUs
            // often accept a modest context after refusing the fancy one
            if (glAttempt === 0) setTimeout(() => setGlAttempt(1), 150);
          }}
        >
        <Canvas
          shadows="soft"
          camera={{ position: initCam.position, fov: 45, near: 0.1, far: 60 }}
          // Absolute, so the canvas is out of flow and its pixel width can
          // never feed back into the layout that sizes it. In flow, R3F's
          // width/height attributes act as the element's intrinsic size, and
          // the flex column then refuses to shrink past the size the canvas
          // already had — the viewport and the canvas disagree, and the
          // centred render drifts out of the visible slot on every tab switch.
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          gl={{
            antialias: glAttempt === 0,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.15,
            outputColorSpace: THREE.SRGBColorSpace,
            powerPreference: glAttempt === 0 ? 'high-performance' : 'default',
          }}
          onPointerMissed={() => { setSelectedFurId(null); setSelectedPart(null); setSelectedDoorId(null); setSelectedLightId(null); }}
          dpr={glAttempt === 0 ? dpr : 1}
        >
          {/* Drop resolution during interaction, restore at rest */}
          <AdaptiveDpr />
          <AdaptiveEvents />
          <KeepAutoClear />
          <DevSceneHandle />
          {/* Return the WebGL context slot immediately on tab switches */}
          <ReleaseGLOnUnmount />
          {/* Daylight shows the generated sky (BrandedSky below owns
              scene.background); a flat colour here would simply paint over it.
              With the scene light switched off there is no sky, so the solid
              fill is still what stands in for one. */}
          {!sceneLightOn && <color attach="background" args={["#14171F"]} />}
          {/* Fog matches the background (night fog was beige on a dark scene)
              and relaxes in top view where the camera legitimately sits far */}
          <fog
            attach="fog"
            args={[sceneLightOn ? skyFogColor(sun) : "#14171F", topView ? 40 : 12, topView ? 120 : 30]}
          />

          {/* Infinite workspace grid — only shown in top-down (Yuqori) view */}
          {topView && (
            <>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.003, 0]}>
                <planeGeometry args={[200, 200]} />
                <meshBasicMaterial color="#888888" />
              </mesh>
              <Grid
                position={[0, -0.002, 0]}
                infiniteGrid
                cellSize={0.1}
                cellThickness={0.4}
                cellColor="#ffffff"
                sectionSize={1}
                sectionThickness={0.8}
                sectionColor="#ffffff"
                fadeDistance={28}
                fadeStrength={1.4}
              />
            </>
          )}

          <PerformanceMonitor
            onDecline={() => {
              setDpr(1);
              setDeclineCount(n => n + 1);
            }}
            onIncline={() => {
              // Quality recovers after transient hitches (texture uploads etc.)
              setDpr([1, 2]);
              setDeclineCount(n => Math.max(0, n - 1));
            }}
          />

          <Suspense fallback={null}>
            {sceneLightOn && (
              <>
                <SceneLighting
                  width={W}
                  depth={D}
                  height={H}
                  highQuality={highQuality3d}
                  sun={sun}
                />
                <BrandedSky sun={sun} />
              </>
            )}
            {/* Scene light off: barely-visible ambient so the room stays navigable;
                the room's own lamps (lightsOn) become the dominant light source */}
            {!sceneLightOn && <ambientLight intensity={0.08} color="#8090B0" />}

            <RoomScene
              room={room}
              geometry={geometry}
              topView={topView}
              designState={designState}
              showContactShadows={showContactShadows}
              composerActive={useComposer}
              highQuality={highQuality3d}
              lightsOn={lightsOn}
              plasterWalls={activePhase === 'suvoq'}
              cutaway={topView ? 'off' : cutaway}
              selectedWall={selectedWall}
              onWallClick={(id) => focusSurface(id)}
              isFloorSelected={selectedWall === 'FLOOR'}
              onFloorClick={() => focusSurface('FLOOR')}
              holdBind={holdBind}
            />
            {/* Interactive window/door editing layer (select → toolbar → drag
                with live meter labels + Canva-style snap guides). */}
            <WallOpenings
              geometry={geometry}
              W={W}
              D={D}
              H={H}
              selected={selOpening}
              onSelect={setSelOpening}
              updateElement={updateElement}
              removeElement={removeElement}
              onInteracting={(active) => { if (controlsRef.current) controlsRef.current.enabled = !active; }}
            />
            <SwapButtons W={W} D={D} H={H} />
            {topView && <AddRoomButtons W={W} D={D} H={H} onAdd={handleAddRoom} disabled={addingRoom} />}
            {topView && aptRooms && (
              <SiblingRooms
                rooms={aptRooms}
                activeId={room.id}
                activeW={W}
                activeD={D}
                activePos={activeLayoutPos}
                onOpen={async (id) => {
                  // Persist the current room before switching so edits survive
                  try { await onSave(); } catch { /* offline — switch anyway */ }
                  navigate(`/studio/${id}`);
                }}
                onDelete={handleDeleteSibling}
              />
            )}
            <DraggableFurnitureModels controlsRef={controlsRef} roomW={W} roomD={D} toolMode={toolMode} selectedId={selectedFurId} onSelectItem={setSelectedFurId} selectedPart={selectedPart} onSelectPart={setSelectedPart} />
            <DraggableElectricalModels controlsRef={controlsRef} W={W} D={D} />
            <OpeningLayer
              geometry={geometry}
              W={W}
              D={D}
              cutaway={topView ? 'off' : cutaway}
              toolMode={toolMode}
              controlsRef={controlsRef}
              selectedId={selectedDoorId}
              onSelect={setSelectedDoorId}
            />
            <DraggableLightModels controlsRef={controlsRef} roomW={W} roomD={D} roomH={H} lightsOn={lightsOn} highQuality={highQuality3d} selectedId={selectedLightId} onSelect={setSelectedLightId} />

            <RealismEffects enabled={useComposer} />

            <OrbitControls
              ref={controlsRef}
              makeDefault
              target={initCam.target}
              enableDamping
              dampingFactor={0.06}
              enablePan
              panSpeed={0.9}
              screenSpacePanning
              zoomToCursor
              mouseButtons={{
                LEFT: THREE.MOUSE.ROTATE,
                MIDDLE: THREE.MOUSE.PAN,
                RIGHT: THREE.MOUSE.PAN,
              }}
              minDistance={topView ? topMinDist : cutaway !== 'off' ? 2 : 0.25}
              maxDistance={topView ? Math.max(W, D) * 4 : cutaway !== 'off' ? Math.max(W, D) * 4 + 6 : interiorMaxDist}
              maxPolarAngle={topView ? Math.PI * 0.3 : cutaway !== 'off' ? Math.PI * 0.46 : maxPolarAngle}
              minPolarAngle={topView ? 0 : 0.08}
              rotateSpeed={topView ? 0.6 : cutaway !== 'off' ? 0.5 : isTouch ? 0.45 : -0.45}
              zoomSpeed={0.8}
            />

            <CameraAnimator
              position={cam.position}
              target={cam.target}
              controlsRef={controlsRef}
              version={presetVersion}
            />

            {/* Double-click to focus; empty double-click recenters the room */}
            <DoubleClickFocus
              controlsRef={controlsRef}
              onEmpty={() => setPresetVersion((n) => n + 1)}
            />

            {/* Orientation gizmo — click an axis to snap the view */}
            <GizmoHelper alignment="bottom-right" margin={[56, 56]}>
              <GizmoViewport
                axisColors={['#D85A30', '#7FB069', '#5B8DEF']}
                labelColor="#3A342E"
              />
            </GizmoHelper>
          </Suspense>
        </Canvas>
        </CanvasErrorBoundary>
        </div>
        </div>
      </div>

      {/* ── Right: contextual design panel (on-demand drawer) ─────────
          No longer pinned open: the 3D viewport runs full-width, and the
          panel slides in only when a surface's radial menu or the "Dizayn"
          toggle asks for it. On mobile it rises from the bottom; on desktop
          it slides in from the right without a backdrop, so the room keeps
          updating live while colours/finishes are being picked. */}

      {/* Mobile backdrop */}
      {showPanel && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/30"
          onClick={() => setShowPanel(false)}
        />
      )}

      {/* Panel — mobile: slide-up sheet | desktop: slide-in right drawer */}
      <div
        className={[
          'fixed z-50 bg-surface shadow-2xl transition-transform duration-300 ease-in-out flex flex-col',
          /* mobile base: bottom sheet */
          'bottom-0 left-0 right-0 max-h-[72vh] rounded-t-2xl overflow-hidden',
          showPanel ? 'translate-y-0' : 'translate-y-full',
          /* desktop: right-edge drawer (cancel the y-translate, drive x) */
          'lg:top-0 lg:bottom-0 lg:left-auto lg:right-0 lg:h-full lg:w-72 lg:max-h-none lg:rounded-none lg:border-l lg:border-gray-200 lg:translate-y-0',
          showPanel ? 'lg:translate-x-0' : 'lg:translate-x-full',
        ].join(' ')}
      >
        {/* Mobile drag handle */}
        <div
          className="lg:hidden shrink-0 flex justify-center pt-2 pb-0.5 bg-surface rounded-t-2xl cursor-pointer"
          onClick={() => setShowPanel(false)}
        >
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        {/* Desktop header with close */}
        <div className="hidden lg:flex shrink-0 items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-surface">
          <span className="text-sm font-semibold text-gray-800">Asboblar va dizayn</span>
          <button
            onClick={() => setShowPanel(false)}
            aria-label="Yopish"
            title="Yopish"
            className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
          >
            ✕
          </button>
        </div>
        {/* Scroll body */}
        <div className="flex-1 min-h-0 overflow-y-auto">
        {/* ── Asboblar va ko'rinish (viewportdan ko'chirilgan) ── */}
        <div className="p-4 pb-0 space-y-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Asboblar va ko'rinish</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex flex-wrap items-center bg-gray-100 rounded-full p-1 gap-0.5">
              <button
                onClick={() => setToolMode('select')}
                title="Tanlash"
                className={`flex items-center justify-center gap-1 px-2 py-2 lg:py-1 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 rounded-full text-xs font-medium transition-colors ${
                  toolMode === 'select' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4 0l16 10.5-7 1.5 4 8-2.5 1-4-8-6.5 4.5z"/>
                </svg>
                <span className="hidden sm:inline">Tanlash</span>
              </button>
              <button
                onClick={() => setToolMode('move')}
                title="Siljitish"
                className={`flex items-center justify-center gap-1 px-2 py-2 lg:py-1 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 rounded-full text-xs font-medium transition-colors ${
                  toolMode === 'move' ? 'bg-brand text-white shadow' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11 3l-4 4h3v3H7V7l-4 4 4 4v-3h3v3H7l4 4 4-4h-3v-3h3v3l4-4-4-4v3h-3V7h3l-4-4z"/>
                </svg>
                <span className="hidden sm:inline">Siljitish</span>
              </button>
              <button
                onClick={() => setToolMode('rotate')}
                title="Aylantirish"
                className={`flex items-center justify-center gap-1 px-2 py-2 lg:py-1 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 rounded-full text-xs font-medium transition-colors ${
                  toolMode === 'rotate' ? 'bg-brand text-white shadow' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/>
                </svg>
                <span className="hidden sm:inline">Aylantirish</span>
              </button>
              <button
                onClick={() => setToolMode('scale')}
                title="O'lcham"
                className={`flex items-center justify-center gap-1 px-2 py-2 lg:py-1 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 rounded-full text-xs font-medium transition-colors ${
                  toolMode === 'scale' ? 'bg-brand text-white shadow' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 21H3M21 3H3M12 7v10M9 10l3-3 3 3M9 14l3 3 3-3"/>
                </svg>
                <span className="hidden sm:inline">O'lcham</span>
              </button>
              <button
                onClick={() => setToolMode('part')}
                title="Qismlar — model ichidagi qismni tanlash, ajratish yoki o'chirish"
                className={`flex items-center justify-center gap-1 px-2 py-2 lg:py-1 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 rounded-full text-xs font-medium transition-colors ${
                  toolMode === 'part' ? 'bg-brand text-white shadow' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l8 4.5v9L12 20l-8-4.5v-9z"/>
                  <path d="M12 11l8-4.5M12 11v9M12 11L4 6.5"/>
                  <path d="M16 3.5l-8 4.5"/>
                </svg>
                <span className="hidden sm:inline">Qismlar</span>
              </button>
            </div>
            {toolMode === 'rotate' && selectedFurId && (() => {
              const item = furniture.find(f => f.id === selectedFurId)
              if (!item) return null
              const currentDeg = Math.round(item.rotation * (180 / Math.PI))
              return (
                <form
                  className="flex items-center gap-1"
                  onSubmit={e => {
                    e.preventDefault()
                    const deg = parseFloat(angleInputDeg)
                    if (!isNaN(deg)) {
                      moveFurniture(item.id, item.x, item.y, deg * (Math.PI / 180))
                      setAngleInputDeg('')
                    }
                  }}
                >
                  <input
                    key={selectedFurId + currentDeg}
                    type="number"
                    defaultValue={currentDeg}
                    onChange={e => setAngleInputDeg(e.target.value)}
                    placeholder={`${currentDeg}°`}
                    className="w-14 text-xs border border-gray-300 rounded px-1 py-0.5 text-center focus:outline-none focus:border-brand"
                    title="Burchakni darajada kiriting va Enter bosing"
                  />
                  <span className="text-gray-400 text-xs">°</span>
                  <button type="submit" className="text-xs px-1.5 py-0.5 bg-brand text-white rounded font-medium">✓</button>
                </form>
              )
            })()}
            {/* Navigation help */}
            <button
              onClick={() => setShowHelp(v => !v)}
              title="Boshqaruv bo'yicha yordam"
              className="flex items-center justify-center w-7 h-7 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 rounded-full text-xs font-bold transition-colors border shrink-0 bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200"
            >
              ?
            </button>
            {/* Recenter: snap the orbit pivot back to the room centre */}
            <button
              onClick={() => setPresetVersion(n => n + 1)}
              title="Markazlash — kamerani xona markaziga qaytarish"
              className="flex items-center justify-center gap-1 px-2 py-2 lg:py-1 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 rounded-full text-xs font-medium transition-colors border shrink-0 bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
              </svg>
              <span className="hidden sm:inline">Markaz</span>
            </button>
            {/* Cutaway mode: interior → auto cutaway → fixed diorama.
                Disabled in top view where the shell is already open. */}
            <button
              onClick={() => setCutaway(m => m === 'off' ? 'auto' : m === 'auto' ? 'diorama' : 'off')}
              disabled={topView}
              title={
                topView ? "Yuqoridan ko'rinishda kesma shart emas"
                : cutaway === 'off' ? "Kesma ko'rinishga o'tish (devorlar kamera tomonda yashirinadi)"
                : cutaway === 'auto' ? "Diorama rejimiga o'tish (sobit taqdimot ko'rinishi)"
                : "Ichki ko'rinishga qaytish"
              }
              className={`flex items-center justify-center gap-1 px-2 py-2 lg:py-1 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 rounded-full text-xs font-medium transition-colors border shrink-0 ${
                topView
                  ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                  : cutaway !== 'off'
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200'
                  : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 8l-9-5-9 5v8l9 5 9-5z" />
                <path d="M3 8l9 5 9-5M12 13v9" />
              </svg>
              <span className="hidden sm:inline">
                {cutaway === 'off' ? 'Ichki' : cutaway === 'auto' ? 'Kesma' : 'Diorama'}
              </span>
            </button>
            {/* Scene light (sun + environment) toggle */}
            <button
              onClick={() => setSceneLightOn(v => !v)}
              title={sceneLightOn ? "Sahna yorug'ligini o'chirish" : "Sahna yorug'ligini yoqish"}
              className={`flex items-center justify-center gap-1 px-2 py-2 lg:py-1 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 rounded-full text-xs font-medium transition-colors border shrink-0 ${
                sceneLightOn
                  ? 'bg-sky-100 text-sky-700 border-sky-300 hover:bg-sky-200'
                  : 'bg-gray-800 text-gray-300 border-gray-600 hover:bg-gray-700'
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
              <span className="hidden sm:inline">{sceneLightOn ? 'Kunduz' : 'Tun'}</span>
            </button>
            {/* Sun clock. Only meaningful while the sun is the light source, so
                it rides with the day/night toggle. */}
            {sceneLightOn && (
              <div
                className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-amber-200 bg-amber-50 shrink-0"
                title="Quyosh vaqti — Toshkent bo'yicha"
              >
                <span className="text-[11px] font-semibold text-amber-800 tabular-nums w-9 text-right">
                  {formatClock(sunHour)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={23.75}
                  step={0.25}
                  value={sunHour}
                  onChange={(e) => setSunHour(parseFloat(e.target.value))}
                  aria-label="Quyosh vaqti"
                  className="w-14 sm:w-24 accent-amber-500 cursor-pointer"
                />
              </div>
            )}
            <button
              onClick={() => setLightsOn(v => !v)}
              title={lightsOn ? "Chiroqni o'chirish" : "Chiroqni yoqish"}
              className={`flex items-center justify-center gap-1 px-2 py-2 lg:py-1 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 rounded-full text-xs font-medium transition-colors border shrink-0 ${
                lightsOn
                  ? 'bg-yellow-100 text-yellow-700 border-yellow-300 hover:bg-yellow-200'
                  : 'bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200'
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 14c.2-1 .7-1.7 1.5-2.5C17.7 10.2 19 8.7 19 7c0-3.3-2.7-6-6-6S7 3.7 7 7c0 1.7 1.3 3.2 2.5 4.5.8.8 1.3 1.5 1.5 2.5"/>
                <path d="M9 18h6M10 22h4"/>
              </svg>
              <span className="hidden sm:inline">{lightsOn ? 'Yoqilgan' : "O'chirilgan"}</span>
            </button>
            {/* AI builder button */}
            <button
              onClick={() => setShowAiSheet(true)}
              title="AI bilan qurish"
              className="flex items-center justify-center gap-1 px-2.5 py-2 lg:py-1 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 rounded-full text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 transition-colors shrink-0"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 0 2h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1 0-2h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
              </svg>
              <span className="hidden sm:inline">AI</span>
            </button>
          </div>
        </div>
        <DesignPanel room={room} phase={activePhase} selectedWall={selectedWall} onWallChange={setSelectedWall}
          selectedLightId={selectedLightId} onLightChange={setSelectedLightId}
          armedLightType={armedLightType} onArmLight={setArmedLightType} planMode={isChiroqTab} />
        </div>
      </div>

      {showAddSheet && <AddObjectSheet onClose={() => setShowAddSheet(false)} initialSection={addSheetSection} />}
      <RoomSettingsSheet open={elementsSheetOpen} onClose={() => setElementsSheetOpen(false)} />
      <AiBuilderSheet open={showAiSheet} onOpenChange={setShowAiSheet} roomId={room.id} />

      {/* Surface long-press radial menu ("aylana") */}
      {radial && (
        <SurfaceRadialMenu
          x={radial.x}
          y={radial.y}
          surface={radial.surface}
          items={buildRadialItems(radial)}
          onClose={closeRadial}
        />
      )}
    </div>
  );
}
