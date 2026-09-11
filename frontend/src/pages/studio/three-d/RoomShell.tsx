import * as React from "react";
import { memo, useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { Html, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { useRoomStore, resolveWallCovering, resolveWallPanel, PLASTER_BASE_COLOR } from "@/store/roomStore";
import type { DesignState, RoomGeometry, WallElement } from "@/store/roomStore";
import type { Room } from "@/lib/api";
import { resolveElementPositions } from "@/lib/wallPositions";
import { DEFAULT_CEILING_DESIGN } from "@/lib/ceilingDesigns";
import {
  WallFade,
  useHiddenWalls, type CutawayMode,
} from "@/features/studio/diorama";
import { ShadowShell } from "@/features/studio/shadowShell";
import type { RadialSurface } from "@/components/studio/SurfaceRadialMenu";
import { roomExtents } from "@/lib/roomDims";
import { WALL_T, CEILING_DEFAULT, FLOOR_COLORS, UNCONFIGURED_FLOOR_COLOR, noRaycast } from "./constants";
import { shadeCovering } from "./helpers";
import { WoodFloor, Ceiling } from "./FloorCeiling";
import { Wall, WindowFrames, DoorFrames, Baseboard } from "./WallComponents";
import { CeilingLights } from "./LightingComponents";

/**
 * The full room shell: the legacy 4-wall ABCD room (floor, ceiling, walls,
 * frames, baseboard), the N-wall polygon shell used for scanned rooms, and
 * the top-level RoomScene that picks between them. Split out of
 * ThreeDPage.tsx — see that file's header comment for the full picture.
 */

// Stable empty-array fallback for a wall with no elements yet — `?? []`
// inline would create a brand-new array reference on every render, which
// (like the fresh objects/arrays fixed below) would defeat <Wall>'s
// React.memo for that prop even though the "no elements" value never changes.
const EMPTY_ELEMENTS: WallElement[] = [];

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


// ─── In-scene swap buttons ────────────────────────────────────────────────────

export const SwapButtons = memo(function SwapButtons({ W, D, H }: { W: number; D: number; H: number }) {
  // Narrow selectors only — this component is mounted inside the R3F
  // <Canvas> whenever a legacy ABCD wall has ≥2 openings. A whole-store
  // subscription (`useRoomStore()`) re-rendered it on every store write
  // anywhere in the app for as long as it stayed mounted. `swapAdjacentElements`
  // is a stable Zustand action reference, safe to select directly.
  const geometry = useRoomStore((s) => s.geometry);
  const swapAdjacentElements = useRoomStore((s) => s.swapAdjacentElements);
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

  // Rebuilding this list (wall lookups + resolveElementPositions + sort) from
  // scratch on every render was wasted work whenever anything else in the
  // scene re-rendered this component without geometry/dimensions actually
  // changing — memoize it on the specific fields it derives from.
  const items = useMemo<React.ReactElement[]>(() => {
    const built: React.ReactElement[] = [];

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

        built.push(
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

    return built;
  }, [geometry, wallDefs, buttonY, T_MM, s, swapAdjacentElements]);

  return <>{items}</>;
});


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
          color={designState.floorConfigured ? (FLOOR_COLORS[designState.floorType] ?? '#C9AB7E') : UNCONFIGURED_FLOOR_COLOR}
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
            <meshStandardMaterial
              color={isSelected ? '#1E40AF' : baseColor}
              roughness={0.85}
              emissive={isSelected ? '#1E40AF' : '#000000'}
              emissiveIntensity={isSelected ? 0.12 : 0}
            />
          </mesh>
        )
      })}
    </group>
  )
}


// ─── Full room scene ──────────────────────────────────────────────────────────

export const RoomScene = memo(function RoomScene({
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

  // Per-wall coverings with depth shading. `shadeCovering` allocates a new
  // object on every call (except for the 'plaster' kind) — without memoizing
  // here, each of the four <Wall> below would receive a fresh `covering`
  // object on every RoomScene render regardless of whether that wall's own
  // covering actually changed, making `React.memo` on <Wall> a no-op for this
  // prop. Keyed on `designState.wallCoverings`, which the store only replaces
  // (immutably) when a covering is actually edited.
  const coveringA = useMemo(
    () => shadeCovering(resolveWallCovering(designState.wallCoverings, 'A'), 0.92),
    [designState.wallCoverings],
  );
  const coveringB = useMemo(
    () => shadeCovering(resolveWallCovering(designState.wallCoverings, 'B'), 0.82),
    [designState.wallCoverings],
  );
  const coveringC = useMemo(
    () => shadeCovering(resolveWallCovering(designState.wallCoverings, 'C'), 0.92),
    [designState.wallCoverings],
  );
  const coveringD = useMemo(
    () => shadeCovering(resolveWallCovering(designState.wallCoverings, 'D'), 0.82),
    [designState.wallCoverings],
  );

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
  // `.map()` here built a brand-new array on every render regardless of
  // whether wallB/wallD's elements actually changed — memoizing lets
  // <Wall>'s React.memo actually skip B/D re-renders when only, say, wall A
  // or C changed (RoomScene re-runs for the whole shell either way).
  const elementsBOuter = useMemo(
    () => resolveElementPositions(wallB?.elements ?? EMPTY_ELEMENTS, D * 1000)
      .map(el => ({ ...el, position: el.position + T_MM })),
    [wallB?.elements, D, T_MM],
  );
  const elementsDOuter = useMemo(
    () => resolveElementPositions(wallD?.elements ?? EMPTY_ELEMENTS, D * 1000)
      .map(el => ({ ...el, position: el.position + T_MM })),
    [wallD?.elements, D, T_MM],
  );

  // A/C resolved in interior-span coordinates — what ShadowShell wants for the
  // walls that don't own the corners (it does its own shifting).
  const elementsAResolved = useMemo(
    () => resolveElementPositions(wallA?.elements ?? EMPTY_ELEMENTS, W * 1000),
    [wallA?.elements, W],
  );
  const elementsCResolved = useMemo(
    () => resolveElementPositions(wallC?.elements ?? EMPTY_ELEMENTS, W * 1000),
    [wallC?.elements, W],
  );

  // Stable per-wall click handlers — an inline `() => onWallClick?.('A')`
  // literal at the call site below would be a fresh function reference on
  // every RoomScene render, which (like `covering`/`elements` above) would
  // defeat <Wall>'s React.memo regardless of whether the wall itself changed.
  const handleWallClickA = useCallback(() => onWallClick?.('A'), [onWallClick]);
  const handleWallClickB = useCallback(() => onWallClick?.('B'), [onWallClick]);
  const handleWallClickC = useCallback(() => onWallClick?.('C'), [onWallClick]);
  const handleWallClickD = useCallback(() => onWallClick?.('D'), [onWallClick]);

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
              floorConfigured={designState.floorConfigured}
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
                elements={wallA?.elements ?? EMPTY_ELEMENTS} axis="X" cx={0} cz={-(D / 2 + T / 2)}
                isSelected={selectedWall === 'A'} onClick={handleWallClickA}
                panelSettings={panelsA} />
            </group>
          </WallFade>

          {/* Wall B — right, full outer depth D+2T (owns corners), inner face at x = +W/2 */}
          <WallFade hidden={hiddenWalls.has('B')}>
            <group {...(holdBind?.('wall', 'B') ?? {})}>
              <Wall plaster={plasterWalls} wallId="B" length={D + 2 * T} height={H} thickness={T} covering={coveringB}
                elements={elementsBOuter} axis="Z" cx={W / 2 + T / 2} cz={0}
                isSelected={selectedWall === 'B'} onClick={handleWallClickB}
                panelSettings={panelsB} />
            </group>
          </WallFade>

          {/* Wall C — front, inner width W only, inner face at z = +D/2 */}
          <WallFade hidden={hiddenWalls.has('C')}>
            <group {...(holdBind?.('wall', 'C') ?? {})}>
              <Wall plaster={plasterWalls} wallId="C" length={W} height={H} thickness={T} covering={coveringC}
                elements={wallC?.elements ?? EMPTY_ELEMENTS} axis="X" cx={0} cz={D / 2 + T / 2}
                isSelected={selectedWall === 'C'} onClick={handleWallClickC}
                panelSettings={panelsC} />
            </group>
          </WallFade>

          {/* Wall D — left, full outer depth D+2T (owns corners), inner face at x = -W/2 */}
          <WallFade hidden={hiddenWalls.has('D')}>
            <group {...(holdBind?.('wall', 'D') ?? {})}>
              <Wall plaster={plasterWalls} wallId="D" length={D + 2 * T} height={H} thickness={T} covering={coveringD}
                elements={elementsDOuter} axis="Z" cx={-(W / 2 + T / 2)} cz={0}
                isSelected={selectedWall === 'D'} onClick={handleWallClickD}
                panelSettings={panelsD} />
            </group>
          </WallFade>

          <WindowFrames geometry={geometry} wallWidth={W} wallDepth={D} hiddenWalls={hiddenWalls} />
          <DoorFrames geometry={geometry} wallWidth={W} wallDepth={D} hiddenWalls={hiddenWalls} />
          <Baseboard width={W} depth={D} geometry={geometry} hiddenWalls={hiddenWalls} />
          {/* CornerShadows disabled: real directional shadows now provide corner depth */}
          {false && <CornerShadows width={W} depth={D} composerActive={composerActive} />}

          {/* The sun's occluder. Outside the fades on purpose — see shadowShell.tsx. */}
          <ShadowShell
            W={W} D={D} H={H}
            elementsA={elementsAResolved}
            elementsB={elementsBOuter}
            elementsC={elementsCResolved}
            elementsD={elementsDOuter}
          />
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
});
