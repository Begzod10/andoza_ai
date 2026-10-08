import { useState } from "react";
import type { NavigateFunction } from "react-router-dom";
import { useRoomStore } from "@/store/roomStore";
import { createRoom, updateRoom, type Room } from "@/lib/api";
import { newRoomGeometry, newRoomLayoutPos } from "@/lib/newRoomFromWall";
import type { RoomSide } from "./constants";

/**
 * "+ Add room" flow: saves the current room, remembers where it sits in the
 * apartment's shared layout frame, clears the store, and hands off to the
 * room-creation wizard anchored next to this room. Split out of
 * ThreeDPage.tsx — see that file's header comment for the full picture.
 */
export function useAddRoomNavigation(params: {
  room: Room;
  onSave: () => Promise<void>;
  resetRoom: () => void;
  navigate: NavigateFunction;
  W: number;
  D: number;
}) {
  const { room, onSave, resetRoom, navigate, W, D } = params;
  const [addingRoom, setAddingRoom] = useState(false);

  async function handleAddRoom(side: RoomSide) {
    if (addingRoom) return;
    setAddingRoom(true);
    try { await onSave(); } catch { /* continue even if save fails (offline mode) */ }
    setAddingRoom(false);
    const aptId = room.apartment_id && room.apartment_id !== 'local' ? room.apartment_id : null;
    // Anchor info for directional placement — captured before resetRoom clears it
    const myPos = useRoomStore.getState().layoutPos ?? { x: 0, z: 0 };
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

  /**
   * The same thing, but finished here instead of in the wizard.
   *
   * `handleAddRoom` above hands off to the wizard because it is launched from
   * the top-down view, where the user is picking a side and has said nothing
   * about the room yet. Tapping a wall is a narrower question — the wall says
   * which side, and the sheet has already asked for the dimensions — so there
   * is nothing left for a wizard to collect, and sending the user through one
   * would mean leaving the room they are standing in to answer questions they
   * have just answered.
   *
   * The current room is saved first, for the same reason the wizard path saves
   * first: navigating away from unsaved work loses it.
   */
  async function createRoomThroughWall(
    side: RoomSide,
    dims: { widthMm: number; depthMm: number; heightMm: number },
  ): Promise<void> {
    if (addingRoom) return;

    // No apartment, no shared layout frame — and a room added to a NEW
    // apartment is not a neighbour of this one, it is a room in a different
    // flat, which is why doing that made the old room vanish from the scene.
    // The wizard path already knows how to handle a room with nowhere to put
    // a sibling, so hand over to it rather than inventing a flat.
    const aptId = room.apartment_id && room.apartment_id !== "local"
      ? room.apartment_id
      : null;
    if (!aptId) { await handleAddRoom(side); return; }

    setAddingRoom(true);
    try {
      try { await onSave(); } catch { /* continue even if save fails (offline) */ }

      // THIS room's own position has to be on record before a neighbour is
      // placed beside it. Rooms without a stored layoutPos are laid out by
      // `computeAbsolutePositions` in a fallback row that starts clear of
      // every positioned room — so storing a position for the new room while
      // leaving this one unpositioned shunts this one off to the side, which
      // is the "my old room disappeared" report. Anchoring at the origin is
      // what the whole layout frame already assumes for the first room.
      const store = useRoomStore.getState();
      const myPos = store.layoutPos ?? { x: 0, z: 0 };
      if (!store.layoutPos) {
        store.setLayoutPos(myPos);
        try { await updateRoom(room.id, { state: { layoutPos: myPos } }); } catch { /* ignore */ }
      }

      const created = await createRoom(aptId, {
        name: "Xona",
        ceiling_h: dims.heightMm / 1000,
        geometry: newRoomGeometry(dims.widthMm, dims.depthMm),
      });

      const pos = newRoomLayoutPos(
        myPos, side,
        { widthM: W, depthM: D },
        { widthM: dims.widthMm / 1000, depthM: dims.depthMm / 1000 },
      );
      // Best-effort: a room without a stored position still opens, it just
      // falls back to the legacy layout guess until it is saved again.
      try { await updateRoom(created.id, { state: { layoutPos: pos } }); } catch { /* ignore */ }

      // The studio bails out of creating a room when roomId is already set, so
      // the store has to be cleared before navigating into the new one.
      resetRoom();
      navigate(`/studio/${created.id}/ichkarida`);
    } finally {
      setAddingRoom(false);
    }
  }

  return { addingRoom, handleAddRoom, createRoomThroughWall };
}
