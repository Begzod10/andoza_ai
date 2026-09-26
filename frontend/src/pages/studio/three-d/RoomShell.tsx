import * as React from "react";
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { useRoomStore, resolveWallCovering, resolveWallPanel } from "@/store/roomStore";
import type { DesignState, RoomGeometry, WallElement } from "@/store/roomStore";
import type { Room } from "@/lib/api";
import { resolveElementPositions } from "@/lib/wallPositions";
import { DEFAULT_CEILING_DESIGN, CEILING_SETTING_DEFAULTS, ceilingDesign, resolveCeilingSettings, ceilingPerimeterY } from "@/lib/ceilingDesigns";
import {
  WallFade,
  useHiddenWalls, type CutawayMode,
} from "@/features/studio/diorama";
import { ShadowShell } from "@/features/studio/shadowShell";
import type { RadialSurface } from "@/components/studio/SurfaceRadialMenu";
import { roomExtents } from "@/lib/roomDims";
import { WALL_T, FLOOR_COLORS, UNCONFIGURED_FLOOR_COLOR, noRaycast } from "./constants";
import { shadeCovering, boardSegments, trimSegments } from "./helpers";
import { WoodFloor, Ceiling, PatternFloor } from "./FloorCeiling";
import { floorSlabColorFor } from "@/lib/floorGeometry";
import { Wall, WindowFrames, DoorFrames, Baseboard, Cornice, WindowFrameItem, DoorFrameItem, TrimRun, type FrameWallDef } from "./WallComponents";
import { resolveTrim } from "@/lib/trimProfiles";
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
// Renders a polygon floor/ceiling plus, for EACH polygon edge, a real carved
// wall (with door/window cutouts via the shared <Wall> segmentation), matching
// window/door frames, and baseboard trim — the same look as the ABCD room.
//
// Each edge v[i]→v[(i+1)%n] is rendered as an axis-'X' wall built at the local
// origin and wrapped in a <group position={edge midpoint} rotation-y={edge yaw}>
// so all the existing X-axis wall/frame/baseboard code is reused, just rotated
// into place. The along-length direction is fixed by the winding, so the
// room-inward face is chosen per edge via <Wall innerFaceDir> (see that prop).


interface PolyEdge {
  index: number;
  wallId: string;
  /** Edge midpoint in centred metres (world XZ, room centred at origin). */
  mx: number; mz: number;
  /** Y rotation aligning local +X with the edge direction. */
  yaw: number;
  /** Edge length in metres. */
  length: number;
  /** Which local face is room-inward (+1 = local +Z, −1 = local −Z). */
  faceDir: 1 | -1;
  /** Outward normal (unit, world XZ) — used by the camera-facing cutaway. */
  ox: number; oz: number;
}

function polyEdgesEqual(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/**
 * Camera-facing hidden-edge tracking for the polygon shell — the N-wall
 * analogue of diorama.useHiddenWalls. Hides any edge whose OUTWARD normal
 * points toward the camera, with the same hysteresis so it doesn't flicker
 * at the boundary.
 */
function useHiddenPolyEdges(mode: CutawayMode, edges: PolyEdge[]): ReadonlySet<number> {
  const [hidden, setHidden] = useState<ReadonlySet<number>>(() => new Set());
  const current = useRef<ReadonlySet<number>>(hidden);

  useFrame(({ camera }) => {
    let next: Set<number>;
    if (mode === 'off') {
      if (current.current.size === 0) return;
      next = new Set();
    } else {
      const len = Math.hypot(camera.position.x, camera.position.z) || 1;
      const dx = camera.position.x / len, dz = camera.position.z / len;
      next = new Set<number>();
      for (const e of edges) {
        const dot = e.ox * dx + e.oz * dz;
        const was = current.current.has(e.index);
        // hysteresis: hide above 0.30, unhide below 0.22 (same as ABCD)
        if (dot > (was ? 0.22 : 0.3)) next.add(e.index);
      }
      if (polyEdgesEqual(current.current, next)) return;
    }
    current.current = next;
    setHidden(next);
  });

  return hidden;
}

function NWallRoomShell({
  geometry,
  H,
  designState,
  selectedWall,
  onWallClick,
  isFloorSelected,
  onFloorClick,
  isCeilingSelected,
  onCeilingClick,
  holdBind,
  cutaway = 'off',
  plasterWalls = false,
}: {
  geometry: RoomGeometry;
  H: number;
  designState: DesignState;
  selectedWall?: string | null;
  onWallClick?: (id: string) => void;
  isFloorSelected?: boolean;
  onFloorClick?: () => void;
  isCeilingSelected?: boolean;
  onCeilingClick?: () => void;
  /** Opens the surface radial menu (add door/window, wall image, ...). The
   *  ABCD shell has always spread this onto its surfaces; without it here a
   *  drawn room could select a wall but never act on it. */
  holdBind?: (surface: RadialSurface, wallId?: string) => Record<string, unknown>;
  cutaway?: CutawayMode;
  plasterWalls?: boolean;
}) {
  // Skirting: undefined means the user never touched it, which still renders
  // the default board; only an explicit null takes it off.
  const trim = designState.skirting === null ? null : resolveTrim(designState.skirting, 'skirting')
  // Cornice: opt-in, and this shell always draws the plain slab at H (a
  // scanned room is rendered open-topped), so the junction is simply H.
  const cornice = designState.cornice ? resolveTrim(designState.cornice, 'cornice') : null
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

  // ShapeGeometry builds its vertices flat in the local XY plane (z=0), and
  // the floor/ceiling meshes below rotate that flat shape -90° about X to
  // lay it into the XZ plane. That rotation maps local Y to world Z as
  // -localY (Rx(-90°) sends (x, y, 0) -> (x, 0, -y)) — but the wall boxes
  // above are positioned directly from the same polygon's raw (x, z), with
  // no such flip. Feeding the raw z straight into the shape's Y slot (the
  // previous version of this function) therefore came out mirrored across Z
  // in world space relative to the wall footprint for any polygon that
  // isn't symmetric under z -> -z. A centred rectangle's 4 corners happen to
  // be exactly such a symmetric set (negating z just reorders the same 4
  // points), which is why this stayed invisible until an L-shaped room's
  // asymmetric vertex loop exposed it as a real gap between floor and walls.
  // Negating z here cancels the rotation's own negation, so the shape's
  // world (x, z) after rotation exactly matches the (x, z) the walls use.
  const buildShape = (verts: [number, number][]) => {
    const shape = new THREE.Shape()
    shape.moveTo(verts[0][0], -verts[0][1])
    for (let i = 1; i < verts.length; i++) shape.lineTo(verts[i][0], -verts[i][1])
    shape.closePath()
    return new THREE.ShapeGeometry(shape)
  }

  const polyGeo = useMemo(() => buildShape(filteredCentred), [filteredCentred])

  // Which face of the ceiling slab points DOWN into the room: always the back
  // one. This used to be derived from the polygon's signed area, on the theory
  // that a clockwise loop flips ShapeGeometry's front face — it does not.
  // ShapeUtils.triangulateShape normalizes the contour's winding before
  // triangulating, so ShapeGeometry emits +Z normals for EITHER winding, and
  // `rotation={[-PI/2, 0, 0]}` turns that +Z into +Y (up, out of the room)
  // every time. A room whose outline happened to be drawn clockwise therefore
  // got FrontSide, i.e. a ceiling facing away from the people under it: it
  // vanished from inside (sky overhead, lights hanging off nothing) and,
  // now that the slab is pickable, could not be clicked either, since a
  // FrontSide material culls exactly the face a ray from below arrives at.
  const ceilingSide = THREE.BackSide

  // Per-edge transforms + inward/outward normals. `centred` (not the filtered
  // set) is used so edge i still lines up with geometry.walls[i]; the room is
  // centred at the origin, so "toward centroid" is simply "toward (0,0)".
  const edges = useMemo<PolyEdge[]>(() => {
    const out: PolyEdge[] = []
    for (let i = 0; i < centred.length; i++) {
      const [x1, z1] = centred[i]
      const [x2, z2] = centred[(i + 1) % centred.length]
      const dx = x2 - x1
      const dz = z2 - z1
      const length = Math.hypot(dx, dz)
      if (length < 0.01) continue
      const mx = (x1 + x2) / 2
      const mz = (z1 + z2) / 2
      // Wrapping-group yaw: local +X → edge direction (dx,dz); this maps the
      // wall's local +Z face normal to world (-dz,dx)/length.
      const yaw = Math.atan2(-dz, dx)
      const nx = -dz / length
      const nz = dx / length
      // local +Z (nx,nz) is room-inward when it points toward the centroid (0,0).
      const inward = nx * -mx + nz * -mz
      const faceDir: 1 | -1 = inward >= 0 ? 1 : -1
      // Outward normal = away from centroid.
      let ox = nx, oz = nz
      if (ox * mx + oz * mz < 0) { ox = -ox; oz = -oz }
      out.push({
        index: i,
        wallId: geometry.walls[i]?.id ?? String(i),
        mx, mz, yaw, length, faceDir, ox, oz,
      })
    }
    return out
  }, [centred, geometry.walls])

  const hiddenEdges = useHiddenPolyEdges(cutaway, edges)

  // Real-geometry laying pattern (Naqsh) for a drawn/scanned polygon room:
  // the flat polygon becomes the dark under-slab and the instanced planks
  // are clipped to this very outline. Same centred frame as the walls.
  const floorPattern = designState.floorPattern ?? null
  const floorBase = FLOOR_COLORS[designState.floorType] ?? '#C9AB7E'
  const patternExtents = useMemo(() => {
    let mx = 0, mz = 0
    for (const [x, z] of filteredCentred) { mx = Math.max(mx, Math.abs(x)); mz = Math.max(mz, Math.abs(z)) }
    return { W: 2 * mx, D: 2 * mz }
  }, [filteredCentred])

  return (
    <group>
      {/* Floor — ShapeGeometry in XY plane, rotated to XZ at Y=0. Wrapped
          like the ABCD shell's floor so tapping it selects the floor and
          opens the same radial menu. */}
      <group {...(holdBind?.('floor') ?? {})}>
      <mesh
        geometry={polyGeo}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        onClick={onFloorClick}
      >
        <meshStandardMaterial
          color={floorPattern
            ? floorSlabColorFor(floorPattern, floorBase)
            : designState.floorConfigured ? floorBase : UNCONFIGURED_FLOOR_COLOR}
          emissive={isFloorSelected ? '#1E40AF' : '#000000'}
          emissiveIntensity={isFloorSelected ? 0.25 : 0}
          roughness={floorPattern ? 0.92 : 0.8}
          // ShapeGeometry's front-face winding depends on the input polygon's
          // winding in its own local X-Y space, before this mesh's rotation
          // is applied — if that ends up facing down post-rotation, the
          // floor would be invisible from the normal top-down/isometric
          // camera with the default FrontSide. DoubleSide costs nothing and
          // removes this whole class of winding-order bugs.
          side={THREE.DoubleSide}
        />
      </mesh>
      {floorPattern && (
        <PatternFloor
          pattern={floorPattern}
          width={patternExtents.W}
          depth={patternExtents.D}
          fallbackColor={floorBase}
          clipPolygon={filteredCentred}
        />
      )}
      </group>

      {/* Ceiling — a plain white slab, and the roof the sun stops at.
          It used to draw nothing (colourWrite off, shadow caster only) on the
          assumption that a scanned room is always shown open-topped. Drawn
          rooms are ordinary rooms people work inside, so that left them with
          sky overhead and the ceiling lights hanging off nothing.
          Single-sided like the ABCD shell's ceiling: seen from inside, gone
          from above, so pulling the camera out of the room still looks in
          rather than at a lid — see `ceilingSide` for which face that is.

          Wrapped and pickable like the floor above it: the slab used to be
          noRaycast, so a drawn room's ceiling was the one surface that could
          neither be selected nor long-pressed. Being single-sided also keeps
          it out of the way of any view that looks down at the room — a ray
          from above meets the culled face and passes straight through to the
          floor plan, so the slab can never swallow a pick there. */}
      <group {...(holdBind?.('ceiling') ?? {})}>
      <mesh
        geometry={polyGeo}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, H, 0]}
        castShadow
        onClick={onCeilingClick}
      >
        <meshStandardMaterial
          // The room's own ceiling colour, same source and same near-white
          // default (#F4F1EA) the ABCD shell paints — CEILING_DEFAULT is a
          // greyer slab tone that made drawn rooms read dirtier than
          // rectangular ones side by side.
          color={designState.ceiling?.settings?.color ?? CEILING_SETTING_DEFAULTS.color}
          emissive={isCeilingSelected ? '#1E40AF' : '#000000'}
          emissiveIntensity={isCeilingSelected ? 0.25 : 0}
          roughness={0.95}
          side={ceilingSide}
        />
      </mesh>
      </group>

      {/* One carved wall + frames + baseboard per polygon edge, rotated into place */}
      {edges.map((e) => {
        const wall = geometry.walls[e.index]
        const elements = wall?.elements ?? []
        // Alternate shade factor for depth cues (avoid all walls looking identical),
        // same 0.92/0.82 pair the ABCD shell uses for its A/C vs B/D walls.
        const shadeFactor = e.index % 2 === 0 ? 0.92 : 0.82
        const covering = shadeCovering(
          resolveWallCovering(designState.wallCoverings, e.wallId),
          shadeFactor,
        )
        // Two independent signs, both needed (see `FrameWallDef`):
        //  • `alongSign: 1` — this def lives in the edge's OWN rotated group,
        //    whose local +X already points from vertices[i] to vertices[i+1],
        //    i.e. the direction position grows in. The sign only ever matters
        //    to a def expressed in world axes (see `buildFrameWallDefs`).
        //  • `faceDir` is mandatory here: these frames render INSIDE that same
        //    rotated group, where cx/cz are both 0 and so carry no sign for
        //    the reveal to read — without it every drawn-room opening would
        //    cut its 200 mm niche toward the same side regardless of which way
        //    the wall actually faces.
        const frameWd: FrameWallDef = { id: e.wallId, axis: 'X', cx: 0, cz: 0, length: e.length, alongSign: 1, faceDir: e.faceDir }
        const resolvedEls = resolveElementPositions(elements, e.length * 1000)
        const baseSegs = boardSegments(e.length, elements, (trim?.heightM ?? 0.1) * 1000)

        // Merge note: master's concave-corner fix here drew each wall box
        // `length + T` long (84e22852), and this path dropped it for the
        // <Wall> renderer. That costs nothing: T is WALL_T, which was already
        // 0 when that commit landed — interior walls render as widthless
        // planes, so the extension was `length + 0` and the "gap" it described
        // cannot occur. If WALL_T ever becomes non-zero, the overlap has to be
        // re-added inside the wall mesh, NOT by growing `length` — openings are
        // positioned against it and would all shift by T/2.
        return (
          <WallFade key={e.wallId} hidden={hiddenEdges.has(e.index)}>
            <group position={[e.mx, 0, e.mz]} rotation={[0, e.yaw, 0]} {...(holdBind?.('wall', e.wallId) ?? {})}>
              <Wall
                plaster={plasterWalls}
                wallId={e.wallId}
                length={e.length}
                height={H}
                thickness={WALL_T}
                covering={covering}
                elements={elements}
                axis="X"
                cx={0}
                cz={0}
                innerFaceDir={e.faceDir}
                isSelected={selectedWall === e.wallId}
                onClick={() => onWallClick?.(e.wallId)}
                panelSettings={resolveWallPanel(designState.wallPanels, e.wallId)}
              />
              {resolvedEls.map((el) =>
                el.type === 'eshik' ? (
                  <DoorFrameItem key={`door-${el.id}`} wd={frameWd} el={el} />
                ) : (
                  <WindowFrameItem key={`win-${el.id}`} wd={frameWd} el={el} />
                ),
              )}
              {/* Skirting: one milled run per gap segment. This group is
                  already rotated onto the edge, so the run only needs to turn
                  its profile toward the room — yaw 0 when the room is on the
                  local +Z side, π when it is not (which also reverses local
                  +X, hence the swapped mitre flags). */}
              {cornice && trimSegments(e.length, elements, (H - cornice.heightM) * 1000, H * 1000).map((s, si) => {
                const atLeft = s.center - s.len / 2 <= -e.length / 2 + 0.002;
                const atRight = s.center + s.len / 2 >= e.length / 2 - 0.002;
                const fwd = e.faceDir > 0;
                return (
                  <TrimRun
                    key={`cor-${si}`}
                    trim={cornice}
                    lengthM={s.len}
                    flipY
                    mitreStart={fwd ? atLeft : atRight}
                    mitreEnd={fwd ? atRight : atLeft}
                    position={[s.center, H, 0]}
                    yaw={fwd ? 0 : Math.PI}
                  />
                );
              })}
              {trim && baseSegs.map((s, si) => {
                const atLeft = s.center - s.len / 2 <= -e.length / 2 + 0.002;
                const atRight = s.center + s.len / 2 >= e.length / 2 - 0.002;
                const fwd = e.faceDir > 0;
                return (
                  <TrimRun
                    key={`base-${si}`}
                    trim={trim}
                    lengthM={s.len}
                    mitreStart={fwd ? atLeft : atRight}
                    mitreEnd={fwd ? atRight : atLeft}
                    position={[s.center, 0, 0]}
                    yaw={fwd ? 0 : Math.PI}
                  />
                );
              })}
            </group>
          </WallFade>
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
  isCeilingSelected,
  onCeilingClick,
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
  /** The ceiling is selectable exactly like a wall or the floor — one tap
   *  highlights it and points the design panel's "Shift" target at it. */
  isCeilingSelected?: boolean;
  onCeilingClick?: () => void;
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

  // Cutaway: which walls are currently hidden (camera-facing ones)
  const hiddenWalls = useHiddenWalls(cutaway)

  // Skirting: `undefined` is "never touched", which still draws the default
  // board so rooms designed before the picker existed are unchanged; only an
  // explicit `null` removes it from the scene.
  const skirting = useMemo(
    () => (designState.skirting === null ? null : resolveTrim(designState.skirting, 'skirting')),
    [designState.skirting],
  )
  // Cornice: only an explicit choice puts one in the scene.
  const cornice = useMemo(
    () => (designState.cornice ? resolveTrim(designState.cornice, 'cornice') : null),
    [designState.cornice],
  )
  // Where the wall actually meets the ceiling, so the moulding follows a
  // dropped design down instead of floating up at the slab.
  const corniceY = useMemo(() => {
    const d = ceilingDesign(designState.ceiling?.design ?? DEFAULT_CEILING_DESIGN)
    return ceilingPerimeterY(d, resolveCeilingSettings(d, designState.ceiling?.settings), H)
  }, [designState.ceiling?.design, designState.ceiling?.settings, H])
  const cutawayOn = cutaway !== 'off'

  // Top view and the cutaway both look into an open-topped box. That is
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
              floorPattern={designState.floorPattern}
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
              isSelected={isCeilingSelected}
              onClick={onCeilingClick}
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
          {skirting && (
            <Baseboard width={W} depth={D} geometry={geometry} hiddenWalls={hiddenWalls} trim={skirting} />
          )}
          {cornice && (
            <Cornice width={W} depth={D} geometry={geometry} hiddenWalls={hiddenWalls}
              trim={cornice} junctionY={corniceY} />
          )}
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
            isFloorSelected={isFloorSelected}
            onFloorClick={onFloorClick}
            isCeilingSelected={isCeilingSelected}
            onCeilingClick={onCeilingClick}
            holdBind={holdBind}
            cutaway={topView ? 'off' : cutaway}
            plasterWalls={plasterWalls}
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
