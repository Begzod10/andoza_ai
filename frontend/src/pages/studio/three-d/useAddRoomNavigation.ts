import { useState } from "react";
import type { NavigateFunction } from "react-router-dom";
import { useRoomStore } from "@/store/roomStore";
import { createRoom, getRooms, updateRoom, type Room } from "@/lib/api";
import {
  clampRoomDimension,
  newRoomGeometry,
  newRoomCentreFromWall,
  type WallAnchor,
} from "@/lib/newRoomFromWall";
import { sharedOpeningsFor } from "@/lib/sharedOpenings";
import { computeAbsolutePositions } from "./helpers";
import type { RoomSide } from "./constants";

/**
 * Where the active room actually sits in the apartment's shared layout frame —
 * the point a new neighbour has to be measured from.
 *
 * A stored `layoutPos` is the answer whenever there is one. The case that bit
 * is when there is not: falling back to the origin is only safe in an empty
 * flat. This user's apartment has six rooms whose stored positions march along
 * x (0, 3.52, 7.04, 10.64, 14.29, 17.89) while the older rooms carry no
 * position at all, so anchoring an unpositioned room at the origin put it
 * straight on top of the room already parked at x = 0 — and the "new room
 * behind this wall" then landed inside a different room entirely.
 *
 * `computeAbsolutePositions` already answers this for the whole flat in one
 * frame, which is the frame the siblings are RENDERED in: stored positions
 * verbatim, unpositioned rooms in a row that starts clear of them. Asking it
 * where the active room is drawn is therefore the same question as "where is
 * this room", and using any other answer would place the new room relative to
 * somewhere this room is not.
 */
export function addRoomAnchor(
  storedPos: { x: number; z: number } | null | undefined,
  siblings: Room[] | null | undefined,
  activeId: string,
  activeW: number,
  activeD: number,
): { x: number; z: number } {
  if (storedPos) return storedPos;
  if (siblings && siblings.length > 0) {
    const laidOut = computeAbsolutePositions(siblings, activeId, activeW, activeD).get(activeId);
    if (laidOut) return laidOut;
  }
  // No room list (offline, or the fetch failed) and nothing stored: the origin
  // is what the whole layout frame assumes for a flat's first room, and with
  // no list there is no sibling known to be standing there.
  return { x: 0, z: 0 };
}

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
    wall: WallAnchor,
    dims: { widthMm: number; depthMm: number; heightMm: number; wallThicknessMm: number },
  ): Promise<void> {
    const side = wall.side;
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
      // is the "my old room disappeared" report.
      //
      // The flat's room list is fetched here rather than taken from
      // ThreeDPage: its `aptRooms` query is gated on the top-down preset,
      // which this page no longer has, so it never resolves. Best-effort —
      // a failed fetch just falls back to the origin, same as before.
      let siblings: Room[] | null = null;
      try { siblings = await getRooms(aptId); } catch { /* offline — anchor falls back */ }

      const store = useRoomStore.getState();
      const myPos = addRoomAnchor(store.layoutPos, siblings, room.id, W, D);
      if (!store.layoutPos) {
        // Persisting the anchor we just worked out, not just the fact that
        // there is one: the next room added from here must measure from the
        // same place, or this room drifts a slot further along the fallback
        // row every time a neighbour is created.
        store.setLayoutPos(myPos);
        // The WHOLE state, with the position merged in — never `{ layoutPos }`
        // on its own. The API replaces `state` wholesale
        // (`room.state = body.state` in backend/app/routers/rooms.py), so a
        // one-key write deletes this room's finishes, its furniture, its
        // lights and its name, moments after onSave() wrote them. The room
        // then reopens as a bare grey box, which is exactly what "my first
        // room disappeared" looked like.
        const keptState = (room.state ?? {}) as Record<string, unknown>;
        try {
          await updateRoom(room.id, { state: { ...keptState, layoutPos: myPos } });
        } catch { /* ignore */ }
      }

      // Clamped once, here, and used for both the geometry and the openings:
      // `newRoomGeometry` clamps internally, so fitting a door to the raw
      // number would fit it to a wall the room does not end up having.
      const widthMm = clampRoomDimension(dims.widthMm, "width");
      const depthMm = clampRoomDimension(dims.depthMm, "depth");

      // A door already in the tapped wall has to exist in the new room's
      // facing wall too, in the same place, or the door opens onto a solid
      // partition and the new room is sealed off behind it. Read from the
      // store (millimetres) and returned in API units; null only when the
      // tapped wall cannot be read, which is already impossible here because
      // `wallAnchorOf` resolved it to open the sheet.
      const shared = sharedOpeningsFor(store.geometry, wall.wallId, { widthMm, depthMm });

      const created = await createRoom(aptId, {
        name: "Xona",
        ceiling_h: dims.heightMm / 1000,
        geometry: newRoomGeometry(widthMm, depthMm, shared),
      });

      // Centred on the wall that was tapped, one wall thickness beyond it.
      const pos = newRoomCentreFromWall(
        myPos, wall,
        { widthM: widthMm / 1000, depthM: depthMm / 1000 },
        dims.wallThicknessMm / 1000,
      );
      // Best-effort: a room without a stored position still opens, it just
      // falls back to the legacy layout guess until it is saved again.
      try {
        await updateRoom(created.id, {
          state: { layoutPos: pos, wallThicknessMm: dims.wallThicknessMm },
        });
      } catch { /* ignore */ }

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
