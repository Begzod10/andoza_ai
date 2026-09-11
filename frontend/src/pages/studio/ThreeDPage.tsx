import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  PerformanceMonitor,
  AdaptiveDpr,
  AdaptiveEvents,
  Grid,
} from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useOutletContext, useNavigate, useLocation } from "react-router-dom";
import { useRoomStore, useTemporalRoomStore } from "@/store/roomStore";
import { DesignPanel } from "@/components/studio/DesignPanel";
import { AddObjectSheet } from "@/components/studio/AddObjectSheet";
import SurfaceRadialMenu, { RadialIcons, type RadialSurface, type RadialItem } from "@/components/studio/SurfaceRadialMenu";
import { WallOpenings, type OpeningSel } from "@/components/studio/WallOpenings";
import { AiBuilderSheet } from "@/components/studio/AiBuilderSheet";
import RoomSettingsSheet from "@/components/studio/RoomSettingsSheet";
import { ModelImportButton } from "@/components/studio/ModelImportButton";
import { useModelImport } from "@/hooks/useModelImport";
import { useFileDrop, MODEL_FILE_RE } from "@/hooks/useFileDrop";
import { getRooms, deleteRoom, uploadRoomThumbnail, listCatalogFurniture } from "@/lib/api";
import type { Room } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type CutawayMode } from "@/features/studio/diorama";
import { MebelPlanView } from "@/features/studio/MebelPlanView";
import { ReleaseGLOnUnmount, CanvasErrorBoundary } from "@/features/studio/glcleanup";
import { DraggableFurnitureModels, type SelectedPart, type ToolMode } from "@/features/studio/StudioFurniture";
export { FurnitureModels } from "@/features/studio/StudioFurniture";
import { nanoid } from "nanoid";
import * as THREE from "three";
import { roomExtents } from "@/lib/roomDims";
import { skyFogColor } from "@/lib/skyEnvironment";
import { sunPosition, dayOfYear } from "@/lib/sunPosition";
import { ChiroqPlanView } from "@/features/studio/ChiroqPlanView";
import type { LightTypeId } from "@/lib/lightCatalog";
import { RENO_STAGES, type PhaseKey } from "@/lib/phases";
import { type ViewPreset, VIEW_LABELS, type RoomSide } from "./three-d/constants";
import {
  formatClock, slugifyFileName, computeAbsolutePositions, computeOccupiedSides,
  getCamera, fitFramingToAspect,
} from "./three-d/helpers";
import { DraggableLightModels, PlacedLights } from "./three-d/LightingComponents";
import { DraggableElectricalModels } from "./three-d/ElectricalComponents";
import { AddRoomButtons, SiblingRooms, OpeningLayer } from "./three-d/SiblingRoomLayout";
import { RealismEffects, BrandedSky, SceneLighting } from "./three-d/SceneEnvironment";
import { SafeEnvironment } from "@/components/studio/SafeEnvironment";
import { DEFAULT_HDRI } from "@/lib/hdri";
import { DoubleClickFocus, KeepAutoClear, DevSceneHandle, CameraAnimator } from "./three-d/CameraControls";
import { SwapButtons, RoomScene } from "./three-d/RoomShell";
export { RoomScene, SceneLighting, BrandedSky, PlacedLights };

// Explicit (default-on since three r152, but pinned here so a future three
// upgrade can't silently regress the color pipeline)
THREE.ColorManagement.enabled = true;

export interface StudioContext {
  room: Room;
  onSave: () => Promise<void>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export type { PhaseKey } from "@/lib/phases"

// Touch/mobile studio. The studio is embedded in a mobile WebView, which can
// (wrongly) report a fine pointer — so `(pointer:fine)` is unreliable here.
// Detect real touch capability, plus the same narrow-viewport breakpoint the
// mobile layout uses (lg = 1024px), so the hint matches the responsive chrome.
const isTouch =
  typeof window !== 'undefined' &&
  (('ontouchstart' in window) ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 1023px)').matches))

export default function ThreeDPage() {
  const { room, onSave } = useOutletContext<StudioContext>();
  const geometry = useRoomStore((s) => s.geometry);
  const designState = useRoomStore((s) => s.designState);
  const highQuality3d = useRoomStore((s) => s.highQuality3d);
  const resetRoom = useRoomStore((s) => s.resetRoom);
  const placeFurniture = useRoomStore((s) => s.placeFurniture);
  const addElement = useRoomStore((s) => s.addElement);
  const updateElement = useRoomStore((s) => s.updateElement);
  const removeElement = useRoomStore((s) => s.removeElement);
  const navigate = useNavigate();
  const [addingRoom, setAddingRoom] = useState(false);

  // Do'kon-managed 3D models (admin catalog) — fetched once per studio
  // session and mirrored into the room store so the "3D Modellar" panel and
  // every placement path can resolve/price them the same way as built-in and
  // user-uploaded models. Large per_page: shop catalogs are small in
  // practice and the whole studio wants the full list, not one page of it.
  const setCatalogFurniture = useRoomStore((s) => s.setCatalogFurniture);
  const { data: catalogFurniturePage } = useQuery({
    queryKey: ['catalog-furniture'],
    queryFn: () => listCatalogFurniture({ per_page: 100 }),
    staleTime: 60_000,
  });
  useEffect(() => {
    if (catalogFurniturePage) setCatalogFurniture(catalogFurniturePage.items);
  }, [catalogFurniturePage, setCatalogFurniture]);

  async function handleAddRoom(side: RoomSide) {
    if (addingRoom) return;
    setAddingRoom(true);
    try { await onSave(); } catch { /* continue even if save fails (offline mode) */ }
    setAddingRoom(false);
    const aptId = room.apartment_id && room.apartment_id !== 'local' ? room.apartment_id : null;
    // Anchor info for directional placement — captured before resetRoom clears it
    const myPos = useRoomStore.getState().layoutPos ?? { x: 0, z: 0 };
    // Carry the current view into the new room's studio (fresh mount there)
    sessionStorage.setItem('uytamir-studio-entry-view', preset);
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

  // Same orientation the scene uses: X is wall A, Z is wall B
  const { W, D } = roomExtents(geometry, { W: room.length, D: room.width });
  const H = room.ceiling_height > 0 ? room.ceiling_height : 2.7;

  // The add-room flow stashes the view it was started from (usually 'top'),
  // so the NEW room's studio opens in the same framing, centred on the room.
  // The flag is cleared in an effect, NOT in the initializer — StrictMode
  // runs initializers twice and the second pass would lose the value.
  const [preset, setPreset] = useState<ViewPreset>(() =>
    sessionStorage.getItem('uytamir-studio-entry-view') === 'top' ? 'top' : 'back',
  );
  useEffect(() => {
    sessionStorage.removeItem('uytamir-studio-entry-view');
  }, []);
  const [presetVersion, setPresetVersion] = useState(0);
  const [dpr, setDpr] = useState<number | [number, number]>([1, 2]);
  // Two consecutive PerformanceMonitor declines required before killing shadows / composer
  const [declineCount, setDeclineCount] = useState(0);
  const showContactShadows = declineCount < 2;
  const useComposer = highQuality3d && declineCount < 2;
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const canUndo = useTemporalRoomStore((s) => s.pastStates.length > 0);
  const canRedo = useTemporalRoomStore((s) => s.futureStates.length > 0);
  const [lightsOn, setLightsOn] = useState(true);
  const [sceneLightOn, setSceneLightOn] = useState(true);
  // Shared with the walkthrough — see the note on `sunHour` in the store.
  const sunHour = useRoomStore((st) => st.sunHour);
  const setSunHour = useRoomStore((st) => st.setSunHour);
  const today = useMemo(() => dayOfYear(new Date()), []);
  // Site defaults to Tashkent (sunPosition's DEFAULT_SITE), and the room sits
  // in the app's own frame — wall A's outward face is north, the same north
  // AddRoomButtons uses. Between them the arc is fully determined, so there is
  // nothing here for the user to set.
  const sun = useMemo(() => sunPosition({
    hour: sunHour,
    dayOfYear: today,
    peakIntensity: highQuality3d ? 1.3 : 1.0,
  }), [sunHour, today, highQuality3d]);
  const [cutaway, setCutaway] = useState<CutawayMode>('off');
  const [showHelp, setShowHelp] = useState(false);
  // 0 = full quality; 1 = safe-mode retry after a WebGL context failure
  const [glAttempt, setGlAttempt] = useState(0);
  // Project-card thumbnail: grabbed from the live canvas when the user
  // leaves this room's 3D view, so the pixels shown are what they last saw.
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const roomIdRef = useRef(room.id);
  roomIdRef.current = room.id;
  // Fires on unmount — i.e. whenever the user leaves this room's 3D view,
  // regardless of how (back button, sidebar nav, tab switch away from the
  // studio). Fire-and-forget: a failed capture should never surface as a
  // user-facing error mid-navigation, and the next capture just replaces it.
  useEffect(() => {
    return () => {
      const canvas = glCanvasRef.current;
      if (!canvas) return;
      const capturedRoomId = roomIdRef.current;
      canvas.toBlob((blob) => {
        if (!blob) return;
        uploadRoomThumbnail(capturedRoomId, blob).catch(() => {});
      }, 'image/jpeg', 0.8);
    };
  }, []);
  // Manual "Skrinshot" export — same glCanvasRef/preserveDrawingBuffer setup
  // as the thumbnail capture above, but PNG (lossless) and downloaded to the
  // user's device rather than uploaded. Purely client-side: no server call,
  // no shareable link — just the smallest useful export.
  const [screenshotStatus, setScreenshotStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const screenshotResetRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (screenshotResetRef.current != null) window.clearTimeout(screenshotResetRef.current);
  }, []);
  function flashScreenshotStatus(status: 'saved' | 'error') {
    setScreenshotStatus(status);
    if (screenshotResetRef.current != null) window.clearTimeout(screenshotResetRef.current);
    screenshotResetRef.current = window.setTimeout(() => setScreenshotStatus('idle'), 1500);
  }
  function handleScreenshot() {
    const canvas = glCanvasRef.current;
    if (!canvas) {
      flashScreenshotStatus('error');
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        flashScreenshotStatus('error');
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `xona-${slugifyFileName(room.name)}-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      flashScreenshotStatus('saved');
    }, 'image/png');
  }
  const [selectedFurId, setSelectedFurId] = useState<string | null>(null);
  const [selectedPart, setSelectedPart] = useState<SelectedPart | null>(null);
  const [selectedDoorId, setSelectedDoorId] = useState<string | null>(null);
  const [selectedLightId, setSelectedLightId] = useState<string | null>(null);
  // Fixture armed in the palette; the next click in the 2D plan places it.
  const [armedLightType, setArmedLightType] = useState<LightTypeId | null>(null);
  const [angleInputDeg, setAngleInputDeg] = useState('');
  const furniture = useRoomStore((s) => s.furniture);
  const moveFurniture = useRoomStore((s) => s.moveFurniture);
  const activeLayoutPos = useRoomStore((s) => s.layoutPos);
  // The Mebelirovka and Chiroqlar tabs open the same editor, pre-set to the
  // furnishing / lighting phase
  const location = useLocation();
  const pathname = location.pathname;
  const isMebelTab = pathname.endsWith('/mebel');
  const isChiroqTab = pathname.endsWith('/chiroqlar');
  // Optional starting phase from the URL (?phase=…). The mobile wall-condition
  // step sets it so the studio opens on the first renovation stage that still
  // needs doing (an already-plastered wall skips Suvoq, a puttied wall skips
  // Suvoq + Shpaklovka). Earlier stages then render as done via the existing
  // positional check-mark logic. Falls back to the historical 'boyoq' default.
  const phaseParam = new URLSearchParams(location.search).get('phase')
  const initialPhase: PhaseKey = isMebelTab
    ? 'mebel'
    : isChiroqTab
      ? 'chiroq'
      : RENO_STAGES.some((s) => s.key === phaseParam)
        ? (phaseParam as PhaseKey)
        : 'boyoq'
  const [activePhase, setActivePhase] = useState<PhaseKey>(initialPhase)
  // Mebelirovka: door/window editor sheet (reuses the room settings sheet)
  const [elementsSheetOpen, setElementsSheetOpen] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showAiSheet, setShowAiSheet] = useState(false);
  const [selectedWall, setSelectedWall] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  // Desktop-only edge-collapse toggles for the phase-stepper rail and design
  // panel — separate from showPanel above, which drives the mobile bottom
  // sheet. Both default open; tablet/mobile keep their own drawer pattern
  // untouched (the toggle buttons themselves are hidden below lg).
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  // ── Surface radial menu (tap/press "aylana" on a wall/ceiling/floor) ──
  // A fast path alongside the phase-stepper rail (SHOW_PHASE_STEPPER), not a
  // replacement for it: tapping a surface opens a ring of context icons at
  // the press point for quick edits without leaving the current phase.
  const [radial, setRadial] = useState<
    { surface: RadialSurface; wallId?: string; x: number; y: number; point?: { x: number; y: number; z: number } } | null
  >(null);
  // World-space hit point of the press, captured from the raycast so a created
  // window/door lands exactly where the wall was touched.
  const holdPoint = useRef<{ x: number; y: number; z: number } | null>(null);
  // Currently-selected window/door (for the move/edit/delete toolbar).
  const [selOpening, setSelOpening] = useState<OpeningSel | null>(null);
  const holdTimer = useRef<number | null>(null);
  const holdStart = useRef<{ x: number; y: number } | null>(null);
  // True from the moment a long-press fires until the next surface click, so
  // the click that ends the hold doesn't ALSO run the tap-select behaviour.
  const heldRef = useRef(false);

  // ── Drop a model file straight into the room ────────────────────────
  // Imported like a picked file, then placed immediately and the Mebel phase
  // opened, so the dropped object is both visible and editable in one gesture.
  const { importFiles: importModelFiles, status: modelDropStatus, warn: modelDropWarn } = useModelImport();
  const { isOver: modelDropOver, dropProps: viewportDropProps } = useFileDrop({
    accept: (f) => MODEL_FILE_RE.test(f.name),
    disabled: modelDropStatus === 'loading',
    onDrop: (files) => {
      if (!files.some((f) => /\.(glb|gltf|obj|fbx)$/i.test(f.name))) return;
      void importModelFiles(files).then((entryId) => {
        if (!entryId) return;
        const placed = useRoomStore.getState().furniture.length;
        placeFurniture({
          id: nanoid(),
          furniture_id: entryId,
          x: (placed * 300) % 1000,
          y: (placed * 300) % 1000,
          rotation: 0,
        });
        setActivePhase('mebel');
      });
    },
  });

  /**
   * Select a wall (or the floor) and, from a decorating phase, open the paint
   * panel for it — that jump is the whole point of clicking a surface there.
   *
   * Phases that own the panel for a placement workflow keep it. Forcing
   * 'boyoq' unconditionally meant one stray click on a wall replaced the
   * lighting panel mid-task, and since nothing switched back, the fixtures the
   * user was placing became unreachable.
   */
  function focusSurface(id: string) {
    // Highlight the surface + drop any selected window/door. The design
    // actions themselves now live in the radial menu (openSurfaceMenu), which
    // opens on the same click — so we no longer force the paint panel here.
    setSelOpening(null);
    setSelectedWall(id);
  }

  /**
   * Open the surface radial ("aylana") menu at the tap/click point. This is the
   * PRIMARY trigger now (works with a single mouse click on desktop and a tap
   * on touch); the long-press path below still works as an alternative. The
   * click carries the R3F world hit (`e.point`) so a created window/door lands
   * exactly where the surface was tapped.
   */
  function openSurfaceMenu(surface: RadialSurface, wallId: string | undefined, e: any) {
    // If a long-press already opened the menu, its trailing click must not
    // reopen/replace it.
    if (heldRef.current) { heldRef.current = false; return; }
    const x = e?.nativeEvent?.clientX ?? e?.clientX ?? 0;
    const y = e?.nativeEvent?.clientY ?? e?.clientY ?? 0;
    const point = e?.point ? { x: e.point.x, y: e.point.y, z: e.point.z } : (holdPoint.current ?? undefined);
    if (controlsRef.current) controlsRef.current.enabled = false;
    setRadial({ surface, wallId, x, y, point });
  }
  const addSheetSection: 'wallpaper' | 'lyustra' | 'furniture' =
    activePhase === 'boyoq' ? 'wallpaper' : activePhase === 'montaj' ? 'lyustra' : 'furniture';
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // ── Long-press detection on 3D surfaces ─────────────────────────────
  // R3F pointer events bubble from the surface meshes up to the wrapping
  // <group>s that spread these handlers. A ~460ms hold that doesn't drift
  // opens the radial menu at the press point; any real drag (camera orbit)
  // cancels it first.
  const HOLD_MS = 460;
  const HOLD_MOVE_TOL = 12; // px of finger travel that still counts as a hold
  function clearHold() {
    if (holdTimer.current != null) { window.clearTimeout(holdTimer.current); holdTimer.current = null; }
    holdStart.current = null;
  }
  function startHold(surface: RadialSurface, wallId: string | undefined, e: { nativeEvent?: PointerEvent; clientX?: number; clientY?: number; point?: { x: number; y: number; z: number }; stopPropagation?: () => void }) {
    const cx = e.nativeEvent?.clientX ?? e.clientX ?? 0;
    const cy = e.nativeEvent?.clientY ?? e.clientY ?? 0;
    // The R3F event's world intersection point — where on the wall it was hit.
    holdPoint.current = e.point ? { x: e.point.x, y: e.point.y, z: e.point.z } : null;
    holdStart.current = { x: cx, y: cy };
    clearHoldTimerOnly();
    holdTimer.current = window.setTimeout(() => {
      heldRef.current = true;
      // Freeze the camera so menu taps don't orbit the room, and drop any
      // active selection highlight noise.
      if (controlsRef.current) controlsRef.current.enabled = false;
      setRadial({ surface, wallId, x: cx, y: cy, point: holdPoint.current ?? undefined });
    }, HOLD_MS);
  }
  function clearHoldTimerOnly() {
    if (holdTimer.current != null) { window.clearTimeout(holdTimer.current); holdTimer.current = null; }
  }
  function moveHold(e: { nativeEvent?: PointerEvent; clientX?: number; clientY?: number }) {
    if (!holdStart.current) return;
    const cx = e.nativeEvent?.clientX ?? e.clientX ?? 0;
    const cy = e.nativeEvent?.clientY ?? e.clientY ?? 0;
    if (Math.hypot(cx - holdStart.current.x, cy - holdStart.current.y) > HOLD_MOVE_TOL) clearHold();
  }
  function closeRadial() {
    setRadial(null);
    if (controlsRef.current) controlsRef.current.enabled = true;
    // Safety net: if the trailing click never arrived, don't leave the guard
    // armed or the next genuine tap would be swallowed.
    heldRef.current = false;
  }
  /** Pointer handlers to spread onto a surface's wrapping <group>. */
  function holdBind(surface: RadialSurface, wallId?: string) {
    return {
      onClick: (e: any) => openSurfaceMenu(surface, wallId, e),
      onPointerDown: (e: any) => startHold(surface, wallId, e),
      onPointerMove: (e: any) => moveHold(e),
      onPointerUp: () => clearHold(),
      onPointerLeave: () => clearHold(),
      onPointerCancel: () => clearHold(),
    };
  }

  /**
   * The four rectangular walls in the room's own frame. Each wall runs along
   * one world axis; its "left edge" (where local `position` = 0) is at
   * `centerAlong − length/2` on that axis. This is the single source of truth
   * for converting a world raycast hit into a wall-local (u = along, v = up)
   * coordinate — so a created opening is pinned to the clicked wall and can
   * never be computed against another wall.
   */
  function wallGeom(wallId: string): { axis: 'X' | 'Z'; length: number; leftAlong: number } | null {
    switch (wallId) {
      case 'A': return { axis: 'X', length: W, leftAlong: -W / 2 };
      case 'C': return { axis: 'X', length: W, leftAlong: -W / 2 };
      case 'B': return { axis: 'Z', length: D, leftAlong: -D / 2 };
      case 'D': return { axis: 'Z', length: D, leftAlong: -D / 2 };
      default: return null;
    }
  }

  /**
   * Create a window ('deraza') or door ('eshik') ON the given wall, centred on
   * the world hit `point`, in the wall's LOCAL coordinate system:
   *   position    = mm from the wall's left edge to the opening's left edge
   *   sill_height = mm from the floor to the opening's bottom (doors: always 0)
   * Both are clamped so the opening stays fully within the wall. Because we key
   * `addElement(wallId, …)` and store only wall-local numbers, the opening is
   * bound to this wall and cannot jump to another.
   */
  function createOpening(wallId: string, point: { x: number; y: number; z: number } | undefined, type: 'deraza' | 'eshik') {
    const g = wallGeom(wallId);
    if (!g || !point) return;
    const isDoor = type === 'eshik';
    const widthMm = 900;
    const heightMm = isDoor ? 2100 : 1200;
    const wallLenMm = g.length * 1000;
    const wallHMm = H * 1000;

    // Along-wall hit → left-edge offset, centred on the click.
    const along = g.axis === 'X' ? point.x : point.z;      // metres, world
    const uMm = (along - g.leftAlong) * 1000;              // mm from left edge
    const position = Math.max(0, Math.min(wallLenMm - widthMm, uMm - widthMm / 2));

    // Vertical: doors sit on the floor; windows centre on the hit height.
    let sill_height = 0;
    if (!isDoor) {
      const vMm = point.y * 1000;
      sill_height = Math.max(0, Math.min(wallHMm - heightMm, vMm - heightMm / 2));
    }

    addElement(wallId, { type, width: widthMm, height: heightMm, sill_height, position });
    setSelectedWall(wallId);
  }

  /** The context actions offered for each surface. Each opens the matching
   *  existing panel/sheet — the exact wiring is easy to retarget later. */
  function buildRadialItems(r: { surface: RadialSurface; wallId?: string; point?: { x: number; y: number; z: number } }): RadialItem[] {
    if (r.surface === 'wall') {
      return [
        {
          key: 'paint', label: 'Rang', icon: RadialIcons.paint,
          onSelect: () => { setSelectedWall(r.wallId ?? 'ALL'); setActivePhase('boyoq'); setShowPanel(true); },
        },
        {
          key: 'window', label: 'Oyna', icon: RadialIcons.window,
          onSelect: () => { if (r.wallId) createOpening(r.wallId, r.point, 'deraza'); },
        },
        {
          key: 'door', label: 'Eshik', icon: RadialIcons.door,
          onSelect: () => { if (r.wallId) createOpening(r.wallId, r.point, 'eshik'); },
        },
      ];
    }
    if (r.surface === 'ceiling') {
      return [
        {
          key: 'light', label: 'Chiroq', icon: RadialIcons.light,
          onSelect: () => { setActivePhase('chiroq'); setShowPanel(true); },
        },
        {
          key: 'ceiling', label: 'Shift turi', icon: RadialIcons.ceiling,
          onSelect: () => { setSelectedWall('CEILING'); setActivePhase('boyoq'); setShowPanel(true); },
        },
      ];
    }
    // floor
    return [
      {
        key: 'object', label: 'Narsa', icon: RadialIcons.add,
        onSelect: () => setShowAddSheet(true),
      },
      {
        key: 'floor', label: 'Pol turi', icon: RadialIcons.floor,
        onSelect: () => { setSelectedWall('FLOOR'); setActivePhase('pol'); setShowPanel(true); },
      },
    ];
  }

  // Live aspect ratio of the 3D canvas. The Mebelirovka tab hands the viewport
  // only half the width, so the framing has to be recomputed per tab instead of
  // being derived from the room dimensions alone.
  const canvasBoxRef = useRef<HTMLDivElement | null>(null);
  const [canvasAspect, setCanvasAspect] = useState(16 / 9);
  const lastCanvasWidth = useRef(0);
  useEffect(() => {
    const el = canvasBoxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      setCanvasAspect(width / height);
      // Any tab switch resizes this slot under a camera that keeps its old
      // pose, so the room ends up off to one side. Re-run the framing whenever
      // the width really changes — keyed on size rather than on which tab is
      // open, so it covers both directions and survives a remount.
      const prev = lastCanvasWidth.current;
      lastCanvasWidth.current = width;
      if (prev > 0 && Math.abs(width - prev) / prev > 0.05) {
        setPresetVersion((n) => n + 1);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 1 on a comfortably wide canvas, growing as it narrows. Capped so a very
  // slim viewport doesn't fling the camera into the far plane.
  const fitScale = useMemo(() => {
    const REF_ASPECT = 1.6;
    return canvasAspect >= REF_ASPECT ? 1 : Math.min(REF_ASPECT / canvasAspect, 2.2);
  }, [canvasAspect]);

  const topView = preset === "top";

  // Sibling rooms for the top-view floor plan (fetched outside the Canvas —
  // contexts don't bridge into the R3F tree)
  const aptId = room.apartment_id && room.apartment_id !== 'local' ? room.apartment_id : null;
  const queryClient = useQueryClient();
  const { data: aptRooms } = useQuery({
    queryKey: ['apt-rooms', aptId],
    queryFn: () => getRooms(aptId!),
    enabled: topView && !!aptId,
    staleTime: 5_000,
  });

  async function handleDeleteSibling(id: string, name: string) {
    if (!window.confirm(`"${name}" xonasini o'chirishni tasdiqlaysizmi? Bu amalni qaytarib bo'lmaydi.`)) return;
    try {
      await deleteRoom(id);
      queryClient.invalidateQueries({ queryKey: ['apt-rooms', aptId] });
    } catch (err) {
      alert("Xonani o'chirib bo'lmadi: " + (err instanceof Error ? err.message : 'xato'));
    }
  }

  // Backfill: legacy rooms have no stored position. Assign this room its slot
  // in the shared absolute frame so the "+ add room" anchor math and the
  // sibling rendering agree; the next save persists it.
  useEffect(() => {
    if (!aptRooms) return;
    const s = useRoomStore.getState();
    if (s.layoutPos || s.roomId !== room.id) return;
    const pos = computeAbsolutePositions(aptRooms, room.id, W, D).get(room.id);
    if (pos) s.setLayoutPos(pos);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aptRooms, room.id]);

  const cam = useMemo(() => {
    // Cutaway modes view the room from OUTSIDE as a three-quarter product shot
    if (cutaway !== 'off' && preset !== 'top') {
      return fitFramingToAspect({
        position: [W * 0.9 + 2.5, H * 1.8, D * 0.9 + 2.5] as [number, number, number],
        target: [0, H * 0.32, 0] as [number, number, number],
      }, fitScale, Math.max(W, D) * 4 + 6);
    }
    const base = getCamera(preset, W, D, H);
    // Only the aerial framing is re-fitted: the corner/front/back presets stand
    // the camera inside the room, where pulling back would push it through a
    // wall rather than reveal more of the floor.
    return preset === 'top'
      ? fitFramingToAspect(base, fitScale, Math.max(W, D) * 4)
      : base;
  }, [preset, cutaway, W, D, H, fitScale]);

  // Keyboard shortcuts — desktop power-user navigation
  const selectedFurIdRef = useRef<string | null>(null);
  selectedFurIdRef.current = selectedFurId;
  const selectedPartRef = useRef<SelectedPart | null>(null);
  selectedPartRef.current = selectedPart;
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
        case 't': setPreset((p) => (p === 'top' ? 'back' : 'top')); setPresetVersion((n) => n + 1); break;
        case 'k': setCutaway((m) => (m === 'off' ? 'auto' : m === 'auto' ? 'diorama' : 'off')); break;
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
  }, []);

  // Leaving part mode (or switching rooms) drops any live part selection
  useEffect(() => {
    if (toolMode !== 'part') setSelectedPart(null);
  }, [toolMode]);
  useEffect(() => { setSelectedPart(null); }, [room.id]);

  // Recenter the camera on the room's centre when the cutaway mode changes or
  // a DIFFERENT room loads (switching rooms only changes the :roomId param —
  // the page does not remount, so pan/orbit drift would otherwise carry over).
  // Skips the mount pass: the initial framing comes from initCam, not an
  // animation.
  const camKeyRef = useRef<{ roomId: string; cutaway: CutawayMode } | null>(null);
  useEffect(() => {
    const prev = camKeyRef.current;
    camKeyRef.current = { roomId: room.id, cutaway };
    if (!prev) return;
    if (prev.roomId !== room.id || prev.cutaway !== cutaway) {
      setPresetVersion((n) => n + 1);
    }
  }, [room.id, cutaway]);

  // Limit orbit radius to shorter room dimension so camera stays inside
  const interiorMaxDist = Math.min(W, D) * 0.85;
  // Top view: keep camera above ceiling — ceiling is hidden so user can scroll "through" it
  const topMinDist = H * 2.4;
  const maxPolarAngle = Math.PI * 0.88;

  // Initial camera position — only used on first mount
  const initCam = useMemo(
    () => getCamera("corner", W, D, H),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const activeIdx = RENO_STAGES.findIndex(s => s.key === activePhase);

  // Kept visible: the studio's responsive layout (collapsible edge rail,
  // bottom-sheet panel on tablet/mobile) is built around this stepper being
  // the primary phase-navigation surface. The new long-press radial menu on
  // walls/ceiling/floor is an additional, faster path for surface edits —
  // not a replacement for the stepper.
  const SHOW_PHASE_STEPPER = true;

  return (
    <div className="flex flex-col lg:flex-row h-full">

      {/* ── Mobile: horizontal phase strip (hidden — replaced by surface radial menu) ── */}
      {SHOW_PHASE_STEPPER && (
      <div className="flex lg:hidden shrink-0 overflow-x-auto bg-surface border-b border-gray-200 select-none" style={{ scrollbarWidth: 'none' }}>
        {RENO_STAGES.map((stage, i) => {
          const status = i < activeIdx ? 'done' : i === activeIdx ? 'current' : 'pending';
          return (
            <button
              key={stage.key}
              onClick={() => setActivePhase(stage.key)}
              title={stage.label}
              aria-label={stage.label}
              aria-current={status === 'current' ? 'step' : undefined}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 lg:py-2.5 text-[11px] font-semibold whitespace-nowrap border-b-2 transition-colors ${
                status === 'current' ? 'border-brand text-brand' :
                status === 'done'    ? 'border-transparent text-emerald-700' :
                                       'border-transparent text-gray-500'
              }`}
            >
              {status === 'done' && (
                <svg width="10" height="10" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1.5 5.5l3 3 5-5"/>
                </svg>
              )}
              {status === 'current' && <span className="w-1.5 h-1.5 rounded-full bg-brand inline-block" />}
              {stage.label}
            </button>
          );
        })}
      </div>
      )}

      {/* ── Desktop: left phase stepper sidebar, collapsible ── */}
      {SHOW_PHASE_STEPPER && (
      <div className="relative hidden lg:block shrink-0">
      <nav
        aria-hidden={!leftOpen}
        className="hidden lg:flex bg-surface border-r border-gray-200 flex-col pt-3 select-none overflow-hidden"
        style={{
          width: leftOpen ? 144 : 0,
          // `visibility` (not just width/overflow) so the collapsed rail's
          // buttons drop out of the Tab order and the AT tree — width:0 +
          // overflow:hidden alone still leaves them focusable-by-Tab while
          // invisible. Delayed only on the way to hidden so the width
          // animation still visibly plays first; instant on the way back to
          // visible so content reappears in step with the width growing.
          visibility: leftOpen ? 'visible' : 'hidden',
          transition: leftOpen
            ? 'width 0.2s ease, visibility 0s linear 0s'
            : 'width 0.2s ease, visibility 0s linear 0.2s',
        }}
      >
        <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest px-4 mb-2">Bosqichlar</p>
        {RENO_STAGES.map((stage, i) => {
          const status = i < activeIdx ? 'done' : i === activeIdx ? 'current' : 'pending';
          return (
            <button
              key={stage.key}
              onClick={() => setActivePhase(stage.key)}
              title={stage.label}
              aria-label={stage.label}
              aria-current={status === 'current' ? 'step' : undefined}
              className={`w-full flex items-center gap-2 px-4 py-2.5 text-[12px] font-semibold text-left transition-colors ${
                status === 'current'
                  ? 'bg-brand text-white'
                  : status === 'done'
                  ? 'text-emerald-700 hover:bg-gray-50'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {status === 'done' && (
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M1.5 5.5l3 3 5-5"/>
                </svg>
              )}
              {status === 'current' && (
                <span className="w-2 h-2 rounded-full bg-white/90 animate-pulse inline-block shrink-0" />
              )}
              {status === 'pending' && (
                <span className="w-2 h-2 rounded-full bg-gray-300 inline-block shrink-0" />
              )}
              <span className="leading-tight">{stage.label}</span>
            </button>
          );
        })}
      </nav>
      {/* Docked to the rail's visible edge — left offset tracks leftOpen so
          it always sits flush against wherever the rail's edge currently is,
          mid-transition included. */}
      <button
        onClick={() => setLeftOpen(v => !v)}
        title={leftOpen ? "Bosqichlar panelini yopish" : "Bosqichlar panelini ochish"}
        aria-label={leftOpen ? "Bosqichlar panelini yopish" : "Bosqichlar panelini ochish"}
        className="hidden lg:flex items-center justify-center bg-white border border-gray-200 shadow-md rounded-full hover:bg-gray-50 transition-colors"
        style={{
          position: 'absolute',
          top: '50%',
          left: leftOpen ? 144 : 0,
          // Open: straddle the rail's edge (plenty of room at x=144). Closed:
          // the rail is flush against the true page edge (x=0), so the usual
          // -50% centering would push half the button past x=0 — clipped by
          // the viewport with no way to see or click it back open. Anchor
          // flush instead, extending inward, so it's always fully visible.
          transform: leftOpen ? 'translate(-50%, -50%)' : 'translate(0, -50%)',
          width: 22,
          height: 40,
          // zIndex:5 got painted over by the R3F <canvas> (a sibling deep in
          // a different part of the tree, so a low z-index here didn't
          // reliably out-rank it — confirmed via elementFromPoint returning
          // the canvas, not this button). Same z-tier as the mobile panel
          // sheet (z-50)/backdrop (z-40), comfortably above the canvas.
          zIndex: 60,
          transition: 'left 0.2s ease',
        }}
      >
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#4B5563" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: leftOpen ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s ease' }}
        >
          <path d="M6.5 1L2.5 5l4 4" />
        </svg>
      </button>
      </div>
      )}

      {/* ── Center: toolbar + canvas ─────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Toolbar — current phase, then view preset, transform tools, view
            controls, lighting, AI, each cluster separated by a divider. This
            is the studio's only toolbar row now that the header absorbed the
            old separate tab-nav row (see StudioPage.tsx).

            Wrapped in `relative` for the right-edge fade hint below: with
            this many clusters the row overflows on narrower screens, and
            scrollbar-width:none (previously set here) suppressed the native
            scrollbar in Chromium too — not just Firefox — leaving zero
            visual cue that content like the AI button was one scroll away
            rather than actually missing. Now shows the app's thin global
            scrollbar (styles/global.css) AND a fade gradient, so it reads as
            "scroll for more" instead of "cut off". */}
        <div className="relative shrink-0">
        <div className="flex items-center gap-2 lg:gap-1.5 px-2 lg:px-4 py-1 lg:py-2 bg-surface border-b border-gray-200 overflow-x-auto">
          {activeIdx >= 0 && (
            <>
              <span className="text-xs font-semibold text-gray-700 shrink-0 whitespace-nowrap">
                Bosqich: {RENO_STAGES[activeIdx].label}
              </span>
              <div className="hidden sm:block w-px h-6 bg-gray-300 shrink-0" />
            </>
          )}
          <span className="text-xs font-medium text-gray-500 mr-0.5 shrink-0 hidden sm:block">Ko'rinish:</span>
          {(["back", "top"] as ViewPreset[]).map((v) => (
            <button
              key={v}
              onClick={() => { setPreset(v); setPresetVersion(n => n + 1) }}
              aria-pressed={preset === v}
              className={`shrink-0 px-2.5 py-1 rounded-full text-xs transition-colors ${
                preset === v
                  ? "bg-brand text-white font-medium"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-700"
              }`}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <div className="flex items-center bg-gray-100 rounded-full p-0.5 gap-0.5">
              <button
                onClick={() => setToolMode('select')}
                title="Tanlash"
                aria-pressed={toolMode === 'select'}
                className={`flex items-center justify-center gap-1 px-2 py-2 lg:py-1 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 rounded-full text-xs font-medium transition-colors ${
                  toolMode === 'select' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4 0l16 10.5-7 1.5 4 8-2.5 1-4-8-6.5 4.5z"/>
                </svg>
                <span className="hidden sm:inline">Tanlash</span>
              </button>
              <button
                onClick={() => setToolMode('move')}
                title="Siljitish"
                aria-pressed={toolMode === 'move'}
                className={`flex items-center justify-center gap-1 px-2 py-2 lg:py-1 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 rounded-full text-xs font-medium transition-colors ${
                  toolMode === 'move' ? 'bg-brand text-white shadow' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11 3l-4 4h3v3H7V7l-4 4 4 4v-3h3v3H7l4 4 4-4h-3v-3h3v3l4-4-4-4v3h-3V7h3l-4-4z"/>
                </svg>
                <span className="hidden sm:inline">Siljitish</span>
              </button>
              <button
                onClick={() => setToolMode('rotate')}
                title="Aylantirish"
                aria-pressed={toolMode === 'rotate'}
                className={`flex items-center justify-center gap-1 px-2 py-2 lg:py-1 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 rounded-full text-xs font-medium transition-colors ${
                  toolMode === 'rotate' ? 'bg-brand text-white shadow' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/>
                </svg>
                <span className="hidden sm:inline">Aylantirish</span>
              </button>
              <button
                onClick={() => setToolMode('scale')}
                title="O'lcham"
                aria-pressed={toolMode === 'scale'}
                className={`flex items-center justify-center gap-1 px-2 py-2 lg:py-1 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 rounded-full text-xs font-medium transition-colors ${
                  toolMode === 'scale' ? 'bg-brand text-white shadow' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 21H3M21 3H3M12 7v10M9 10l3-3 3 3M9 14l3 3 3-3"/>
                </svg>
                <span className="hidden sm:inline">O'lcham</span>
              </button>
              <button
                onClick={() => setToolMode('part')}
                title="Qismlar — model ichidagi qismni tanlash, ajratish yoki o'chirish"
                aria-pressed={toolMode === 'part'}
                className={`flex items-center justify-center gap-1 px-2 py-2 lg:py-1 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 rounded-full text-xs font-medium transition-colors ${
                  toolMode === 'part' ? 'bg-brand text-white shadow' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l8 4.5v9L12 20l-8-4.5v-9z"/>
                  <path d="M12 11l8-4.5M12 11v9M12 11L4 6.5"/>
                  <path d="M16 3.5l-8 4.5"/>
                </svg>
                <span className="hidden sm:inline">Qismlar</span>
              </button>
            </div>
            {/* Undo/redo — Ctrl+Z / Ctrl+Y work from any studio tab (see
                StudioPage.tsx), these buttons are the discoverable,
                touch-friendly equivalent for this tab specifically. */}
            <div className="flex items-center bg-gray-100 rounded-full p-0.5 gap-0.5 shrink-0">
              <button
                onClick={() => useRoomStore.temporal.getState().undo()}
                disabled={!canUndo}
                title="Bekor qilish (Ctrl+Z)"
                aria-label="Bekor qilish (Ctrl+Z)"
                className="flex items-center justify-center px-2 py-2 lg:py-1 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 rounded-full text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:hover:text-gray-500 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 14L4 9l5-5"/>
                  <path d="M4 9h11a5 5 0 0 1 0 10h-1"/>
                </svg>
              </button>
              <button
                onClick={() => useRoomStore.temporal.getState().redo()}
                disabled={!canRedo}
                title="Qaytarish (Ctrl+Y)"
                aria-label="Qaytarish (Ctrl+Y)"
                className="flex items-center justify-center px-2 py-2 lg:py-1 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 rounded-full text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:hover:text-gray-500 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 14l5-5-5-5"/>
                  <path d="M20 9H9a5 5 0 0 0 0 10h1"/>
                </svg>
              </button>
            </div>
            {toolMode === 'rotate' && selectedFurId && (() => {
              const item = furniture.find(f => f.id === selectedFurId)
              if (!item) return null
              const currentDeg = Math.round(item.rotation * (180 / Math.PI))
              return (
                <form
                  className="flex items-center gap-1"
                  onSubmit={e => {
                    e.preventDefault()
                    const deg = parseFloat(angleInputDeg)
                    if (!isNaN(deg)) {
                      moveFurniture(item.id, item.x, item.y, deg * (Math.PI / 180))
                      setAngleInputDeg('')
                    }
                  }}
                >
                  <input
                    key={selectedFurId + currentDeg}
                    type="number"
                    defaultValue={currentDeg}
                    onChange={e => setAngleInputDeg(e.target.value)}
                    placeholder={`${currentDeg}°`}
                    className="w-14 text-xs border border-gray-300 rounded px-1 py-0.5 text-center focus:outline-none focus:border-brand"
                    title="Burchakni darajada kiriting va Enter bosing"
                  />
                  <span className="text-gray-500 text-xs">°</span>
                  <button type="submit" className="text-xs px-1.5 py-0.5 bg-brand text-white rounded font-medium">✓</button>
                </form>
              )
            })()}
            {/* Navigation help */}
            <button
              onClick={() => setShowHelp(v => !v)}
              title="Boshqaruv bo'yicha yordam"
              aria-label="Boshqaruv bo'yicha yordam"
              className="flex items-center justify-center w-7 h-7 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 rounded-full text-xs font-bold transition-colors border shrink-0 bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200"
            >
              ?
            </button>
            {/* Recenter: snap the orbit pivot back to the room centre */}
            <button
              onClick={() => setPresetVersion(n => n + 1)}
              title="Markazlash — kamerani xona markaziga qaytarish"
              aria-label="Markazlash — kamerani xona markaziga qaytarish"
              className="flex items-center justify-center gap-1 px-2 py-2 lg:py-1 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 rounded-full text-xs font-medium transition-colors border shrink-0 bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
              </svg>
              <span className="hidden sm:inline">Markaz</span>
            </button>
            {/* Skrinshot: grabs the live canvas (same glCanvasRef +
                preserveDrawingBuffer setup as the project-card thumbnail
                above) as a lossless PNG and downloads it — no server call,
                no shareable link, just the smallest useful export. */}
            <button
              onClick={handleScreenshot}
              title="Skrinshot — dizaynni rasm sifatida saqlash"
              aria-label="Skrinshot — dizaynni rasm sifatida saqlash"
              className={`flex items-center justify-center gap-1 px-2 py-2 lg:py-1 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 rounded-full text-xs font-medium transition-colors border shrink-0 ${
                screenshotStatus === 'saved'
                  ? 'bg-success text-white border-success'
                  : screenshotStatus === 'error'
                  ? 'bg-red-100 text-red-600 border-red-300'
                  : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
              }`}
            >
              {screenshotStatus === 'saved' ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              ) : screenshotStatus === 'error' ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v5M12 16h.01" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 8V6a1 1 0 0 1 1-1h2l1.5-2h7L17 5h2a1 1 0 0 1 1 1v2" />
                  <path d="M3 8h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
                  <circle cx="12" cy="13.5" r="3.5" />
                </svg>
              )}
              <span className="hidden sm:inline" aria-live="polite">
                {screenshotStatus === 'saved' ? 'Saqlandi' : screenshotStatus === 'error' ? 'Xato' : 'Skrinshot'}
              </span>
            </button>
            {/* Cutaway mode: interior → auto cutaway → fixed diorama.
                Disabled in top view where the shell is already open. */}
            <button
              onClick={() => setCutaway(m => m === 'off' ? 'auto' : m === 'auto' ? 'diorama' : 'off')}
              disabled={topView}
              title={
                topView ? "Yuqoridan ko'rinishda kesma shart emas"
                : cutaway === 'off' ? "Kesma ko'rinishga o'tish (devorlar kamera tomonda yashirinadi)"
                : cutaway === 'auto' ? "Diorama rejimiga o'tish (sobit taqdimot ko'rinishi)"
                : "Ichki ko'rinishga qaytish"
              }
              aria-label={
                topView ? "Yuqoridan ko'rinishda kesma shart emas"
                : cutaway === 'off' ? "Kesma ko'rinishga o'tish (devorlar kamera tomonda yashirinadi)"
                : cutaway === 'auto' ? "Diorama rejimiga o'tish (sobit taqdimot ko'rinishi)"
                : "Ichki ko'rinishga qaytish"
              }
              className={`flex items-center justify-center gap-1 px-2 py-2 lg:py-1 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 rounded-full text-xs font-medium transition-colors border shrink-0 ${
                topView
                  ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                  : cutaway !== 'off'
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200'
                  : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 8l-9-5-9 5v8l9 5 9-5z" />
                <path d="M3 8l9 5 9-5M12 13v9" />
              </svg>
              <span className="hidden sm:inline">
                {cutaway === 'off' ? 'Ichki' : cutaway === 'auto' ? 'Kesma' : 'Diorama'}
              </span>
            </button>
            {/* ── Lighting cluster: day/night, sun clock, room lights ── */}
            <div className="hidden sm:block w-px h-6 bg-gray-300 shrink-0" />
            <div className="flex items-center gap-1.5 shrink-0 bg-gray-50 border border-gray-200 rounded-full pl-1 pr-1.5 py-0.5">
            {/* Scene light (sun + environment) toggle */}
            <button
              onClick={() => setSceneLightOn(v => !v)}
              title={sceneLightOn ? "Sahna yorug'ligini o'chirish" : "Sahna yorug'ligini yoqish"}
              aria-label={sceneLightOn ? "Sahna yorug'ligini o'chirish" : "Sahna yorug'ligini yoqish"}
              className={`flex items-center justify-center gap-1 px-2 py-2 lg:py-1 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 rounded-full text-xs font-medium transition-colors border shrink-0 ${
                sceneLightOn
                  ? 'bg-brand text-white border-brand hover:bg-brand/90'
                  : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
              <span className="hidden sm:inline">{sceneLightOn ? 'Kunduz' : 'Tun'}</span>
            </button>
            {/* Sun clock. Only meaningful while the sun is the light source, so
                it rides with the day/night toggle. */}
            {sceneLightOn && (
              <>
              <span className="text-xs font-medium text-gray-500 shrink-0 hidden sm:block">Vaqt:</span>
              <div
                className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-amber-200 bg-amber-50 shrink-0"
                title="Quyosh vaqti — Toshkent bo'yicha"
              >
                <span className="text-[11px] font-semibold text-amber-800 tabular-nums w-9 text-right">
                  {formatClock(sunHour)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={23.75}
                  step={0.25}
                  value={sunHour}
                  onChange={(e) => setSunHour(parseFloat(e.target.value))}
                  aria-label="Quyosh vaqti"
                  className="w-14 sm:w-24 accent-amber-500 cursor-pointer"
                />
              </div>
              </>
            )}
            <button
              onClick={() => setLightsOn(v => !v)}
              title={lightsOn ? "Chiroqni o'chirish" : "Chiroqni yoqish"}
              aria-label={lightsOn ? "Chiroqni o'chirish" : "Chiroqni yoqish"}
              className={`flex items-center justify-center gap-1 px-2 py-2 lg:py-1 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 rounded-full text-xs font-medium transition-colors border shrink-0 ${
                lightsOn
                  ? 'bg-brand text-white border-brand hover:bg-brand/90'
                  : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 14c.2-1 .7-1.7 1.5-2.5C17.7 10.2 19 8.7 19 7c0-3.3-2.7-6-6-6S7 3.7 7 7c0 1.7 1.3 3.2 2.5 4.5.8.8 1.3 1.5 1.5 2.5"/>
                <path d="M9 18h6M10 22h4"/>
              </svg>
              <span className="hidden sm:inline">{lightsOn ? 'Yoqilgan' : "O'chirilgan"}</span>
            </button>
            </div>
            <div className="hidden sm:block w-px h-6 bg-gray-300 shrink-0" />
            {/* AI builder button — stays visually distinct from the Kunduz/
                Yoqilgan brand-blue toggles (it's a one-shot special action,
                not a peer toggle), but now via the app's own warning/orange
                accent token (same family as the "Buyum qo'shish" CTA) rather
                than an unrelated purple with no other usage on the page. */}
            <button
              onClick={() => setShowAiSheet(true)}
              title="AI bilan qurish"
              aria-label="AI bilan qurish"
              className="flex items-center justify-center gap-1 px-2.5 py-2 lg:py-1 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 rounded-full text-xs font-semibold bg-warning text-white hover:bg-warning-dark transition-colors shrink-0"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 0 2h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1 0-2h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
              </svg>
              <span className="hidden sm:inline">AI</span>
            </button>
            {/* Mobile: design panel toggle. Closes the help card too — two
                overlays open at once is never useful, even though the
                z-index stack (backdrop z-40 over help card z-30) already
                keeps them from visually colliding. */}
            <button
              onClick={() => { setShowPanel(v => !v); setShowHelp(false); }}
              title="Dizayn paneli"
              aria-label="Dizayn paneli"
              className="lg:hidden flex items-center justify-center gap-1 px-2 py-2 min-h-[44px] min-w-[44px] rounded-full text-xs font-medium bg-brand text-white shrink-0"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="13.5" cy="6.5" r="2.5"/><circle cx="19" cy="17" r="2.5"/><circle cx="6" cy="17" r="2.5"/>
                <path d="M13.5 9v3.5M19 14.5V11l-5.5-2M6 14.5V11l5.5-2"/>
              </svg>
              <span className="hidden sm:inline">Dizayn</span>
            </button>
          </div>
        </div>
        {/* Right-edge fade — pointer-events-none so it never blocks clicks on
            whatever's actually scrolled underneath it. */}
        <div className="pointer-events-none absolute top-0 right-0 bottom-0 w-8 bg-gradient-to-l from-surface to-transparent" />
        </div>

        {/* Canvas area */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* Mebelirovka: 2D plan editor beside the live 3D viewport */}
        {isMebelTab && (
          <div className="h-[38%] lg:h-auto lg:w-1/2 min-h-0 shrink-0 border-b lg:border-b-0 lg:border-r border-gray-200 bg-[#F6F4EF]">
            <MebelPlanView />
          </div>
        )}
        {/* Chiroqlar: reflected ceiling plan beside the live 3D viewport */}
        {isChiroqTab && (
          <div className="h-[38%] lg:h-auto lg:w-1/2 min-h-0 shrink-0 border-b lg:border-b-0 lg:border-r border-gray-200 bg-[#F6F4EF]">
            <ChiroqPlanView
              armedType={armedLightType}
              onPlaced={() => setArmedLightType(null)}
              selectedId={selectedLightId}
              onSelect={setSelectedLightId}
            />
          </div>
        )}
        {/* min-w-0 is load-bearing: R3F sets a pixel width/height ON the canvas
            element, which becomes its intrinsic size. A flex item defaults to
            min-width:auto, so once the canvas had been sized for the full-width
            3D tab, this column refused to shrink below that width when the plan
            editor claimed half the row — the canvas kept its old width, spilled
            under the design panel, and the centred render ended up off to the
            right. overflow-hidden keeps any future spill inside the slot. */}
        <div ref={canvasBoxRef} className="flex-1 min-w-0 min-h-0 relative overflow-hidden" {...viewportDropProps}>

          {/* Model drag & drop over the viewport */}
          {(modelDropOver || modelDropStatus === 'loading') && (
            <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-brand/10 backdrop-blur-[1px] border-4 border-dashed border-brand rounded-lg">
              <div className="bg-white/95 rounded-2xl px-6 py-4 shadow-xl text-center">
                <p className="text-2xl mb-1">{modelDropStatus === 'loading' ? '⏳' : '📦'}</p>
                <p className="text-sm font-bold text-gray-900">
                  {modelDropStatus === 'loading' ? 'Model yuklanmoqda...' : "Modelni xonaga qo'yib yuboring"}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">GLB · GLTF · OBJ · FBX (+ teksturalari)</p>
              </div>
            </div>
          )}
          {modelDropWarn && (
            <p className="absolute top-3 left-1/2 -translate-x-1/2 z-40 max-w-[80%] bg-amber-50 border border-amber-200 text-amber-700 text-[11px] px-3 py-1.5 rounded-lg shadow">
              {modelDropWarn}
            </p>
          )}

          {/* Navigation help card */}
          {showHelp && (
            <div className="absolute top-3 right-3 z-30 w-72 max-w-[90%] bg-white/97 backdrop-blur rounded-2xl shadow-xl border border-gray-200 p-4 text-[12px] leading-5 text-gray-700">
              <div className="flex items-center justify-between mb-2">
                <p className="font-bold text-gray-900">Boshqaruv</p>
                <button onClick={() => setShowHelp(false)} className="text-gray-400 hover:text-gray-600 font-bold">✕</button>
              </div>
              <p className="font-semibold text-gray-500 text-[10px] uppercase tracking-wide mb-1">Sichqoncha</p>
              <ul className="space-y-0.5 mb-2">
                <li>Chap tugma — aylantirish</li>
                <li>O'ng / o'rta tugma — surish</li>
                <li>G'ildirak — yaqinlashtirish</li>
                <li>Ikki marta bosish — shu nuqtaga fokus</li>
                <li>Bo'sh joyga ikki marta — markazga qaytish</li>
                <li>Pastki o'ngdagi o'qlar — ko'rinishni burish</li>
              </ul>
              <p className="font-semibold text-gray-500 text-[10px] uppercase tracking-wide mb-1">Sensor ekran</p>
              <ul className="space-y-0.5 mb-2">
                <li>Bir barmoq — aylantirish</li>
                <li>Ikki barmoq — surish va masshtab</li>
              </ul>
              <p className="font-semibold text-gray-500 text-[10px] uppercase tracking-wide mb-1">Klaviatura</p>
              <ul className="space-y-0.5">
                <li><b>1–5</b> — Tanlash / Siljitish / Aylantirish / O'lcham / Qismlar</li>
                <li><b>T</b> — Yuqoridan / 3D &nbsp; <b>K</b> — Kesma</li>
                <li><b>N</b> — Kun/Tun &nbsp; <b>L</b> — Chiroqlar</li>
                <li><b>F</b> — Markazlash &nbsp; <b>Del</b> — O'chirish</li>
                <li><b>Esc</b> — bekor qilish</li>
              </ul>
            </div>
          )}

          {/* Mebelirovka quick actions — doors/windows editor + 3D model import */}
          {isMebelTab && (
            <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
              <button
                onClick={() => setElementsSheetOpen(true)}
                title="Eshik va derazalarni qo'shish yoki tahrirlash"
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/95 border border-gray-200 shadow-md text-[12px] font-semibold text-gray-700 hover:bg-white transition-colors"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="3" width="9" height="18" rx="1" />
                  <circle cx="10.5" cy="12" r="0.8" fill="currentColor" />
                  <rect x="16" y="6" width="5" height="7" rx="0.5" />
                  <path d="M18.5 6v7M16 9.5h5" />
                </svg>
                Eshik / Deraza
              </button>
              <div className="[&>button]:w-full">
                <ModelImportButton compact />
              </div>
            </div>
          )}

          {/* Bottom CTA */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
            <button
              onClick={() => setShowAddSheet(true)}
              className="pointer-events-auto flex items-center gap-2 px-6 py-3 text-white rounded-[20px] font-bold text-[15px] active:scale-[0.97] transition-transform"
              style={{ background: "linear-gradient(135deg,#F97316 0%,#EA580C 100%)", boxShadow: "0 12px 28px -8px rgba(249,115,22,.65)" }}
            >
              <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <path d="M8.5 2.5v12M2.5 8.5h12"/>
              </svg>
              Buyum qo'shish
            </button>
          </div>

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
          camera={{ position: initCam.position, fov: 45, near: 0.1, far: 60 }}
          // Absolute, so the canvas is out of flow and its pixel width can
          // never feed back into the layout that sizes it. In flow, R3F's
          // width/height attributes act as the element's intrinsic size, and
          // the flex column then refuses to shrink past the size the canvas
          // already had — the viewport and the canvas disagree, and the
          // centred render drifts out of the visible slot on every tab switch.
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          gl={{
            antialias: glAttempt === 0,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.15,
            outputColorSpace: THREE.SRGBColorSpace,
            powerPreference: glAttempt === 0 ? 'high-performance' : 'default',
            // Without this, the drawing buffer can already be cleared by the
            // time the unmount-triggered toBlob() capture below runs, which
            // would silently produce a blank thumbnail instead of an error.
            preserveDrawingBuffer: true,
          }}
          onCreated={({ gl }) => { glCanvasRef.current = gl.domElement; }}
          onPointerMissed={() => { setSelectedFurId(null); setSelectedPart(null); setSelectedDoorId(null); setSelectedLightId(null); }}
          dpr={glAttempt === 0 ? dpr : 1}
        >
          {/* Drop resolution during interaction, restore at rest */}
          <AdaptiveDpr />
          <AdaptiveEvents />
          <KeepAutoClear />
          <DevSceneHandle />
          {/* Return the WebGL context slot immediately on tab switches */}
          <ReleaseGLOnUnmount />
          {/* Daylight shows the Kloofendal sky photo (SafeEnvironment below
              owns scene.background); a flat colour here would simply paint
              over it. With the scene light switched off there is no sky, so
              the solid fill is still what stands in for one. */}
          {!sceneLightOn && <color attach="background" args={["#14171F"]} />}
          {/* Fog matches the background (night fog was beige on a dark scene)
              and relaxes in top view where the camera legitimately sits far */}
          <fog
            attach="fog"
            args={[sceneLightOn ? skyFogColor(sun) : "#14171F", topView ? 40 : 12, topView ? 120 : 30]}
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
                <SceneLighting
                  width={W}
                  depth={D}
                  height={H}
                  highQuality={highQuality3d}
                  sun={sun}
                />
                {/* Real sky photo (Kloofendal, Poly Haven) — the product default
                    for every room. It owns scene.background and doubles as
                    image-based fill light; the sun clock keeps driving the
                    directional light and shadows above it. */}
                <SafeEnvironment files={DEFAULT_HDRI} intensity={0.35} background />
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

            <RoomScene
              room={room}
              geometry={geometry}
              topView={topView}
              designState={designState}
              showContactShadows={showContactShadows}
              composerActive={useComposer}
              highQuality={highQuality3d}
              lightsOn={lightsOn}
              plasterWalls={activePhase === 'suvoq'}
              cutaway={topView ? 'off' : cutaway}
              selectedWall={selectedWall}
              onWallClick={(id) => focusSurface(id)}
              isFloorSelected={selectedWall === 'FLOOR'}
              onFloorClick={() => focusSurface('FLOOR')}
              holdBind={holdBind}
            />
            {/* Interactive window/door editing layer (select → toolbar → drag
                with live meter labels + Canva-style snap guides). */}
            <WallOpenings
              geometry={geometry}
              W={W}
              D={D}
              H={H}
              selected={selOpening}
              onSelect={setSelOpening}
              updateElement={updateElement}
              removeElement={removeElement}
              onInteracting={(active) => { if (controlsRef.current) controlsRef.current.enabled = !active; }}
            />
            <SwapButtons W={W} D={D} H={H} />
            {topView && (
              <AddRoomButtons
                W={W} D={D} H={H} onAdd={handleAddRoom} disabled={addingRoom}
                occupiedSides={aptRooms ? computeOccupiedSides(aptRooms, room.id, W, D, activeLayoutPos) : undefined}
              />
            )}
            {topView && aptRooms && (
              <SiblingRooms
                rooms={aptRooms}
                activeId={room.id}
                activeW={W}
                activeD={D}
                activePos={activeLayoutPos}
                onOpen={async (id) => {
                  // Persist the current room before switching so edits survive
                  try { await onSave(); } catch { /* offline — switch anyway */ }
                  navigate(`/studio/${id}`);
                }}
                onDelete={handleDeleteSibling}
              />
            )}
            <DraggableFurnitureModels controlsRef={controlsRef} roomW={W} roomD={D} toolMode={toolMode} selectedId={selectedFurId} onSelectItem={setSelectedFurId} selectedPart={selectedPart} onSelectPart={setSelectedPart} />
            <DraggableElectricalModels controlsRef={controlsRef} W={W} D={D} />
            <OpeningLayer
              geometry={geometry}
              W={W}
              D={D}
              cutaway={topView ? 'off' : cutaway}
              toolMode={toolMode}
              controlsRef={controlsRef}
              selectedId={selectedDoorId}
              onSelect={setSelectedDoorId}
            />
            <DraggableLightModels controlsRef={controlsRef} roomW={W} roomD={D} roomH={H} toolMode={toolMode} lightsOn={lightsOn} highQuality={highQuality3d} selectedId={selectedLightId} onSelect={setSelectedLightId} />

            <RealismEffects enabled={useComposer} />

            <OrbitControls
              ref={controlsRef}
              makeDefault
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
              minDistance={topView ? topMinDist : cutaway !== 'off' ? 2 : 0.25}
              maxDistance={topView ? Math.max(W, D) * 4 : cutaway !== 'off' ? Math.max(W, D) * 4 + 6 : interiorMaxDist}
              maxPolarAngle={topView ? Math.PI * 0.3 : cutaway !== 'off' ? Math.PI * 0.46 : maxPolarAngle}
              minPolarAngle={topView ? 0 : 0.08}
              rotateSpeed={topView ? 0.6 : cutaway !== 'off' ? 0.5 : isTouch ? 0.45 : -0.45}
              zoomSpeed={0.8}
            />

            <CameraAnimator
              position={cam.position}
              target={cam.target}
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
        </div>
        </div>
      </div>

      {/* ── Right: contextual design panel ───────────────────────── */}

      {/* Mobile backdrop */}
      {showPanel && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/30"
          onClick={() => setShowPanel(false)}
        />
      )}

      {/* Outer wrapper: stable positioning context for the toggle button,
          rendered on every breakpoint (unlike the left rail's wrapper, this
          can't be `hidden` below lg — the mobile bottom-sheet panel lives in
          the same subtree). The toggle button is a SIBLING of the collapse
          wrapper below, not a child of it: nesting it inside was the actual
          bug — that wrapper's own `overflow:hidden` (needed so the panel
          clips instead of reflowing while collapsing) clipped the button
          along with it once width hit 0, even though position:absolute
          normally escapes a parent's normal flow. overflow:hidden clips
          ALL descendants that visually extend past its box, absolutely
          positioned or not. */}
      <div className="relative shrink-0">
      {/* Desktop-only collapse wrapper. Harmless on mobile: the panel below
          stays `fixed` there (escapes normal flow, ignores an ancestor's
          width/overflow entirely), so this only actually clips/resizes
          anything once `lg:static` below turns the panel into a normal-flow
          box that respects it. */}
      <div
        aria-hidden={!rightOpen}
        className="lg:shrink-0"
        style={{
          width: rightOpen ? 288 : 0,
          overflow: rightOpen ? 'auto' : 'hidden',
          // Same fix as the left rail's toggle: width:0 + overflow:hidden
          // alone still leaves the design panel's controls focusable-by-Tab
          // while invisible. `visibility` removes them from the Tab order
          // and the AT tree; delayed only when collapsing so the width
          // animation still plays first, instant when expanding so content
          // reappears in step with the width growing.
          visibility: rightOpen ? 'visible' : 'hidden',
          transition: rightOpen
            ? 'width 0.2s ease, visibility 0s linear 0s'
            : 'width 0.2s ease, visibility 0s linear 0.2s',
        }}
      >
      {/* Panel — desktop: static sidebar | mobile: slide-up sheet */}
      <div
        className={[
          /* mobile base */
          'fixed bottom-0 left-0 right-0 z-50 max-h-[72vh] rounded-t-2xl shadow-2xl transition-transform duration-300 ease-in-out overflow-hidden',
          showPanel ? 'translate-y-0' : 'translate-y-full',
          /* desktop override */
          'lg:static lg:translate-y-0 lg:max-h-none lg:h-full lg:rounded-none lg:shadow-none lg:z-auto lg:overflow-auto',
        ].join(' ')}
      >
        {/* Mobile drag handle */}
        <div
          className="lg:hidden flex justify-center pt-2 pb-0.5 bg-surface rounded-t-2xl cursor-pointer"
          onClick={() => setShowPanel(false)}
        >
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        <DesignPanel room={room} phase={activePhase} selectedWall={selectedWall} onWallChange={setSelectedWall}
          selectedLightId={selectedLightId} onLightChange={setSelectedLightId}
          armedLightType={armedLightType} onArmLight={setArmedLightType} planMode={isChiroqTab} />
      </div>
      </div>
      {/* Docked to the panel's left edge (mirrors the left rail's toggle,
          chevron pointing the opposite way). Sibling of the collapse
          wrapper above, not nested in it — see the comment on the outer
          wrapper for why. */}
      <button
        onClick={() => setRightOpen(v => !v)}
        title={rightOpen ? "Dizayn panelini yopish" : "Dizayn panelini ochish"}
        aria-label={rightOpen ? "Dizayn panelini yopish" : "Dizayn panelini ochish"}
        className="hidden lg:flex items-center justify-center bg-white border border-gray-200 shadow-md rounded-full hover:bg-gray-50 transition-colors"
        style={{
          position: 'absolute',
          top: '50%',
          right: rightOpen ? 288 : 0,
          // Same fix as the left rail's toggle: closed means flush against
          // the true page edge, where +50% centering would push half the
          // button past the viewport — visible only as a sliver, unclickable
          // in practice. Anchor flush and extend inward instead when closed.
          transform: rightOpen ? 'translate(50%, -50%)' : 'translate(0, -50%)',
          width: 22,
          height: 40,
          // zIndex:5 got painted over by the R3F <canvas> (a sibling deep in
          // a different part of the tree, so a low z-index here didn't
          // reliably out-rank it — confirmed via elementFromPoint returning
          // the canvas, not this button). Same z-tier as the mobile panel
          // sheet (z-50)/backdrop (z-40), comfortably above the canvas.
          zIndex: 60,
          transition: 'right 0.2s ease',
        }}
      >
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#4B5563" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: rightOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
        >
          <path d="M6.5 1L2.5 5l4 4" />
        </svg>
      </button>
      </div>

      {showAddSheet && <AddObjectSheet onClose={() => setShowAddSheet(false)} initialSection={addSheetSection} />}
      <RoomSettingsSheet open={elementsSheetOpen} onClose={() => setElementsSheetOpen(false)} />
      <AiBuilderSheet open={showAiSheet} onOpenChange={setShowAiSheet} roomId={room.id} />

      {/* Surface long-press radial menu ("aylana") */}
      {radial && (
        <SurfaceRadialMenu
          x={radial.x}
          y={radial.y}
          surface={radial.surface}
          items={buildRadialItems(radial)}
          onClose={closeRadial}
        />
      )}
    </div>
  );
}
