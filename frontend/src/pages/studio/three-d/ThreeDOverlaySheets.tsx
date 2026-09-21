import type { Dispatch, SetStateAction } from "react";
import { AddObjectSheet } from "@/components/studio/AddObjectSheet";
import RoomSettingsSheet from "@/components/studio/RoomSettingsSheet";
import NewWindowSheet, { type NewWindowValues } from "@/components/studio/NewWindowSheet";
import { AiBuilderSheet } from "@/components/studio/AiBuilderSheet";
import SurfaceRadialMenu, { type RadialItem } from "@/components/studio/SurfaceRadialMenu";
import type { WallElement } from "@/store/roomStore";
import type { ScanSwapRequest } from "./RoomScanOverlay";
import type { RadialState } from "./useSurfaceRadialMenu";

/**
 * Floating sheets and overlays anchored to the 3D studio page (not the
 * canvas itself): the "add object" / catalog-swap sheets, the door/window
 * settings sheet, the new-window confirmation sheet, the AI builder sheet,
 * and the surface long-press radial ("aylana") menu. Split out of
 * ThreeDPage.tsx — see that file's header comment for the full picture.
 */
export function ThreeDOverlaySheets({
  showAddSheet, setShowAddSheet, addSheetSection,
  scanSwap, setScanSwap, setReplacedGhosts,
  elementsSheetOpen, setElementsSheetOpen,
  pendingWindowSpot, setPendingWindowSpot,
  wallGeom, computeOpeningRect, addElement, setSelectedWall,
  showAiSheet, setShowAiSheet, roomId,
  radial, radialItems, closeRadial,
}: {
  showAddSheet: boolean;
  setShowAddSheet: Dispatch<SetStateAction<boolean>>;
  addSheetSection: 'wallpaper' | 'lyustra' | 'furniture';
  scanSwap: ScanSwapRequest | null;
  setScanSwap: Dispatch<SetStateAction<ScanSwapRequest | null>>;
  setReplacedGhosts: Dispatch<SetStateAction<Set<number>>>;
  elementsSheetOpen: boolean;
  setElementsSheetOpen: Dispatch<SetStateAction<boolean>>;
  pendingWindowSpot: { wallId: string; point: { x: number; y: number; z: number }; initialSillHeight: number } | null;
  setPendingWindowSpot: Dispatch<SetStateAction<{
    wallId: string; point: { x: number; y: number; z: number }; initialSillHeight: number;
  } | null>>;
  wallGeom: (wallId: string) => { axis: 'X' | 'Z'; length: number; leftAlong: number } | null;
  computeOpeningRect: (
    g: { axis: 'X' | 'Z'; leftAlong: number; length: number },
    point: { x: number; y: number; z: number },
    widthMm: number, heightMm: number, isDoor: boolean,
  ) => { position: number; sill_height: number };
  addElement: (wallId: string, element: Omit<WallElement, 'id'>) => void;
  setSelectedWall: Dispatch<SetStateAction<string | null>>;
  showAiSheet: boolean;
  setShowAiSheet: Dispatch<SetStateAction<boolean>>;
  roomId: string;
  radial: RadialState;
  radialItems: (r: NonNullable<RadialState>) => RadialItem[];
  closeRadial: () => void;
}) {
  function handleNewWindowConfirm(values: NewWindowValues) {
    if (!pendingWindowSpot) return;
    const { wallId, point } = pendingWindowSpot;
    const g = wallGeom(wallId);
    if (g) {
      // Only the horizontal position gets recomputed here (there's no
      // stepper for it — width is the only thing that affects it) —
      // values.sill_height is used exactly as the sheet reports it,
      // whether that's the tap-based default above or the user's own
      // adjustment, never silently overridden.
      const { position } = computeOpeningRect(g, point, values.width, values.height, false);
      addElement(wallId, { type: 'deraza', ...values, position });
      setSelectedWall(wallId);
    }
    setPendingWindowSpot(null);
  }

  return (
    <>
      {showAddSheet && <AddObjectSheet onClose={() => setShowAddSheet(false)} initialSection={addSheetSection} />}
      {/* Scanned-object → catalog swap: the same catalog picker, filtered to the
          object's category and placed at the ghost's position/rotation. */}
      {scanSwap && (
        <AddObjectSheet
          onClose={() => setScanSwap(null)}
          initialSection="furniture"
          initialCategory={scanSwap.category}
          placementOverride={{ x: scanSwap.x, y: scanSwap.y, rotation: scanSwap.rotation }}
          onPlaced={() => setReplacedGhosts((prev) => new Set(prev).add(scanSwap.index))}
        />
      )}
      <RoomSettingsSheet open={elementsSheetOpen} onClose={() => setElementsSheetOpen(false)} />
      <NewWindowSheet
        isOpen={pendingWindowSpot !== null}
        onClose={() => setPendingWindowSpot(null)}
        initialSillHeight={pendingWindowSpot?.initialSillHeight}
        onConfirm={handleNewWindowConfirm}
      />
      <AiBuilderSheet open={showAiSheet} onOpenChange={setShowAiSheet} roomId={roomId} />

      {/* Surface long-press radial menu ("aylana") */}
      {radial && (
        <SurfaceRadialMenu
          x={radial.x}
          y={radial.y}
          surface={radial.surface}
          items={radialItems(radial)}
          onClose={closeRadial}
        />
      )}
    </>
  );
}
