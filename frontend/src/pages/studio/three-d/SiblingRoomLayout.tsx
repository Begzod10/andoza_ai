import { useEffect, useMemo, useState, type RefObject } from "react";
import { Html } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import type { Room } from "@/lib/api";
import { resolveWallCovering, resolveWallColor } from "@/store/roomStore";
import type { DesignState, PlacedFurniture, RoomGeometry } from "@/store/roomStore";
import { createOboyTexture } from "@/lib/oboyPatterns";
import type { OboyPatternId } from "@/lib/oboyPatterns";
import { requestSharedTexture } from "@/lib/sharedWallTexture";
import { FurnitureItem, type ToolMode } from "@/features/studio/StudioFurniture";
import { DoorLeaves, WindowSashes, type DoorToolMode } from "@/components/studio/DoorLeaves";
import { useHiddenWalls, type CutawayMode } from "@/features/studio/diorama";
import {
  ADD_ROOM_BTN_STYLE, SIBLING_LABEL_STYLE, SIBLING_DELETE_STYLE,
  SIBLING_FLOOR_COLOR_BY_TYPE, SIBLING_FLOOR_COLOR_DEFAULT, SIBLING_WALL_COLOR_DEFAULT,
  type RoomSide,
} from "./constants";
import { roomFootprint, computeAbsolutePositions } from "./helpers";

/**
 * The apartment floor plan around the active room: "+ add room" buttons,
 * sibling rooms rendered as clickable outlines, and the interactive
 * door/window layer. Split out of ThreeDPage.tsx — see that file's header
 * comment for the full picture.
 */

// ─── Add-room "+" buttons shown around the room in top-down view ──────────────

export function AddRoomButtons({ W, D, H, onAdd, disabled, occupiedSides }: { W: number; D: number; H: number; onAdd: (side: RoomSide) => void; disabled?: boolean; occupiedSides?: Set<RoomSide> }) {
  const btnY = H * 0.5;
  const gap = 1.5;

  const allSides: { key: RoomSide; pos: [number, number, number] }[] = [
    { key: 'north', pos: [0,             btnY, -(D / 2 + gap)] },
    { key: 'south', pos: [0,             btnY,  D / 2 + gap]   },
    { key: 'east',  pos: [ W / 2 + gap,  btnY, 0]              },
    { key: 'west',  pos: [-(W / 2 + gap), btnY, 0]             },
  ];
  const sides = allSides.filter(({ key }) => !occupiedSides?.has(key));

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

/** One sibling-room wall — resolves that wall's OWN covering (not just the
 *  room-wide "ALL" default) and actually shows an oboy/texture image or
 *  procedural pattern instead of a flat placeholder tint, same as the active
 *  room. Its own component (not inlined in the .map() below) because a
 *  `kind: 'texture'` covering needs async image loading with its own state. */
function SiblingWall({
  wallId, position, size, coverings,
}: {
  wallId: 'A' | 'B' | 'C' | 'D'
  position: [number, number, number]
  size: [number, number, number]
  coverings: DesignState['wallCoverings'] | undefined
}) {
  const covering = coverings ? resolveWallCovering(coverings, wallId) : undefined
  const textureUrl = covering?.kind === 'texture' ? covering.url : null
  const [loadedTex, setLoadedTex] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    if (!textureUrl) { setLoadedTex(null); return }
    const unsub = requestSharedTexture(
      textureUrl,
      (entry) => setLoadedTex(entry.tex),
      () => setLoadedTex(null),
    )
    return unsub
  }, [textureUrl])

  const oboyTex = useMemo(() => {
    if (covering?.kind !== 'oboy') return null
    return createOboyTexture(covering.patternId as OboyPatternId, covering.baseColor, covering.accentColor)
  }, [covering])

  const flatColor = covering ? resolveWallColor(coverings!, wallId) : SIBLING_WALL_COLOR_DEFAULT
  const map = covering?.kind === 'texture' ? loadedTex : covering?.kind === 'oboy' ? oboyTex : null

  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial map={map ?? undefined} color={map ? '#ffffff' : flatColor} />
    </mesh>
  )
}


export function SiblingRooms({
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
        // Wall id ↔ side matches getWallPlane(): A back (z<0), C front (z>0),
        // D left (x<0), B right (x>0) — each wall resolves its OWN covering
        // instead of only ever falling back to the room-wide "ALL" default.
        const walls: Array<{ id: 'A' | 'C' | 'D' | 'B'; p: [number, number, number]; s: [number, number, number] }> = [
          { id: 'A', p: [0, h / 2, -d / 2], s: [w + 0.08, h, 0.08] },
          { id: 'C', p: [0, h / 2, d / 2], s: [w + 0.08, h, 0.08] },
          { id: 'D', p: [-w / 2, h / 2, 0], s: [0.08, h, d] },
          { id: 'B', p: [w / 2, h / 2, 0], s: [0.08, h, d] },
        ];
        // Real design state, when the sibling has been saved with one —
        // shows this room's actual wall colour/oboy/floor finish instead of a
        // fixed placeholder tint. Furniture placements referencing a custom
        // (user-uploaded) model still won't resolve here — those blobs live
        // only in the browser that imported them — but built-in catalog and
        // do'kon (shop) furniture render for real, same as FurnitureItem
        // does for the active room.
        const design = sib.state?.designState as DesignState | undefined
        const floorColor = design?.floorType
          ? SIBLING_FLOOR_COLOR_BY_TYPE[design.floorType] ?? SIBLING_FLOOR_COLOR_DEFAULT
          : SIBLING_FLOOR_COLOR_DEFAULT
        const placedFurniture = (sib.state?.furniture as PlacedFurniture[] | undefined) ?? []
        return (
          <group key={sib.id} position={[x, 0, z]}>
            <mesh
              position={[0, 0.02, 0]}
              onClick={(e) => { e.stopPropagation(); open(); }}
              onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
              onPointerOut={() => { document.body.style.cursor = 'auto'; }}
            >
              <boxGeometry args={[w, 0.04, d]} />
              <meshStandardMaterial color={floorColor} />
            </mesh>
            {walls.map((seg) => (
              <SiblingWall
                key={seg.id}
                wallId={seg.id}
                position={seg.p}
                size={seg.s}
                coverings={design?.wallCoverings}
              />
            ))}
            {placedFurniture.map((item) => (
              <FurnitureItem key={item.id} item={item} />
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


/** Mounts the interactive 3D doors and windows. The wrapper is what lets the
 *  cutaway hook run inside the Canvas while its controls live on the page. */
export function OpeningLayer({
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
