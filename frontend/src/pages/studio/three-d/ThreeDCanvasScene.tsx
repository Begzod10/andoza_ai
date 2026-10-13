import { Suspense, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { updateRoom } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useViewLockStore } from "@/store/viewLockStore";
import { shiftedPose } from "@/lib/roomSwitch";
import { CameraRefBridge, CutOutline, DoorDimensions, GapField, ResizeGhost, ResizeHandles, RoomMoveArrows, RoomMoveInput } from "./RoomSlide";
import { clipRoom, outlineOf, type RoomContent } from "@/lib/clipRoom";
import { flatBoxOf } from "@/lib/flatBoxes";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { isResizable, minSizeMm, resizeBox, resizeGeometry, type Side } from "@/lib/resizeRoom";
import { storeGeometryToApiGeometry } from "@/lib/apiRoomGeometry";
import { partitionDoorSpans } from "@/lib/partitionDoors";
import { slideAxisAgainst, slideTo, type RoomBox } from "@/lib/slideRoom";
import { moveAlong, nearestNeighbour } from "@/lib/moveRoom";
import { useRoomMoveStore } from "@/store/roomMoveStore";
import { FocusFade } from "@/features/studio/diorama";
import { focusFraming } from "@/lib/focusFraming";
import { RoomSwitchCamera } from "./RoomSwitchCamera";
import { OpeningLeaves } from "@/components/studio/DoorLeaves";
import { ViewLockGate } from "./ViewLockGate";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  OrbitControls,
  PerformanceMonitor,
  AdaptiveDpr,
  AdaptiveEvents,
  Grid,
} from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { MultiTouchPan } from "./MultiTouchPan";
import * as THREE from "three";
import type { Room } from "@/lib/api";
import { useRoomStore, type DesignState, type RoomGeometry, type WallElement } from "@/store/roomStore";
import type { SunState } from "@/lib/sunPosition";
import type { SelectedPart, ToolMode } from "@/features/studio/StudioFurniture";
import { DraggableFurnitureModels } from "@/features/studio/StudioFurniture";
import { type CutawayMode } from "@/features/studio/diorama";
import { ReleaseGLOnUnmount, CanvasErrorBoundary } from "@/features/studio/glcleanup";
import { WallOpenings, type OpeningSel } from "@/components/studio/WallOpenings";
import type { RadialSurface } from "@/components/studio/SurfaceRadialMenu";
import { computeAbsolutePositions, computeOccupiedSides, flatExtent, placedSiblingRooms } from "./helpers";
import { flatRenderPlan } from "@/lib/flatOpenings";
import { QiblaMarker } from "./QiblaMarker";
import { RoomScanReference, type ScanSwapRequest } from "./RoomScanOverlay";
import { DraggableLightModels } from "./LightingComponents";
import { DraggableElectricalModels } from "./ElectricalComponents";
import { AddRoomButtons, SiblingRooms, OpeningLayer, ActiveRoomFocusButton } from "./SiblingRoomLayout";
import { RealismEffects, SceneLighting, MoonriseSky, SUN_INTENSITY } from "./SceneEnvironment";
import { MOONRISE_FOG_COLOR, STUDIO_TONE_MAPPING_EXPOSURE } from "@/lib/moonriseSky";
import { skyPinnedSun } from "@/lib/skyPinnedSun";
import { DoubleClickFocus, KeepAutoClear, DevSceneHandle, CameraAnimator } from "./CameraControls";
import { WallsBehindCamera } from "./useWallsBehindCamera";
import { Panorama360 } from "./Panorama360";
import { RoomCameras } from "./RoomCameras";
import type { RenderAspect } from "@/lib/roomCameras";
import { PanoramaSnap } from "./PanoramaSnap";
import { SwapButtons, RoomScene } from "./RoomShell";
import type { RoomSide } from "./constants";
import { applyUniformZoom, fitRoomDistance } from "@/lib/orbitZoom";
import { initialRoomFocus, isRoomVisible, toggleRoomFocus } from "@/lib/roomFocus";
import { SceneLoadingOverlay } from "./SceneLoadingOverlay";

/**
 * Vertical field of view, degrees.
 *
 * 45 was too tight to see a room from inside it — the user asked for the view
 * a 0.6x zoom gives, and a zoom factor is a ratio of tangents:
 * 2 * atan(tan(45/2) / 0.6) = 68. Wide enough to take in a wall and both its
 * corners from across a small room, without the bulge a phone-camera 90 has.
 */
const CAMERA_FOV = 68
/**
 * Holds the zoom-out limit at "the whole room is visible", and no further.
 *
 * Its own component, and inside the Canvas, because it needs the viewport's
 * size and `useThree` only works in a component the Canvas renders — calling
 * it in the one that RENDERS the Canvas is a crash, and this app has shipped
 * that crash to production once already.
 *
 * It writes the limit onto the controls rather than passing it as a prop so
 * that the one place the fit is computed is the one place that knows both the
 * room and the viewport. Both matter: a taller room needs more distance, and
 * so does a narrower window — a phone held upright is much narrower across
 * than it is tall, and the limit has to answer to whichever direction runs out
 * of frame first.
 */
function OrbitZoomLimit({ controlsRef, W, D, H }: {
  controlsRef: MutableRefObject<OrbitControlsImpl | null>
  W: number; D: number; H: number
}) {
  const { size, invalidate } = useThree()
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    controls.maxDistance = fitRoomDistance(
      { W, D, H }, CAMERA_FOV, size.width / Math.max(size.height, 1),
    )
    // A camera already further out than the new limit has to come back in, or
    // the room stays a postage stamp until the user happens to zoom.
    if (controls.getDistance() > controls.maxDistance) {
      controls.dollyIn(controls.getDistance() / controls.maxDistance)
      controls.update()
      invalidate()
    }
  }, [controlsRef, W, D, H, size.width, size.height, invalidate])
  return null
}

/** Why a wall stopped growing into a neighbour, said at the wall. */
const BLOCKED_SAYS: Record<string, string> = {
  opening: "Eshik yoki deraza bor — kesib bo'lmaydi",
  split: "Xona ikkiga bo'linib ketadi",
  hole: "Xona ichida teshik qoladi",
  gone: "Qo'shni xona butunlay yo'qoladi",
  shape: "Bu xonaning shakli kesilmaydi",
};

/** What a cut carries besides its geometry — store field names, the same
 *  in a saved state blob. */
type CutExtras = Pick<RoomContent, 'furniture' | 'lights' | 'electricals' | 'designState'>;
/** A room cut where the selected room grows into it (lib/clipRoom). */
type RoomCut = { id: string; from: { x: number; z: number }; content: RoomContent };

/**
 * The 3D studio's R3F <Canvas> tree: lighting/environment, the room shell
 * (walls/floor/ceiling), every draggable overlay layer (furniture, lights,
 * electrical, openings, scan reference, sibling rooms), camera controls, and
 * postprocessing. Split out of ThreeDPage.tsx — see that file's header
 * comment for the full picture.
 */
export function ThreeDCanvasScene({
  glAttempt, setGlAttempt,
  initCam, dpr, glCanvasRef, onPointerMissed,
  topView, sceneLightOn, sun, W, D, H, highQuality3d,
  room, geometry, designState,
  showContactShadows, useComposer, lightsOn, cutaway,
  selectedWall, focusSurface, holdBind, panorama, onPanoramaCaptured,
  cameraStation, cameraAspect, onViewCaptured, armedOpeningId, onArmOpening,
  selOpening, selectOpening, updateElement, removeElement,
  controlsRef,
  addingRoom, handleAddRoom, aptRooms, activeLayoutPos,
  handleDeleteSibling, onSwitchRoom, onSaveRoom,
  toolMode, selectedFurId, selectFurniture, selectedPart, selectFurniturePart,
  showScan, showQibla, replacedGhosts, setScanSwap,
  selectedDoorId, selectDoor,
  selectedLightId, selectLight,
  topMinDist, maxPolarAngle,
  cam, presetVersion, setPresetVersion,
  setDpr, setDeclineCount,
}: {
  glAttempt: number;
  setGlAttempt: Dispatch<SetStateAction<number>>;
  initCam: { position: [number, number, number]; target: [number, number, number] };
  dpr: number | [number, number];
  glCanvasRef: MutableRefObject<HTMLCanvasElement | null>;
  onPointerMissed: () => void;
  topView: boolean;
  sceneLightOn: boolean;
  sun: SunState;
  W: number; D: number; H: number;
  highQuality3d: boolean;
  room: Room;
  geometry: RoomGeometry;
  designState: DesignState;
  showContactShadows: boolean;
  useComposer: boolean;
  lightsOn: boolean;
  cutaway: CutawayMode;
  selectedWall: string | null;
  focusSurface: (id: string) => void;
  holdBind: (surface: RadialSurface, wallId?: string, elId?: string) => Record<string, unknown>;
  /** The 360 camera: standing in the middle of the room, turning on the spot. */
  panorama: boolean;
  onPanoramaCaptured: (canvas: HTMLCanvasElement) => void;
  /** Which of the four fixed render cameras the user is standing at, 1-based,
   *  or null when they are not at one. */
  cameraStation: number | null;
  cameraAspect: RenderAspect;
  onViewCaptured: (canvas: HTMLCanvasElement, aspect: RenderAspect) => void;
  /** The opening a double tap has armed for dragging, if any. */
  armedOpeningId?: string | null;
  /** Arms an opening for dragging — the hold menu's "Ko'chirish". */
  onArmOpening?: (wallId: string, elId: string) => void;
  selOpening: OpeningSel | null;
  selectOpening: (sel: OpeningSel | null) => void;
  updateElement: (wallId: string, elementId: string, patch: Partial<Omit<WallElement, 'id'>>) => void;
  removeElement: (wallId: string, elementId: string) => void;
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
  addingRoom: boolean;
  handleAddRoom: (side: RoomSide) => void;
  aptRooms: Room[] | undefined;
  activeLayoutPos: { x: number; z: number } | null;
  handleDeleteSibling: (id: string, name: string) => Promise<void>;
  /** Opens a tapped neighbour in place, keeping the view (lib/roomSwitch). */
  onSwitchRoom: (roomId: string, offset: { offsetXM: number; offsetZM: number }, tap: { x: number; y: number }) => void;
  /** Saves the open room — after sliding it along its neighbour. */
  onSaveRoom: () => Promise<void>;
  toolMode: ToolMode;
  selectedFurId: string | null;
  selectFurniture: (id: string | null) => void;
  selectedPart: SelectedPart | null;
  selectFurniturePart: (part: SelectedPart | null) => void;
  showScan: boolean;
  showQibla: boolean;
  replacedGhosts: Set<number>;
  setScanSwap: Dispatch<SetStateAction<ScanSwapRequest | null>>;
  selectedDoorId: string | null;
  selectDoor: (id: string | null) => void;
  selectedLightId: string | null;
  selectLight: (id: string | null) => void;
  cam: { position: [number, number, number]; target: [number, number, number] };
  presetVersion: number;
  setPresetVersion: Dispatch<SetStateAction<number>>;
  topMinDist: number;
  maxPolarAngle: number;
  setDpr: Dispatch<SetStateAction<number | [number, number]>>;
  setDeclineCount: Dispatch<SetStateAction<number>>;
}) {
  /** Which room the user is looking at alone, or null for the whole flat.
   *  Local to the canvas: nothing outside it cares which room is focused. */
  const [focusedRoomId, setFocusedRoomId] = useState<string | null>(null);
  // Focus is a way of looking at THIS flat from THIS room, so it must not
  // outlive the room — and it would. `/studio/:roomId` has no key on its route
  // element, so switching rooms only changes the param: React Router keeps
  // StudioPage → ThreeDPage → ThreeDCanvasScene mounted and this useState
  // survives. Focus a sibling, tap its label to open it, and you arrive in it
  // with focusedRoomId still pointing at it — every OTHER room hidden, the
  // zoom-out limit collapsed to one room so you cannot even pull back to look
  // for them. Focus the room you are IN and then add a neighbour, and you
  // arrive in the new room with the OLD one focused, which hides the new room
  // itself. Both are the "my other room disappeared" report reached a
  // different way, so the focus is dropped whenever the room changes.
  // The one exception is a link that asks for it (`?focus=1`, used right after
  // a scan), which opens that room alone.
  useEffect(() => { setFocusedRoomId(initialRoomFocus(window.location.search, room.id)); }, [room.id]);
  /** How far the flat reaches around this room — what the zoom-out limit has
   *  to clear now that the neighbours are on screen. */
  const flatSpan = useMemo(
    () => flatExtent(aptRooms, room.id, W, D, activeLayoutPos),
    [aptRooms, room.id, W, D, activeLayoutPos],
  );
  /**
   * "that door between should be visible in both rooms": what every room of
   * the flat draws for its openings, the active room included — one plan,
   * lib/flatOpenings. Each doorway through a shared partition is drawn once,
   * by the room that owns it, with an architrave on both faces; every other
   * room cuts its hole. Built from the store's LIVE geometry for this room, so
   * a door added, moved or deleted here shows through the neighbour at once;
   * never written back — nothing borrowed is saved, billed or editable.
   */
  const siblingsPlaced = useMemo(
    () => (aptRooms ? placedSiblingRooms(aptRooms, room.id, W, D, activeLayoutPos) : []),
    [aptRooms, room.id, W, D, activeLayoutPos],
  );
  const flatPlan = useMemo(
    () => flatRenderPlan({ id: room.id, geometry, offsetXM: 0, offsetZM: 0 }, siblingsPlaced,
      // A room hidden by focus draws nothing, so a shared doorway it owns is
      // hung by the room still on screen instead.
      { visible: (id) => isRoomVisible(focusedRoomId, id) }),
    [geometry, room.id, siblingsPlaced, focusedRoomId],
  );
  const shellGeometry = flatPlan.active.shell;
  /**
   * The camera's framing, moved onto what is being looked at: the focused
   * room, or the whole flat when nothing is focused — so the orbit pivots on
   * that, not on whichever room happens to be open (lib/focusFraming).
   * Keyed on the numbers, not the arrays: the flat's room list is refetched
   * now and then, and a fresh array with the same values would otherwise send
   * the camera flying back to the framing under the user's hands.
   */
  /** Every room's footprint in the open room's frame (it at 0, 0). */
  // A polygon room's footprint is its real outline, placed by its vertex
  // mean, with the rectangles it is made of (lib/flatBoxes).
  const flatBoxes = useMemo<RoomBox[]>(() => [
    flatBoxOf(room.id, geometry, 0, 0),
    ...siblingsPlaced.map((s) => flatBoxOf(s.id, s.geometry, s.offsetXM, s.offsetZM)),
  ], [room.id, geometry, siblingsPlaced]);
  // Read, not depended on: a room slid along its neighbour changes the flat's
  // footprint, and re-framing the camera for that would yank the view away
  // from the room the user just placed. The framing follows focus and the
  // open room.
  const flatBoxesRef = useRef(flatBoxes);
  flatBoxesRef.current = flatBoxes;
  const framedCamRaw = useMemo(
    () => focusFraming(cam, flatBoxesRef.current, focusedRoomId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cam, room.id, focusedRoomId, aptRooms ? aptRooms.length : 0],
  );

  // ── Moving rooms (lib/slideRoom, lib/moveRoom) ─────────────────────────
  /** A door's architrave, which the slide stops at (WallComponents' ARCH_W). */
  const DOOR_TRIM_M = 0.07;
  // The button beside the lock turns move mode on; a tap on a room selects it
  // (`slidingId`), and its arrow slides it along its neighbour's wall; the gap
  // across is typed. Each finished move is saved.
  const moveMode = useRoomMoveStore((st) => st.active);
  const setMoveMode = useRoomMoveStore((st) => st.set);
  const [slidingId, setSlidingId] = useState<string | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);
  /** Where the selected room stands mid-drag (open room's frame); null when
   *  it stands where it is saved. */
  const [slideLive, setSlideLive] = useState<{ cx: number; cz: number } | null>(null);
  const dragStartRef = useRef<{ cx: number; cz: number } | null>(null);
  /** The same as `slideLive`, but current the instant a drag moves: the
   *  release can arrive before the render that would carry the last
   *  position, and a fast drag then saved nothing. */
  const slideLiveRef = useRef<{ cx: number; cz: number } | null>(null);
  const locked = useViewLockStore((st) => st.locked);
  const queryClient = useQueryClient();
  useEffect(() => { setSlidingId(null); setSlideLive(null); }, [room.id]);
  useEffect(() => {
    setSlidingId(null); setSlideLive(null);
    // Every room has to be on screen to be placed against the others.
    if (moveMode) setFocusedRoomId(null);
  }, [moveMode]);
  // Moving rooms is editing; the lock puts it away.
  useEffect(() => { if (locked) setMoveMode(false); }, [locked, setMoveMode]);
  const selBox = slidingId ? flatBoxes.find((b) => b.id === slidingId) ?? null : null;
  const liveBox = selBox && slideLive ? { ...selBox, ...slideLive } : selBox;
  /** The one way the selected room moves: along the wall it shares with its
   *  neighbour (the gap across it is typed). Taken from where it is saved, so
   *  it holds still through a drag. */
  const moveSlide = selBox ? slideAxisAgainst(selBox, flatBoxes) : null;
  /** The doors in that partition, which the slide may not run past (trim
   *  and all) and which the dimensions measure from. */
  const moveDoors = useMemo(() => {
    if (!selBox || !moveSlide) return null;
    const placed = (id: string) => id === room.id
      ? { id: room.id, geometry, offsetXM: 0, offsetZM: 0 }
      : siblingsPlaced.find((sp) => sp.id === id);
    const me = placed(selBox.id);
    const them = placed(moveSlide.neighbour.id);
    if (!me || !them) return null;
    const spans = partitionDoorSpans(me, selBox, them, moveSlide.neighbour, moveSlide.axis);
    const c = moveSlide.axis === 'x' ? selBox.cx : selBox.cz;
    return {
      theirs: spans.theirs,
      ownRel: spans.own.map(([a, b]) => [a - c, b - c] as [number, number]),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selBox?.id, selBox?.cx, selBox?.cz, moveSlide?.neighbour.id, moveSlide?.axis, geometry, siblingsPlaced, room.id]);
  /** The selected room's wall thickness, for "touching" — what it was made
   *  with, or the default partition. */
  const wallThicknessM = (() => {
    const r = slidingId ? aptRooms?.find((x) => x.id === slidingId) : undefined;
    const mm = (r?.state as { wallThicknessMm?: number } | undefined)?.wallThicknessMm;
    return typeof mm === "number" && mm > 0 ? mm / 1000 : 0.2;
  })();

  /** Saves a move of `id` by (dx, dz), metres, in the open room's frame —
   *  and, for a resize, its new geometry with it (one save for both: the
   *  centre moves so the opposite wall can stay put). */
  const persistMove = async (id: string, dx: number, dz: number, newGeometry?: RoomGeometry, extra?: CutExtras) => {
    const abs = computeAbsolutePositions(aptRooms ?? [], room.id, W, D);
    if (id === room.id) {
      if (newGeometry) useRoomStore.setState({ geometry: newGeometry, ...(extra ?? {}), isDirty: true });
      // The flat is drawn around the open room, so moving it re-anchors
      // everything else; the camera moves with them, so the picture holds.
      const from = activeLayoutPos ?? abs.get(room.id) ?? { x: 0, z: 0 };
      useRoomStore.getState().setLayoutPos({ x: from.x + dx, z: from.z + dz });
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (camera) { const p = shiftedPose({ offsetXM: dx, offsetZM: dz }, camera.position); camera.position.set(p.x, p.y, p.z); }
      if (controls) { const t = shiftedPose({ offsetXM: dx, offsetZM: dz }, controls.target); controls.target.set(t.x, t.y, t.z); controls.update(); }
      try { await onSaveRoom(); } catch { /* kept in the store; saved with the next save */ }
      return;
    }
    const r = aptRooms?.find((x) => x.id === id);
    const from = abs.get(id);
    if (!r || !from) return;
    const layoutPos = { x: from.x + dx, z: from.z + dz };
    // The whole state goes back: the server replaces it wholesale. A state
    // that carries its own copy of the geometry gets the new one too, or a
    // reload could read the old size back from it.
    const prevState = (r as { state?: Record<string, unknown> }).state ?? {};
    const state = {
      ...prevState,
      ...(extra ?? {}),
      layoutPos,
      ...(newGeometry && prevState.geometry ? { geometry: newGeometry } : {}),
    };
    const apiGeometry = newGeometry ? storeGeometryToApiGeometry(newGeometry) : undefined;
    queryClient.setQueryData<Room[]>(["apt-rooms", room.apartment_id], (list) =>
      list?.map((x) => (x.id === id ? ({ ...x, state, ...(apiGeometry ? { geometry: apiGeometry } : {}) } as Room) : x)));
    try { await updateRoom(id, { state, ...(apiGeometry ? { geometry: apiGeometry } : {}) }); } catch { /* shown where it stands; re-fetched next time */ }
  };
  /** Puts the selected room at `to` for good: saved. */
  const commitTo = (to: { cx: number; cz: number } | null) => {
    setSlideLive(null);
    if (!selBox || !to) return;
    const dx = to.cx - selBox.cx, dz = to.cz - selBox.cz;
    if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return;
    void persistMove(selBox.id, dx, dz);
  };
  // ── Resizing the selected room by its walls (lib/resizeRoom) ───────────
  /** The selected room's geometry, in store form. */
  const selGeometry = !selBox ? null
    : selBox.id === room.id ? geometry
    : siblingsPlaced.find((sp) => sp.id === selBox.id)?.geometry ?? null;
  const resizable = !!selGeometry && isResizable(selGeometry);
  const selHeight = !selBox || selBox.id === room.id ? H
    : (aptRooms?.find((x) => x.id === selBox.id)?.ceiling_h ?? H);
  type ResizeLive = { side: Side; box: RoomBox; cuts: RoomCut[]; blocked?: string };
  const [resizeLive, setResizeLive] = useState<ResizeLive | null>(null);
  const resizeLiveRef = useRef<ResizeLive | null>(null);
  const confirm = useConfirm();
  /** A room's own content, for cutting it (lib/clipRoom). */
  const contentOf = (id: string): RoomContent | null => {
    if (id === room.id) {
      const st = useRoomStore.getState();
      return { geometry, centre: { x: 0, z: 0 }, furniture: st.furniture, lights: st.lights, electricals: st.electricals, designState: st.designState };
    }
    const sp = siblingsPlaced.find((x) => x.id === id);
    const r = aptRooms?.find((x) => x.id === id);
    if (!sp || !r) return null;
    const st = (r.state ?? {}) as Partial<CutExtras>;
    return { geometry: sp.geometry, centre: { x: sp.offsetXM, z: sp.offsetZM }, furniture: st.furniture, lights: st.lights, electricals: st.electricals, designState: st.designState };
  };
  const cuttable = (id: string) => {
    const c = id === selBox?.id ? null : contentOf(id);
    return !!c && isResizable(c.geometry);
  };
  /**
   * The rooms the selected room cuts at `box`, each keeping the offset it
   * had from it (its gap, or the default partition when it was further than
   * the 500 mm limit); null when one of them cannot be cut there.
   */
  const cutsAt = (box: RoomBox): RoomCut[] | { refused: string } => {
    if (!selBox) return [];
    const out: RoomCut[] = [];
    for (const o of flatBoxes) {
      if (o.id === selBox.id || !cuttable(o.id)) continue;
      const was = nearestNeighbour(selBox, [o])?.gapM ?? Infinity;
      const g = was <= 0.5 ? was : 0.2;
      const cutter = { x0: box.cx - box.w / 2 - g, x1: box.cx + box.w / 2 + g, z0: box.cz - box.d / 2 - g, z1: box.cz + box.d / 2 + g };
      const content = contentOf(o.id);
      if (!content) continue;
      const r = clipRoom(content, cutter);
      if (r.kind === 'refused') return { refused: r.reason };
      if (r.kind === 'cut') out.push({ id: o.id, from: content.centre, content: r.content });
    }
    return out;
  };
  /** The selected room resized towards `wanted`, cutting where it may and
   *  stopping short where a cut is refused. */
  const resizeWithCuts = (side: Side, wanted: number): ResizeLive | null => {
    if (!selBox || !selGeometry) return null;
    const minM = minSizeMm(selGeometry, side) / 1000;
    const at = (e: number, snap = true) => resizeBox(selBox, side, e, flatBoxes, { minM, snap, mayCut: cuttable });
    const box = at(wanted);
    if (!box) return null;
    const first = cutsAt(box);
    if (Array.isArray(first)) return { side, box, cuts: first };
    // Back off to the furthest edge any cut there allows.
    let good = edgeOf(selBox, side), bad = edgeOf(box, side);
    for (let i = 0; i < 30; i++) {
      const mid = (good + bad) / 2;
      const b = at(mid, false);
      if (b && Array.isArray(cutsAt(b))) good = mid; else bad = mid;
    }
    const b = at(good, false);
    const there = b ? cutsAt(b) : null;
    return b ? { side, box: b, cuts: Array.isArray(there) ? there : [], blocked: BLOCKED_SAYS[first.refused] ?? first.refused } : null;
  };
  useEffect(() => { setResizeLive(null); resizeLiveRef.current = null; }, [slidingId, moveMode]);
  const edgeOf = (b: RoomBox, side: Side) =>
    side === 'B' ? b.cx + b.w / 2 : side === 'D' ? b.cx - b.w / 2 : side === 'C' ? b.cz + b.d / 2 : b.cz - b.d / 2;
  /** Puts the selected room at its new size for good: geometry and centre
   *  saved together. */
  const commitResize = async (side: Side, box: RoomBox | null, cuts: RoomCut[] = []) => {
    setResizeLive(null);
    if (!selBox || !selGeometry || !box) return;
    if (cuts.length) {
      const ok = await confirm({
        title: "Qo'shni xona shakli o'zgaradi",
        description: "Bu xona qo'shni xonaga kiradi va u xonaning shakli o'zgaradi. Davom etasizmi?",
      });
      if (!ok) return;
    }
    const across = side === 'B' || side === 'D';
    const sizeMm = Math.round((across ? box.w : box.d) * 1000);
    if (Math.abs(sizeMm - (across ? selBox.w : selBox.d) * 1000) < 1) return;
    const { geometry: next, shiftM } = resizeGeometry(selGeometry, side, sizeMm);
    void persistMove(selBox.id, shiftM.dx, shiftM.dz, next);
    // Each room it grew into, cut — its new shape, its things moved inside.
    for (const c of cuts) {
      const { furniture, lights, electricals, designState } = c.content;
      void persistMove(c.id, c.content.centre.x - c.from.x, c.content.centre.z - c.from.z, c.content.geometry, {
        ...(furniture ? { furniture } : {}), ...(lights ? { lights } : {}),
        ...(electricals ? { electricals } : {}), ...(designState ? { designState } : {}),
      });
    }
  };

  /** An exact placement — a snap button or a typed figure — not snapped. */
  const placeAt = (axis: 'x' | 'z', wanted: number) => {
    if (!liveBox) return;
    commitTo(moveAlong(liveBox, axis, wanted, flatBoxes, { snap: false, wallThicknessM }));
  };
  const framedCamKey = JSON.stringify(framedCamRaw);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const framedCam = useMemo(() => framedCamRaw, [framedCamKey]);
  /** The room's own openings, carrying their partition marks so a shared
   *  door's leaf hangs at the end of its measured lining — the editable layer. */
  const ownOpeningGeometry = flatPlan.active.leaves[0].geometry;

  /** The surface-menu handlers for a trim run. `holdBind` is typed loosely
   *  because it is normally spread onto a <group>; here one handler is called
   *  directly, from the run's own click. */
  const trimTap = (surface: RadialSurface) =>
    holdBind(surface) as unknown as { onClick: (e: ThreeEvent<MouseEvent>) => void };

  /** A tapped door or window opens its own ring of designs, where it was
   *  tapped. Both the leaf itself and the editing layer's hit plane in front
   *  of it route here, so whichever one the ray meets first, the ring opens. */
  const openOpeningMenu = (
    kind: 'door' | 'window', wallId: string, elId: string, e: ThreeEvent<MouseEvent>,
  ) => (holdBind(kind, wallId, elId) as unknown as {
    onClick: (ev: ThreeEvent<MouseEvent>) => void
  }).onClick(e);

  return (
    <>
    <CanvasErrorBoundary
      key={glAttempt}
      onError={() => {
        // One automatic retry with safer GL settings — pressured iGPUs
        // often accept a modest context after refusing the fancy one
        if (glAttempt === 0) setTimeout(() => setGlAttempt(1), 150);
      }}
    >
    <Canvas
      shadows="soft"
      camera={{ position: initCam.position, fov: CAMERA_FOV, near: 0.1, far: 60 }}
      // Absolute, so the canvas is out of flow and its pixel width can
      // never feed back into the layout that sizes it. In flow, R3F's
      // width/height attributes act as the element's intrinsic size, and
      // the flex column then refuses to shrink past the size the canvas
      // already had — the viewport and the canvas disagree, and the
      // centred render drifts out of the visible slot on every tab switch.
      style={{
        position: "absolute", inset: 0, width: "100%", height: "100%",
        // A press held on the canvas is the app's own gesture — it brings up
        // the delete button for whatever is under the finger. Left alone, the
        // browser answers first with "Save image as… / Copy image / Inspect",
        // and on a phone a long press is the ONLY way to that menu, so it
        // fires on every single hold. These stop it being offered; the
        // handler below stops it being shown where it still is.
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
      onContextMenu={(e) => e.preventDefault()}
      gl={{
        antialias: glAttempt === 0,
        toneMapping: THREE.ACESFilmicToneMapping,
        // Read from lib/moonriseSky rather than written here, because every
        // judgement in that file about how the sky will look on screen — the
        // table that settled its background intensity, the fog colour derived
        // to match it — is ACES evaluated at this exposure. Two copies of the
        // number would let those conclusions go stale without a test failing.
        toneMappingExposure: STUDIO_TONE_MAPPING_EXPOSURE,
        outputColorSpace: THREE.SRGBColorSpace,
        powerPreference: glAttempt === 0 ? 'high-performance' : 'default',
        // Without this, the drawing buffer can already be cleared by the
        // time the unmount-triggered toBlob() capture below runs, which
        // would silently produce a blank thumbnail instead of an error.
        preserveDrawingBuffer: true,
      }}
      onCreated={({ gl }) => { glCanvasRef.current = gl.domElement; }}
      onPointerMissed={onPointerMissed}
      dpr={glAttempt === 0 ? dpr : 1}
    >
      {/* Drop resolution during interaction, restore at rest */}
      <AdaptiveDpr />
      <AdaptiveEvents />
      <KeepAutoClear />
      <DevSceneHandle />
      {/* Return the WebGL context slot immediately on tab switches */}
      <ReleaseGLOnUnmount />
      {/* Daylight's backdrop is MoonriseSky's, below — a flat colour here
          would simply paint over the sky. With the scene light switched off
          there is no daylight at all, so the dark fill still stands in for
          one. */}
      {!sceneLightOn && <color attach="background" args={["#14171F"]} />}
      {/* Fog matches the background, or distance reads as a halo against it —
          a white fog under the moonrise sky would hang a bright grey veil
          across a night room, which is why MOONRISE_FOG_COLOR is derived from
          the same horizon radiance the backdrop is drawn from rather than
          written down next to it. It relaxes in top view, where the camera
          legitimately sits far back. */}
      <fog
        attach="fog"
        args={[sceneLightOn ? MOONRISE_FOG_COLOR : "#14171F", topView ? 40 : 12, topView ? 120 : 30]}
      />

      {/* Infinite workspace grid — only shown in top-down (Yuqori) view */}
      {topView && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.003, 0]}>
            <planeGeometry args={[200, 200]} />
            <meshBasicMaterial color="#888888" />
          </mesh>
          <Grid
            position={[0, -0.002, 0]}
            infiniteGrid
            cellSize={0.1}
            cellThickness={0.4}
            cellColor="#ffffff"
            sectionSize={1}
            sectionThickness={0.8}
            sectionColor="#ffffff"
            fadeDistance={28}
            fadeStrength={1.4}
          />
        </>
      )}

      <PerformanceMonitor
        onDecline={() => {
          setDpr(1);
          setDeclineCount(n => n + 1);
        }}
        onIncline={() => {
          // Quality recovers after transient hitches (texture uploads etc.)
          setDpr([1, 2]);
          setDeclineCount(n => Math.max(0, n - 1));
        }}
      />

      <Suspense fallback={null}>
        {sceneLightOn && (
          <>
            {/* `skyPinnedSun` is why the sun is aimed here and not in
                ThreeDPage, where the SunState is built: it must be pinned to
                the sky's own light source exactly where that sky is mounted,
                and only here. The walkthrough and the shared-room view run the
                same SceneLighting under two other HDRIs, so their suns still
                follow the clock and have to. See lib/skyPinnedSun.ts — it
                replaces the clock's sun with the one the photograph has, and
                is a one-line revert. SUN_INTENSITY is the overhead peak the
                air at the moon's altitude takes its cut from, so that knob
                still means what it says. */}
            <SceneLighting
              width={W}
              depth={D}
              height={H}
              highQuality={highQuality3d}
              sun={skyPinnedSun(sun, SUN_INTENSITY)}
            />
            {/* The user's moonrise sky, in place of the flat white backdrop
                that stood behind the room before it. It owns scene.background
                and scene.environment both, at two different exposures; the sun
                above now points at the moon in it, so the shadows agree with
                the glow the user can see through the window — and takes its
                strength and its warmth from that altitude too, because a
                photograph is one moment and a sun pinned to it cannot keep
                moving through the day. */}
            <MoonriseSky />
          </>
        )}
        {/* Scene light off: soft ambient + hemisphere fill keep the floor,
            walls and door frame readable even before any room lamp is on;
            the room's own lamps (lightsOn) still read as the dominant source */}
        {!sceneLightOn && (
          <>
            <ambientLight intensity={0.22} color="#8090B0" />
            <hemisphereLight args={["#4a5570", "#0c0e14", 0.35]} />
          </>
        )}

        <Panorama360 active={panorama} geometry={geometry} onCaptured={onPanoramaCaptured} />
        {/* The four fixed cameras, for an ordinary picture of the room rather
            than a panorama nobody can put in a quote. */}
        <RoomCameras
          station={cameraStation}
          aspect={cameraAspect}
          geometry={geometry}
          onCaptured={onViewCaptured}
        />
        <PanoramaSnap geometry={geometry} />
      <WallsBehindCamera geometry={geometry} W={W} D={D}>
          {(behind) => (
            <>
        {/* No phase-forced wall material: entering Suvoq used to force
            the photo-real plaster PBR onto every wall (plasterWalls was
            `activePhase === 'suvoq'`). The default is bare plaster again,
            so that would mostly be a no-op now — but whatever a wall
            carries must stay visible through every phase until the user
            actually clicks a texture/color, so each wall simply renders
            its real covering; a 'plaster'-kind covering still gets the
            plaster PBR via WallSegment's own `covering.kind` check. */}
        {/* The active room, faded out and then not rendered at all while
            another room is the one being looked at (FocusFade).
            
            Unmounted rather than hidden with `visible={false}`: that flag does
            NOT remove an object from raycasting — three's Raycaster tests
            `layers` and nothing else — so a hidden room stayed fully
            clickable, and a tap meant for the focused room landed on the
            invisible one in front of it. Toggling focus is a deliberate press,
            not per-frame work, so the remount costs nothing that matters (the
            GLTFs stay in drei's cache). */}
        <FocusFade show={isRoomVisible(focusedRoomId, room.id)}>
        <group position={slidingId === room.id && slideLive ? [slideLive.cx, 0, slideLive.cz] : [0, 0, 0]}>
        <RoomScene
          room={room}
          geometry={shellGeometry}
          topView={topView}
          designState={designState}
          showContactShadows={showContactShadows}
          composerActive={useComposer}
          highQuality={highQuality3d}
          lightsOn={lightsOn}
          cutaway={topView ? 'off' : cutaway}
          selectedWall={selectedWall}
          onWallClick={(id) => focusSurface(id)}
          isFloorSelected={selectedWall === 'FLOOR'}
          onFloorClick={() => focusSurface('FLOOR')}
          isCeilingSelected={selectedWall === 'CEILING'}
          onCeilingClick={() => focusSurface('CEILING')}
          isSkirtingSelected={selectedWall === 'SKIRTING'}
          // Touching a run opens its own ring of profiles where it was
          // touched, rather than sending the user to the design panel: the
          // tap already said which run is meant.
          onSkirtingClick={(e) => trimTap('skirting').onClick(e)}
          isCorniceSelected={selectedWall === 'CORNICE'}
          onCorniceClick={(e) => trimTap('cornice').onClick(e)}
          holdBind={holdBind}
          hiddenAttachments={behind}
        />
        {/* Interactive window/door editing layer (select → toolbar → drag
            with live meter labels + Canva-style snap guides). */}
        <WallOpenings
          geometry={geometry}
          W={W}
          D={D}
          H={H}
          selected={selOpening}
          onSelect={selectOpening}
          updateElement={updateElement}
          removeElement={removeElement}
          onInteracting={(active) => { if (controlsRef.current) controlsRef.current.enabled = !active; }}
          openMenu={openOpeningMenu}
          hiddenWalls={behind}
          armedId={armedOpeningId}
          onArm={onArmOpening}
        />
        </group>
        </FocusFade>
        {/* The active room's own focus button, floated above it like the
            siblings' — it is a room in the flat too, and isolating the one you
            are editing is the most likely thing to want. */}
        {aptRooms && aptRooms.length > 1 && (
          <ActiveRoomFocusButton
            H={H}
            focused={focusedRoomId === room.id}
            onClick={() => setFocusedRoomId((cur) => toggleRoomFocus(cur, room.id))}
          />
        )}
        <SwapButtons W={W} D={D} H={H} />
        {topView && (
          <AddRoomButtons
            W={W} D={D} H={H} onAdd={handleAddRoom} disabled={addingRoom}
            occupiedSides={aptRooms ? computeOccupiedSides(aptRooms, room.id, W, D, activeLayoutPos) : undefined}
          />
        )}
        {/* The rest of the flat, in BOTH views. These used to be drawn only
            from the top down, so stepping into a room made every other room
            vanish — which reads exactly like the room you just left having
            been deleted, and was reported as that. Nothing was ever deleted;
            the neighbours simply were not rendered. */}
        {aptRooms && (
          <SiblingRooms
            rooms={aptRooms}
            activeId={room.id}
            activeW={W}
            activeD={D}
            activePos={activeLayoutPos}
            siblingPlans={flatPlan.siblings}
            focusedRoomId={focusedRoomId}
            onToggleFocus={(id) => setFocusedRoomId((cur) => toggleRoomFocus(cur, id))}
            onDelete={handleDeleteSibling}
            positionOverride={slidingId && slidingId !== room.id && slideLive ? { id: slidingId, x: slideLive.cx, z: slideLive.cz } : null}
            onOpen={(id, e) => {
              const sib = siblingsPlaced.find((s) => s.id === id);
              onSwitchRoom(
                id,
                { offsetXM: sib?.offsetXM ?? 0, offsetZM: sib?.offsetZM ?? 0 },
                { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY },
              );
            }}
          />
        )}
        <FocusFade show={isRoomVisible(focusedRoomId, room.id)}>
        <group position={slidingId === room.id && slideLive ? [slideLive.cx, 0, slideLive.cz] : [0, 0, 0]}>
        <DraggableFurnitureModels controlsRef={controlsRef} roomW={W} roomD={D} toolMode={toolMode} selectedId={selectedFurId} onSelectItem={selectFurniture}
          onDelete={(id) => { useRoomStore.getState().removeFurniture(id); selectFurniture(null); }}
          selectedPart={selectedPart} onSelectPart={selectFurniturePart} />
        {/* LiDAR scan reference: GLB overlay + object ghost boxes. Gated by
            the "Skan ko'rinishi" toggle; renders nothing for manual rooms. */}
        <RoomScanReference
          roomId={room.id}
          roomScan={room.room_scan}
          geometry={geometry}
          visible={showScan}
          replaced={replacedGhosts}
          onReplace={setScanSwap}
        />
        <QiblaMarker W={W} D={D} visible={showQibla} />
        <DraggableElectricalModels controlsRef={controlsRef} W={W} D={D} hiddenWalls={behind} />
        <OpeningLayer
          geometry={ownOpeningGeometry}
          W={W}
          D={D}
          cutaway={topView ? 'off' : cutaway}
          hiddenWalls={behind}
          toolMode={toolMode}
          controlsRef={controlsRef}
          selectedId={selectedDoorId}
          onSelect={selectDoor}
          // A tapped door or window opens its own ring of designs, where it
          // was tapped — the same plumbing the trim runs use.
          openMenu={openOpeningMenu}
        />
        {/* A neighbour's doorway hung from this side while focus hides the
            neighbour that owns it — scenery, the owner still edits it. */}
        {flatPlan.active.leaves.slice(1).map((layer, i) => (
          <group key={`orphan-leaves-${i}`}>
            <OpeningLeaves kind="door" geometry={layer.geometry} wallWidth={W} wallDepth={D} interactive={false} />
            <OpeningLeaves kind="window" geometry={layer.geometry} wallWidth={W} wallDepth={D} interactive={false} />
          </group>
        ))}
        </group>
        </FocusFade>
            </>
          )}
        </WallsBehindCamera>
        <DraggableLightModels controlsRef={controlsRef} roomW={W} roomD={D} roomH={H} toolMode={toolMode} lightsOn={lightsOn} highQuality={highQuality3d} selectedId={selectedLightId} onSelect={selectLight} />

        <RealismEffects enabled={useComposer} />

        {/* Holds the zoom-out limit at "the whole room is visible". */}
        {/* Fitted to the whole flat, not just this room — with the
            neighbours drawn, a limit that stopped at one room's edge made
            them unreachable. While one room is focused the others are hidden,
            so it goes back to fitting that room alone. */}
        {/* The lock: while it is on, nothing in the scene takes a tap. */}
        <ViewLockGate />
        <CameraRefBridge cameraRef={cameraRef} />
        {moveMode && (
          <RoomMoveInput
            rooms={flatBoxes.map((b) => (liveBox && b.id === liveBox.id ? liveBox : b))}
            selected={liveBox}
            axis={moveSlide?.axis ?? null}
            resizable={resizable}
            onResize={(side, delta) => {
              if (!selBox) return;
              const live = resizeWithCuts(side, edgeOf(selBox, side) + delta);
              if (live) { resizeLiveRef.current = live; setResizeLive(live); }
            }}
            onResizeEnd={() => {
              const live = resizeLiveRef.current;
              resizeLiveRef.current = null;
              if (live) void commitResize(live.side, live.box, live.cuts);
            }}
            onSelect={(id) => setSlidingId(id)}
            onDrag={(delta) => {
              if (!selBox || !liveBox || !moveSlide) return;
              const start = dragStartRef.current ?? { cx: liveBox.cx, cz: liveBox.cz };
              dragStartRef.current = start;
              const next = slideTo({ ...selBox, ...start }, moveSlide, (moveSlide.axis === 'x' ? start.cx : start.cz) + delta, flatBoxes, {
                keep: moveDoors ? { fixed: moveDoors.theirs, own: moveDoors.ownRel, trimM: DOOR_TRIM_M } : undefined,
              });
              if (next) { slideLiveRef.current = next; setSlideLive(next); }
            }}
            onDragEnd={() => {
              dragStartRef.current = null;
              const to = slideLiveRef.current;
              slideLiveRef.current = null;
              commitTo(to);
            }}
          />
        )}
        {moveMode && liveBox && resizable && (
          resizeLive
            ? (
              <>
                <ResizeGhost box={resizeLive.box} side={resizeLive.side} height={selHeight} note={resizeLive.blocked} />
                {resizeLive.cuts.map((c) => <CutOutline key={c.id} outline={outlineOf(c.content)} />)}
              </>
            )
            : <ResizeHandles target={liveBox} />
        )}
        {moveMode && liveBox && moveSlide && !resizeLive && (() => {
          const axis = moveSlide.axis;
          const across = axis === 'x' ? 'z' : 'x';
          const n = moveSlide.neighbour;
          const c = axis === 'x' ? liveBox.cx : liveBox.cz;
          const len = axis === 'x' ? liveBox.w : liveBox.d;
          const mineA = across === 'x' ? liveBox.cx : liveBox.cz;
          const theirsA = across === 'x' ? n.cx : n.cz;
          const myHalf = (across === 'x' ? liveBox.w : liveBox.d) / 2;
          const theirHalf = (across === 'x' ? n.w : n.d) / 2;
          const myEdge = theirsA > mineA ? mineA + myHalf : mineA - myHalf;
          const theirEdge = theirsA > mineA ? theirsA - theirHalf : theirsA + theirHalf;
          const lineAcross = (myEdge + theirEdge) / 2;
          const gapMm = Math.round(Math.abs(theirEdge - myEdge) * 1000);
          const doors = [
            ...(moveDoors?.theirs ?? []),
            ...(moveDoors?.ownRel ?? []).map(([a, b]) => [a + c, b + c] as [number, number]),
          ];
          const mid = (Math.max(c - len / 2, axis === 'x' ? n.cx - n.w / 2 : n.cz - n.d / 2) + Math.min(c + len / 2, axis === 'x' ? n.cx + n.w / 2 : n.cz + n.d / 2)) / 2;
          const fieldAt: [number, number, number] = axis === 'x' ? [mid, H + 0.25, lineAcross] : [lineAcross, H + 0.25, mid];
          return (
            <>
              <RoomMoveArrows target={liveBox} axis={axis} />
              <DoorDimensions axis={axis} lineAcross={lineAcross} room={[c - len / 2, c + len / 2]} doors={doors} />
              <GapField
                position={fieldAt}
                gapMm={gapMm}
                onCommit={(mm) => {
                  const lenA = across === 'x' ? liveBox.w : liveBox.d;
                  const [n0, n1] = across === 'x' ? [n.cx - n.w / 2, n.cx + n.w / 2] : [n.cz - n.d / 2, n.cz + n.d / 2];
                  placeAt(across, theirsA > mineA ? n0 - mm / 1000 - lenA / 2 : n1 + mm / 1000 + lenA / 2);
                }}
              />
            </>
          );
        })()}
        {/* Keeps the view still when a tapped neighbour becomes the open room. */}
        <RoomSwitchCamera controlsRef={controlsRef} />
        <OrbitZoomLimit
          controlsRef={controlsRef}
          W={focusedRoomId ? W : flatSpan.W}
          D={focusedRoomId ? D : flatSpan.D}
          H={H}
        />
        <OrbitControls
          ref={controlsRef}
          makeDefault
          // The 360 camera turns on the spot and has no pivot; an orbit rig
          // reaching for one would fight it for every drag.
          enabled={!panorama && cameraStation == null}
          target={initCam.target}
          enableDamping
          dampingFactor={0.06}
          enablePan
          panSpeed={0.9}
          screenSpacePanning
          zoomToCursor
          mouseButtons={{
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.PAN,
            RIGHT: THREE.MOUSE.PAN,
          }}
          // Touch, spelled out rather than left to the library default so the
          // gesture set is readable here: one finger turns the room, two
          // pinch-zoom AND drag it (DOLLY_PAN does both at once), and three
          // drag it — that last one is MultiTouchPan below, since
          // OrbitControls itself stops at two pointers.
          touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
          // One orbit range everywhere: close enough to inspect a skirting
          // joint, far enough to pull right outside the room. Nothing has to
          // hide for that — the walls are single-sided planes and the shadow
          // shell writes no colour, so from outside you simply look in.
          minDistance={topView ? topMinDist : 0.25}
          // maxDistance is NOT set here: OrbitZoomLimit below owns it, because
          // the fit depends on the viewport as well as the room. It used to be
          // `max(W, D) * 4 + 6` — nearly 29 m for an ordinary 5.7 m room,
          // which is a postage stamp in an empty sky, and every notch past the
          // point where the room already fits spent the screen on nothing.
          maxDistance={topView ? Math.max(W, D) * 4 : undefined}
          maxPolarAngle={topView ? Math.PI * 0.3 : maxPolarAngle}
          minPolarAngle={topView ? 0 : 0.08}
          rotateSpeed={topView ? 0.6 : 0.45}
          // Neither axis is reversed any more: both were flipped once, then
          // each was flipped back in turn (2026-10-01), which lands on
          // OrbitControls' own grab-and-turn. Dragging right sends the room
          // right, dragging down tilts the view down. Nothing to pass — the
          // flags are reverseOrbit for both, or reverseHorizontalOrbit /
          // reverseVerticalOrbit for one.
          // zoomSpeed is NOT passed as a prop on purpose: it is retuned from
          // the live distance on every change (see applyUniformZoom), and a
          // prop would overwrite that on the next React render.
          onChange={(e) => applyUniformZoom(
            (e?.target ?? controlsRef.current) as unknown as { getDistance(): number; zoomSpeed: number },
            Math.max(W, D),
          )}
        />
        {/* Three-finger drag pans, matching the two-finger pan's speed. */}
        <MultiTouchPan panSpeed={0.9} />

        <CameraAnimator
          position={framedCam.position}
          target={framedCam.target}
          controlsRef={controlsRef}
          version={presetVersion}
        />

        {/* Double-click to focus; empty double-click recenters the room */}
        <DoubleClickFocus
          controlsRef={controlsRef}
          onEmpty={() => setPresetVersion((n) => n + 1)}
        />
      </Suspense>
    </Canvas>
    </CanvasErrorBoundary>
    <SceneLoadingOverlay />

    </>
  );
}
