import type { RoomScan } from "@/lib/api";
import type { RoomGeometry } from "@/store/roomStore";

/**
 * LiDAR room-scan reference overlay — RETIRED.
 *
 * This used to draw two things over a scanned room: a semi-transparent GLB
 * of the whole capture, and a "ghost box" per detected piece of furniture
 * (removed first — see RoomScanConverter.toRoomDraft on the mobile side,
 * which stopped a NEW scan from reporting furniture at all).
 *
 * The GLB had to go too: it comes from Apple RoomPlan's own `.parametric`
 * USD export (`room.export(to:exportOptions:)` in RoomScanViewController.
 * swift), which bakes the room's walls AND its furniture into ONE file —
 * there is no RoomPlan option to export the shape without the furniture.
 * So as long as this overlay rendered that GLB at all, a scanned room kept
 * showing furniture-shaped geometry regardless of the ghost-box removal.
 * The product decision (user-requested) is that a LiDAR scan is for the
 * room's own shape; the user places furniture afterwards in the studio —
 * so this overlay now renders nothing, for every room, old or new.
 *
 * `RoomScanReference` stays as a no-op (rather than deleting it and its
 * call site) so ThreeDCanvasScene.tsx needs no matching change.
 * `ScanSwapRequest` stays exported because ThreeDCanvasScene.tsx and
 * ThreeDOverlaySheets.tsx still type their now-inert swap state with it.
 */

/** World-space payload the (now-unreachable) ghost-box swap flow used to
 *  hand off to the catalog sheet. See the file header. */
export interface ScanSwapRequest {
  index: number;
  category: string | null;
  x: number;
  y: number;
  rotation: number;
}

export function RoomScanReference(_props: {
  roomId: string;
  roomScan: RoomScan | null | undefined;
  geometry: RoomGeometry;
  visible: boolean;
  replaced: Set<number>;
  onReplace: (req: ScanSwapRequest) => void;
}) {
  return null;
}
