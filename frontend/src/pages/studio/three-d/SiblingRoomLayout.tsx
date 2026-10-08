import { useMemo, type RefObject } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Room } from "@/lib/api";
import type { RoomGeometry } from "@/store/roomStore";
import { type ToolMode } from "@/features/studio/StudioFurniture";
import { DoorLeaves, WindowSashes, type DoorToolMode } from "@/components/studio/DoorLeaves";
import { useHiddenWalls, type CutawayMode } from "@/features/studio/diorama";
import {
  ADD_ROOM_BTN_STYLE, SIBLING_LABEL_STYLE, SIBLING_DELETE_STYLE,
  type RoomSide,
} from "./constants";
import { roomFootprint, computeAbsolutePositions } from "./helpers";
import { isRoomVisible } from "@/lib/roomFocus";
import { SiblingRoomBody } from "./SiblingRoomScene";

/**
 * The apartment floor plan around the active room: "+ add room" buttons,
 * the apartment's other rooms placed around it, and the interactive
 * door/window layer. What each of those rooms LOOKS like is
 * SiblingRoomScene's job — this file owns where they go and the chrome
 * around them. Split out of ThreeDPage.tsx — see that file's header
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
// Places the apartment's other rooms around the active one and hangs each
// one's label, focus toggle and delete button above it; the room itself is
// drawn by SiblingRoomScene, with the same shell the active room uses. Data
// and navigation come in as props: router/query contexts don't bridge into
// the R3F Canvas tree.

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

// `flatExtent` (how far the flat reaches around the active room, which is what
// the zoom-out limit has to clear) moved to ./helpers, next to the layout pass
// it is built on: it is pure math, and keeping it here meant a test of it had
// to import this file's whole R3F/drei tree.

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
        return (
          <group key={sib.id} position={[x, 0, z]}>
            {/* What the room IS lives in SiblingRoomScene: the real room shell,
                read-only, built from this room's own saved geometry and design
                state. It used to be a solid-colour slab and four tinted boxes
                here — no ceiling, no trims, no openings — which is what the
                user meant by having to re-specify, room by room, everything
                they had already specified once. This component keeps what it
                is good at: where each room goes in the flat, and the chrome
                around it (name, focus, delete). */}
            <SiblingRoomBody
              room={sib}
              wM={w}
              dM={d}
              hM={h}
              offsetXM={x}
              offsetZM={z}
              siblingCount={layout.length}
              onOpen={open}
            />
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
