import { useState } from "react";
import type { NavigateFunction } from "react-router-dom";
import { useRoomStore } from "@/store/roomStore";
import type { Room } from "@/lib/api";
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

  return { addingRoom, handleAddRoom };
}
