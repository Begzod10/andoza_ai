import { useTranslation } from "react-i18next";
import { useMemo, type RefObject } from "react";
import { FocusFade } from "@/features/studio/diorama";
import type { ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Room } from "@/lib/api";
import type { RoomGeometry } from "@/store/roomStore";
import { type ToolMode } from "@/features/studio/StudioFurniture";
import { DoorLeaves, WindowSashes, type DoorToolMode } from "@/components/studio/DoorLeaves";
import { useHiddenWalls, type CutawayMode } from "@/features/studio/diorama";
import {
  ADD_ROOM_BTN_STYLE, SIBLING_DELETE_STYLE,
  type RoomSide,
} from "./constants";
import { roomFootprint, computeAbsolutePositions } from "./helpers";
import { isRoomVisible } from "@/lib/roomFocus";
import { SiblingRoomBody } from "./SiblingRoomScene";
import { useViewLockStore } from "@/store/viewLockStore";
import type { RoomRenderPlan } from "@/lib/flatOpenings";

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
  const { t } = useTranslation();
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
            title={t('studio.three_d.xona_qoshish')}
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
  const { t } = useTranslation();
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={focused ? t('studio.three_d.hamma_xonalar') : t('studio.three_d.faqat_shu_xona')}
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
  siblingPlans,
  onDelete,
  onOpen,
  positionOverride = null,
  focusedRoomId,
  onToggleFocus,
}: {
  rooms: Room[];
  activeId: string;
  activeW: number;
  activeD: number;
  activePos: { x: number; z: number } | null;
  /** What each sibling draws (lib/flatOpenings' `flatRenderPlan`, built with
   *  the active room's LIVE geometry, so a door added, moved or deleted there
   *  shows through the neighbour's wall at once): its shell geometry, with the
   *  neighbours' openings cut in and its own shared doorways marked, and its
   *  walls against the active room. */
  siblingPlans?: ReadonlyMap<string, RoomRenderPlan>;
  onDelete: (roomId: string, name: string) => void;
  /** Opens a neighbouring room in place, from a tap on it (lib/roomSwitch). */
  onOpen: (roomId: string, e: ThreeEvent<MouseEvent>) => void;
  /** Where a room being moved stands mid-drag (open room's frame). */
  positionOverride?: { id: string; x: number; z: number } | null;
  /** The room being looked at alone, or null for the whole flat. */
  focusedRoomId: string | null;
  onToggleFocus: (roomId: string) => void;
}) {
  const { t } = useTranslation();
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

  const locked = useViewLockStore((st) => st.locked);
  return (
    <>
      {layout.map(({ room: sib, w, d, x, z }) => {
        const h = sib.ceiling_h ?? 2.7;
        return (
          // Fades out when another room is focused, and back in — rather than
          // vanishing in one frame (FocusFade unmounts it once it is gone).
          <FocusFade key={sib.id} show={isRoomVisible(focusedRoomId, sib.id)}>
          <group position={positionOverride?.id === sib.id ? [positionOverride.x, 0, positionOverride.z] : [x, 0, z]}>
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
              activeWM={activeW}
              activeDM={activeD}
              siblingCount={layout.length}
              shellGeometry={siblingPlans?.get(sib.id)?.shell}
              partitionWithActive={siblingPlans?.get(sib.id)?.partitionWalls}
              onOpen={(e) => onOpen(sib.id, e)}
            />
            {/* No name pill: every room in the flat carried one, so a
                four-room flat wore four name tags across the view, and they
                are fixed-size so a room 30 m away shouted as loudly as the one
                next door. The name said nothing a user looking at their own
                flat needed; rooms are opened from the ⋮ menu's list. Focus
                and delete stay: those are actions, not labels. */}
            <Html position={[0, h + 0.3, 0]} center zIndexRange={[90, 0]}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FocusButton
                  focused={focusedRoomId === sib.id}
                  onClick={() => onToggleFocus(sib.id)}
                />
                {/* An edit, so it goes while the view is locked; focus is
                    looking, so it stays. */}
                {!locked && (
                  <button
                    style={SIBLING_DELETE_STYLE}
                    onClick={(e) => { e.stopPropagation(); onDelete(sib.id, sib.name); }}
                    title={t('studio.three_d.xonani_ochirish')}
                  >
                    ✕
                  </button>
                )}
              </div>
            </Html>
          </group>
          </FocusFade>
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
  /** The room's own openings (lib/flatOpenings' active leaf layer). Nothing
   *  borrowed hangs here: the room that owns a doorway hangs its one leaf,
   *  from its own side, whichever room is open. */
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
