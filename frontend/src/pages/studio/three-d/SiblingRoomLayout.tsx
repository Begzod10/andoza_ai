import { useEffect, useMemo, useState, type RefObject } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import type { Room } from "@/lib/api";
import { resolveWallCovering, resolveWallColor, DEFAULT_DESIGN_STATE } from "@/store/roomStore";
import type { DesignState, PlacedFurniture, RoomGeometry } from "@/store/roomStore";
import { createOboyTexture } from "@/lib/oboyPatterns";
import type { OboyPatternId } from "@/lib/oboyPatterns";
import { requestSharedTexture } from "@/lib/sharedWallTexture";
import { FurnitureItem, type ToolMode } from "@/features/studio/StudioFurniture";
import { DoorLeaves, WindowSashes, type DoorToolMode } from "@/components/studio/DoorLeaves";
import { useHiddenWalls, type CutawayMode } from "@/features/studio/diorama";
import {
  ADD_ROOM_BTN_STYLE, SIBLING_LABEL_STYLE, SIBLING_DELETE_STYLE,
  SIBLING_FLOOR_COLOR_BY_TYPE, SIBLING_FLOOR_COLOR_DEFAULT,
  type RoomSide,
} from "./constants";
import { roomFootprint, computeAbsolutePositions } from "./helpers";
import { isRoomVisible } from "@/lib/roomFocus";

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
  // A brand-new room has no saved coverings blob yet, but opened in the studio
  // it renders DEFAULT_DESIGN_STATE. Fall back to that same default here so a
  // fresh neighbour reads the way opening it would, rather than some other
  // colour that contradicts it.
  const covering = coverings
    ? resolveWallCovering(coverings, wallId)
    : DEFAULT_DESIGN_STATE.wallCoverings.ALL
  const textureUrl = covering?.kind === 'texture' ? covering.url : null
  const texRepeatPerM = covering?.kind === 'texture' ? covering.repeatX : 1
  const [loadedTex, setLoadedTex] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    if (!textureUrl) { setLoadedTex(null); return }
    let clone: THREE.Texture | null = null
    const unsub = requestSharedTexture(
      textureUrl,
      (entry) => {
        // Clone (shares the image) so this wall's repeat doesn't fight other
        // users of the shared texture; scale by the covering's tiles-per-metre
        // so a pattern renders near true size instead of one stretched tile.
        clone = entry.tex.clone()
        const along = Math.max(size[0], size[2])
        clone.repeat.set(
          Math.max(0.25, along * texRepeatPerM),
          Math.max(0.25, size[1] * texRepeatPerM),
        )
        clone.needsUpdate = true
        setLoadedTex(clone)
      },
      () => setLoadedTex(null),
    )
    return () => { unsub(); clone?.dispose() }
    // size is a fresh array literal per render; its values are stable per wall
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textureUrl, texRepeatPerM])

  const oboyTex = useMemo(() => {
    if (covering?.kind !== 'oboy') return null
    return createOboyTexture(covering.patternId as OboyPatternId, covering.baseColor, covering.accentColor)
  }, [covering])

  // Read the default's own colour rather than naming a second one here: a
  // hardcoded fallback is how this drifted out of step with the default in the
  // first place.
  const flatColor = coverings
    ? resolveWallColor(coverings, wallId)
    : resolveWallColor(DEFAULT_DESIGN_STATE.wallCoverings, wallId)
  const map = covering?.kind === 'texture' ? loadedTex : covering?.kind === 'oboy' ? oboyTex : null

  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial map={map ?? undefined} color={map ? '#ffffff' : flatColor} />
    </mesh>
  )
}


/**
 * Look at one room on its own.
 *
 * Four corner brackets, which is the camera-viewfinder mark for "frame this"
 * — the same thing the button does. It is a toggle, and the pressed state is
 * what tells the user they are in focus rather than in a flat that has
 * mysteriously lost its other rooms.
 */
export function FocusButton({ focused, onClick }: { focused: boolean; onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={focused ? "Barcha xonalarni ko'rsatish" : "Faqat shu xonani ko'rsatish"}
      aria-pressed={focused}
      style={{
        width: 26, height: 26, borderRadius: 8, border: 'none', padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', pointerEvents: 'auto',
        background: focused ? '#1E40AF' : 'rgba(255,255,255,0.95)',
        color: focused ? '#fff' : '#1E40AF',
        boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3" />
      </svg>
    </button>
  );
}

/** The same button for the room the user is actually editing, floated above
 *  it. The active room has no sibling label bar to live in. */
export function ActiveRoomFocusButton({ H, focused, onClick }: {
  H: number; focused: boolean; onClick: () => void;
}) {
  return (
    <Html position={[0, H + 0.3, 0]} center zIndexRange={[90, 0]} style={{ pointerEvents: 'none' }}>
      <FocusButton focused={focused} onClick={onClick} />
    </Html>
  );
}

export function SiblingRooms({
  rooms,
  activeId,
  activeW,
  activeD,
  activePos,
  onOpen,
  onDelete,
  focusedRoomId,
  onToggleFocus,
}: {
  rooms: Room[];
  activeId: string;
  activeW: number;
  activeD: number;
  activePos: { x: number; z: number } | null;
  onOpen: (roomId: string) => void;
  onDelete: (roomId: string, name: string) => void;
  /** The room being looked at alone, or null for the whole flat. */
  focusedRoomId: string | null;
  onToggleFocus: (roomId: string) => void;
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
      {layout.filter(({ room: sib }) => isRoomVisible(focusedRoomId, sib.id))
        .map(({ room: sib, w, d, x, z }) => {
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
                <FocusButton
                  focused={focusedRoomId === sib.id}
                  onClick={() => onToggleFocus(sib.id)}
                />
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
  geometry, W, D, cutaway, toolMode, controlsRef, selectedId, onSelect, openMenu, hiddenWalls: alsoHidden,
}: {
  geometry: RoomGeometry;
  W: number;
  D: number;
  cutaway: CutawayMode;
  toolMode: ToolMode;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Opens the tapped opening's own ring — see DoorLeaves' `openMenu`. */
  openMenu?: (kind: 'door' | 'window', wallId: string, elId: string, e: ThreeEvent<MouseEvent>) => void;
  /** Walls the camera is behind. A culled wall takes its door with it. */
  hiddenWalls?: ReadonlySet<string>;
}) {
  const cutawayHidden = useHiddenWalls(cutaway);
  const hiddenWalls = useMemo(
    () => new Set([...cutawayHidden, ...(alsoHidden ?? [])]),
    [cutawayHidden, alsoHidden],
  );
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
      <DoorLeaves {...shared} openMenu={(wallId, elId, e) => openMenu?.('door', wallId, elId, e)} />
      <WindowSashes {...shared} openMenu={(wallId, elId, e) => openMenu?.('window', wallId, elId, e)} />
    </>
  );
}
