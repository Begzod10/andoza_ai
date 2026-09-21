import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import { useRoomStore } from "@/store/roomStore";
import type { SelectedPart, ToolMode } from "@/features/studio/StudioFurniture";
import { type CutawayMode } from "@/features/studio/diorama";

/**
 * Desktop power-user keyboard shortcuts for the 3D studio viewport. Split
 * out of ThreeDPage.tsx — see that file's header comment for the full
 * picture.
 */
export function useThreeDKeyboardShortcuts(params: {
  setToolMode: Dispatch<SetStateAction<ToolMode>>;
  setCutaway: Dispatch<SetStateAction<CutawayMode>>;
  setSceneLightOn: Dispatch<SetStateAction<boolean>>;
  setLightsOn: Dispatch<SetStateAction<boolean>>;
  setPresetVersion: Dispatch<SetStateAction<number>>;
  selectedFurIdRef: RefObject<string | null>;
  selectedPartRef: RefObject<SelectedPart | null>;
  setSelectedPart: Dispatch<SetStateAction<SelectedPart | null>>;
  setSelectedFurId: Dispatch<SetStateAction<string | null>>;
  setSelectedWall: Dispatch<SetStateAction<string | null>>;
  setShowHelp: Dispatch<SetStateAction<boolean>>;
}) {
  const {
    setToolMode, setCutaway, setSceneLightOn, setLightsOn, setPresetVersion,
    selectedFurIdRef, selectedPartRef, setSelectedPart, setSelectedFurId, setSelectedWall, setShowHelp,
  } = params;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      switch (e.key.toLowerCase()) {
        case '1': setToolMode('select'); break;
        case '2': setToolMode('move'); break;
        case '3': setToolMode('rotate'); break;
        case '4': setToolMode('scale'); break;
        case '5': setToolMode('part'); break;
        case 'k': setCutaway((m) => (m === 'off' ? 'auto' : 'off')); break;
        case 'n': setSceneLightOn((v) => !v); break;
        case 'l': setLightsOn((v) => !v); break;
        case 'f':
        case 'home': setPresetVersion((n) => n + 1); break;
        case 'delete':
        case 'backspace': {
          // A selected part takes precedence over the whole item
          const part = selectedPartRef.current;
          if (part) {
            useRoomStore.getState().hideFurniturePart(part.itemId, part.partKey);
            setSelectedPart(null);
            break;
          }
          const id = selectedFurIdRef.current;
          if (id) {
            useRoomStore.getState().removeFurniture(id);
            setSelectedFurId(null);
          }
          break;
        }
        case 'escape': setSelectedPart(null); setSelectedFurId(null); setSelectedWall(null); setShowHelp(false); break;
        case '?': setShowHelp((v) => !v); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
