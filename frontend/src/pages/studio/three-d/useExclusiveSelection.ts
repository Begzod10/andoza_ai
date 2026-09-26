import { useRef, useState } from "react";
import type { SelectedPart } from "@/features/studio/StudioFurniture";
import type { OpeningSel } from "@/components/studio/WallOpenings";

/**
 * Mutually-exclusive selection across object types. Five independent
 * selection states exist in the 3D studio: furniture, a furniture sub-part,
 * a door/window (opening editor layer), a door/window (separate WallOpenings
 * drag layer), and a ceiling light. They used to be set independently, so
 * selecting one never cleared the others — e.g. a ceiling light's live
 * wall-distance dimension labels stayed on screen after the user went on to
 * select an unrelated piece of furniture.
 *
 * These wrappers make a real (non-null) selection of one type clear all the
 * others. Deselecting (passing null) intentionally does NOT touch sibling
 * state — e.g. a delete button calling onSelect(null) shouldn't also wipe an
 * unrelated selection.
 *
 * Split out of ThreeDPage.tsx — see that file's header comment for the full
 * picture.
 */
export function useExclusiveSelection() {
  const [selectedFurId, setSelectedFurId] = useState<string | null>(null);
  const [selectedPart, setSelectedPart] = useState<SelectedPart | null>(null);
  const [selectedDoorId, setSelectedDoorId] = useState<string | null>(null);
  const [selectedLightId, setSelectedLightId] = useState<string | null>(null);
  const [selOpening, setSelOpening] = useState<OpeningSel | null>(null);

  // Live refs for consumers (e.g. keyboard shortcuts) that need the current
  // value without resubscribing an effect on every selection change.
  const selectedFurIdRef = useRef<string | null>(null);
  selectedFurIdRef.current = selectedFurId;
  const selectedPartRef = useRef<SelectedPart | null>(null);
  selectedPartRef.current = selectedPart;

  function selectFurniture(id: string | null) {
    setSelectedFurId(id);
    if (id !== null) { setSelectedPart(null); setSelectedDoorId(null); setSelectedLightId(null); setSelOpening(null); }
  }
  function selectFurniturePart(part: SelectedPart | null) {
    setSelectedPart(part);
    if (part !== null) { setSelectedFurId(null); setSelectedDoorId(null); setSelectedLightId(null); setSelOpening(null); }
  }
  function selectDoor(id: string | null) {
    setSelectedDoorId(id);
    if (id !== null) { setSelectedFurId(null); setSelectedPart(null); setSelectedLightId(null); setSelOpening(null); }
  }
  function selectLight(id: string | null) {
    setSelectedLightId(id);
    if (id !== null) { setSelectedFurId(null); setSelectedPart(null); setSelectedDoorId(null); setSelOpening(null); }
  }
  function selectOpening(sel: OpeningSel | null) {
    setSelOpening(sel);
    if (sel !== null) { setSelectedFurId(null); setSelectedPart(null); setSelectedDoorId(null); setSelectedLightId(null); }
  }

  /** Clears every selection at once — used by the canvas's onPointerMissed. */
  function clearAll() {
    setSelectedFurId(null);
    setSelectedPart(null);
    setSelectedDoorId(null);
    setSelectedLightId(null);
    setSelOpening(null);
  }

  return {
    selectedFurId, setSelectedFurId, selectedFurIdRef,
    selectedPart, setSelectedPart, selectedPartRef,
    selectedDoorId, setSelectedDoorId,
    selectedLightId, setSelectedLightId,
    selOpening, setSelOpening,
    selectFurniture, selectFurniturePart, selectDoor, selectLight, selectOpening,
    clearAll,
  };
}
