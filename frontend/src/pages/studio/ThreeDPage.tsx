import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext, useNavigate, useLocation } from "react-router-dom";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useRoomStore, useTemporalRoomStore } from "@/store/roomStore";
import { ModelImportButton } from "@/components/studio/ModelImportButton";
import { StudioTabStrip } from "@/components/studio/StudioTabStrip";
import { PlanViewToggle } from "@/components/studio/PlanViewToggle";
import { useModelImport } from "@/hooks/useModelImport";
import { useFileDrop, MODEL_FILE_RE } from "@/hooks/useFileDrop";
import { getRooms, deleteRoom, listCatalogFurniture } from "@/lib/api";
import type { Room } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type CutawayMode } from "@/features/studio/diorama";
import { MebelPlanView } from "@/features/studio/MebelPlanView";
import type { ToolMode } from "@/features/studio/StudioFurniture";
export { FurnitureModels } from "@/features/studio/StudioFurniture";
import { type ScanSwapRequest } from "./three-d/RoomScanOverlay";
import { nanoid } from "nanoid";
import * as THREE from "three";
import { roomExtents } from "@/lib/roomDims";
import { sunPosition, dayOfYear } from "@/lib/sunPosition";
import { ChiroqPlanView } from "@/features/studio/ChiroqPlanView";
import type { LightTypeId } from "@/lib/lightCatalog";
import { RENO_STAGES, type PhaseKey } from "@/lib/phases";
import { type ViewPreset } from "./three-d/constants";
import { computeAbsolutePositions } from "./three-d/helpers";
import { PlacedLights } from "./three-d/LightingComponents";
import { SceneLighting, BrandedSky } from "./three-d/SceneEnvironment";
import { RoomScene } from "./three-d/RoomShell";
import { ViewModeSegment } from "./three-d/ViewModeSegment";
import { useExclusiveSelection } from "./three-d/useExclusiveSelection";
import { useSurfaceRadialMenu } from "./three-d/useSurfaceRadialMenu";
import { buildRadialItems } from "./three-d/radialMenuItems";
import { useOpeningCreation } from "./three-d/useOpeningCreation";
import { useRoomThumbnailCapture, useScreenshotExport } from "./three-d/useCanvasCapture";
import { useCanvasFraming } from "./three-d/useCanvasFraming";
import { useThreeDKeyboardShortcuts } from "./three-d/useThreeDKeyboardShortcuts";
import { useAddRoomNavigation } from "./three-d/useAddRoomNavigation";
import { PhaseStageNav } from "./three-d/PhaseStageNav";
import { ToolsDrawerPanel } from "./three-d/ToolsDrawerPanel";
import { DesignPanelDock } from "./three-d/DesignPanelDock";
import { ThreeDOverlaySheets } from "./three-d/ThreeDOverlaySheets";
import { ThreeDCanvasScene } from "./three-d/ThreeDCanvasScene";
export { RoomScene, SceneLighting, BrandedSky, PlacedLights };

/**
 * The 3D studio page: renovation-phase navigation, the toolbar drawer, the
 * live 3D viewport (R3F canvas + surface radial menu + contextual sheets),
 * and the design panel dock. Most of the page's actual R3F rendering code,
 * pure helpers, and self-contained interaction logic live in ./three-d/*,
 * split out for file-size and cohesion — every file there that says "Split
 * out of ThreeDPage.tsx" is referring to this comment. Notably:
 *   - constants.ts, helpers.ts        — shared types/constants, pure math
 *   - openingGeometry.ts, useOpeningCreation.ts — window/door placement math
 *   - useExclusiveSelection.ts        — mutually-exclusive object selection
 *   - useSurfaceRadialMenu.ts, radialMenuItems.ts — the "aylana" context menu
 *   - useCanvasFraming.ts             — camera framing / canvas aspect
 *   - useCanvasCapture.ts             — screenshot + thumbnail capture
 *   - useThreeDKeyboardShortcuts.ts   — desktop keyboard shortcuts
 *   - useAddRoomNavigation.ts         — "+ add room" wizard hand-off
 *   - ViewModeSegment.tsx, PhaseStageNav.tsx, ToolsDrawerPanel.tsx,
 *     DesignPanelDock.tsx, ThreeDOverlaySheets.tsx — page chrome components
 *   - ThreeDCanvasScene.tsx (plus RoomShell.tsx, SceneEnvironment.tsx,
 *     CameraControls.tsx, LightingComponents.tsx, ElectricalComponents.tsx,
 *     SiblingRoomLayout.tsx, WallComponents.tsx, FloorCeiling.tsx,
 *     RoomScanOverlay.tsx) — the R3F scene tree itself
 * This file stays the single default-exported page component — plus the
 * legacy named re-exports below, which PlacementPage/WalkthroughPage/
 * SharedRoomPage still import from this exact path — so it must keep
 * living at pages/studio/ThreeDPage.tsx.
 */

// Explicit (default-on since three r152, but pinned here so a future three
// upgrade can't silently regress the color pipeline)
THREE.ColorManagement.enabled = true;

export interface StudioContext {
  room: Room;
  onSave: () => Promise<void>;
  /** DOM node (rendered by StudioPage's header) this page portals its own
   *  collapsed menu-trigger buttons into, so they land in the header's one
   *  row instead of stacking as separate rows below it. Null until the
   *  header has mounted the slot. */
  toolbarSlot?: HTMLDivElement | null;
  /** Header height, reused as this page's own TopDrawers' topOffset so they
   *  open flush below the (now shared) header row. */
  toolbarSlotTop?: number;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export type { PhaseKey } from "@/lib/phases"

export default function ThreeDPage() {
  const { room, onSave, toolbarSlot, toolbarSlotTop } = useOutletContext<StudioContext>();
  const geometry = useRoomStore((s) => s.geometry);
  const designState = useRoomStore((s) => s.designState);
  const highQuality3d = useRoomStore((s) => s.highQuality3d);
  const resetRoom = useRoomStore((s) => s.resetRoom);
  const placeFurniture = useRoomStore((s) => s.placeFurniture);
  const addElement = useRoomStore((s) => s.addElement);
  const updateElement = useRoomStore((s) => s.updateElement);
  const removeElement = useRoomStore((s) => s.removeElement);
  const navigate = useNavigate();

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

  // Same orientation the scene uses: X is wall A, Z is wall B
  const { W, D } = roomExtents(geometry, { W: room.length, D: room.width });
  const H = room.ceiling_height > 0 ? room.ceiling_height : 2.7;

  const { addingRoom, handleAddRoom } = useAddRoomNavigation({ room, onSave, resetRoom, navigate, W, D });

  // The top-down "Yuqori" preset was removed from this page — the 3D framing
  // is the only view now, so `preset` never changes. Kept as ViewPreset state
  // (not a narrowed literal) so the topView plumbing below stays type-correct.
  const [preset] = useState<ViewPreset>('back');
  // One-time cleanup of the legacy add-room entry-view stash so a stale 'top'
  // written by an older session can't linger in sessionStorage.
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
  // LiDAR scan reference layer (GLB overlay + object ghost boxes). OFF by
  // default — it is a pure reference aid, never part of the default view.
  const [showScan, setShowScan] = useState(false);
  // Ghost indices already swapped for a real catalog model — hidden from then on.
  const [replacedGhosts, setReplacedGhosts] = useState<Set<number>>(() => new Set());
  // The scanned-object ghost currently being replaced from the catalog, if any.
  const [scanSwap, setScanSwap] = useState<ScanSwapRequest | null>(null);
  const hasScan = !!room.room_scan;
  // 0 = full quality; 1 = safe-mode retry after a WebGL context failure
  const [glAttempt, setGlAttempt] = useState(0);

  // Project-card thumbnail: grabbed from the live canvas when the user
  // leaves this room's 3D view, so the pixels shown are what they last saw.
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  useRoomThumbnailCapture(glCanvasRef, room.id);
  // Manual "Skrinshot" export — same glCanvasRef/preserveDrawingBuffer setup
  // as the thumbnail capture above, but PNG (lossless) and downloaded to the
  // user's device rather than uploaded. Purely client-side: no server call,
  // no shareable link — just the smallest useful export.
  const { screenshotStatus, handleScreenshot } = useScreenshotExport(glCanvasRef, room.name);

  const {
    selectedFurId, setSelectedFurId, selectedFurIdRef,
    selectedPart, setSelectedPart, selectedPartRef,
    selectedDoorId, setSelectedDoorId,
    selectedLightId,
    selOpening, setSelOpening,
    selectFurniture, selectFurniturePart, selectDoor, selectLight, selectOpening,
    clearAll: clearAllSelections,
  } = useExclusiveSelection();
  // The door/window editor panel (DoorLeaves.tsx) is a floating <Html> overlay
  // whose visibility is driven by selectedDoorId. onPointerMissed on the
  // <Canvas> below only clears it for clicks that land inside the canvas and
  // hit no mesh — a click anywhere else on the page (another tab, the
  // sidebar, the toolbar) never reaches it, leaving the panel stuck open. This
  // closes it on any genuine outside click while it's open, without
  // interfering with clicks inside the canvas (left to the existing
  // onPointerMissed/mesh-select handling) or inside the panel itself.
  useEffect(() => {
    if (selectedDoorId === null) return;
    const onPointerDownCapture = (ev: PointerEvent) => {
      const target = ev.target as Node | null;
      if (!target) return;
      const canvas = glCanvasRef.current;
      if (canvas && (target === canvas || canvas.contains(target))) return;
      if (target instanceof Element && target.closest('[data-opening-editor-panel]')) return;
      setSelectedDoorId(null);
    };
    document.addEventListener('pointerdown', onPointerDownCapture, { capture: true });
    return () => {
      document.removeEventListener('pointerdown', onPointerDownCapture, { capture: true });
    };
  }, [selectedDoorId, setSelectedDoorId]);
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
  // Mebelirovka shows ONE viewport at a time: '3d' (default on entry) is the
  // live 3D scene, '2d' swaps it for the full-width top-view plan editor. The
  // 3D canvas stays mounted (just CSS-hidden) while in '2d', so toggling back
  // is instant and keeps the camera/scene state; the canvas-aspect
  // ResizeObserver in useCanvasFraming already ignores the zero-size updates
  // a hidden box produces. Other tabs are untouched by this flag.
  const [mebelView, setMebelView] = useState<'2d' | '3d'>('3d');
  // Chiroqlar gets the same one-viewport-at-a-time treatment: '3d' (default)
  // is the live scene, '2d' swaps it for the full-width reflected ceiling
  // plan. Same mount-and-hide trick as mebelView above.
  const [chiroqView, setChiroqView] = useState<'2d' | '3d'>('3d');
  // Optional starting phase from the URL (?phase=…). The mobile wall-condition
  // step sets it so the studio opens on the first renovation stage that still
  // needs doing (an already-plastered wall skips Suvoq, a puttied wall skips
  // Suvoq + Shpaklovka). Earlier stages then render as done via the existing
  // positional check-mark logic. The wizard's post-creation hand-off passes
  // ?phase=suvoq so a brand-new room opens at the START of the phase flow
  // (its walls are still bare brick — nothing has been done to them yet).
  // Falls back to the historical 'boyoq' default, which now only applies to
  // REOPENING a room (projects list, tab switches, direct links).
  const phaseParam = new URLSearchParams(location.search).get('phase')
  const initialPhase: PhaseKey = isMebelTab
    ? 'mebel'
    : isChiroqTab
      ? 'chiroq'
      : RENO_STAGES.some((s) => s.key === phaseParam)
        ? (phaseParam as PhaseKey)
        : 'boyoq'
  const [activePhase, setActivePhase] = useState<PhaseKey>(initialPhase)
  // The mobile stage picker and the toolbar are each collapsed into a single
  // round TopDrawerButton, portaled into StudioPage's header row so both sit
  // in one row alongside the section-switcher button instead of stacking as
  // separate rows. topOffset for both drawers comes straight from the
  // header's own measured height (toolbarSlotTop), since that's now the only
  // fixed chrome either one opens beneath.
  const [stageDrawerOpen, setStageDrawerOpen] = useState(false);
  const [toolsDrawerOpen, setToolsDrawerOpen] = useState(false);
  // Mebelirovka: door/window editor sheet (reuses the room settings sheet)
  const [elementsSheetOpen, setElementsSheetOpen] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  // Wall tap → "Oyna" (radial menu) opens the same type/size/color chooser
  // RoomSettingsSheet's "+ Deraza" already uses, instead of dropping a
  // default-sized window immediately — holds where the wall was tapped so
  // the final window (whatever size gets picked) still centres on that spot.
  const [pendingWindowSpot, setPendingWindowSpot] = useState<{
    wallId: string; point: { x: number; y: number; z: number }; initialSillHeight: number;
  } | null>(null);
  const [showAiSheet, setShowAiSheet] = useState(false);
  const [selectedWall, setSelectedWall] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  // Desktop-only edge-collapse toggles for the phase-stepper rail and design
  // panel — separate from showPanel above, which drives the mobile bottom
  // sheet. Both default open; tablet/mobile keep their own drawer pattern
  // untouched (the toggle buttons themselves are hidden below lg).
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // ── Surface radial menu (tap/press "aylana" on a wall/ceiling/floor) ──
  // A fast path alongside the phase-stepper rail (SHOW_PHASE_STEPPER), not a
  // replacement for it: tapping a surface opens a ring of context icons at
  // the press point for quick edits without leaving the current phase.
  const { radial, holdBind, closeRadial } = useSurfaceRadialMenu(controlsRef);

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

  const addSheetSection: 'wallpaper' | 'lyustra' | 'furniture' =
    activePhase === 'boyoq' ? 'wallpaper' : activePhase === 'montaj' ? 'lyustra' : 'furniture';

  const { wallGeom, computeOpeningRect, createOpening } = useOpeningCreation({
    W, D, H, addElement, setPendingWindowSpot, setSelectedWall,
  });

  // Live aspect ratio of the 3D canvas, the camera framing it drives, and the
  // resulting orbit-distance limits — see useCanvasFraming for the full story.
  const { canvasBoxRef, cam, initCam, interiorMaxDist, topMinDist, maxPolarAngle } = useCanvasFraming({
    preset, cutaway, W, D, H, roomId: room.id, setPresetVersion,
  });

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

  // Keyboard shortcuts — desktop power-user navigation
  useThreeDKeyboardShortcuts({
    setToolMode, setCutaway, setSceneLightOn, setLightsOn, setPresetVersion,
    selectedFurIdRef, selectedPartRef, setSelectedPart, setSelectedFurId, setSelectedWall, setShowHelp,
  });

  // Leaving part mode (or switching rooms) drops any live part selection
  useEffect(() => {
    if (toolMode !== 'part') setSelectedPart(null);
  }, [toolMode, setSelectedPart]);
  useEffect(() => { setSelectedPart(null); }, [room.id, setSelectedPart]);

  const activeIdx = RENO_STAGES.findIndex(s => s.key === activePhase);

  // Kept visible: the studio's responsive layout (collapsible edge rail,
  // bottom-sheet panel on tablet/mobile) is built around this stepper being
  // the primary phase-navigation surface. The long-press radial menu on
  // walls/ceiling/floor is an additional, faster path for surface edits —
  // not a replacement for the stepper.
  const SHOW_PHASE_STEPPER = true;

  return (
    <div className="flex flex-col lg:flex-row h-full">

      {SHOW_PHASE_STEPPER && (
        <PhaseStageNav
          toolbarSlot={toolbarSlot}
          toolbarSlotTop={toolbarSlotTop}
          stageDrawerOpen={stageDrawerOpen}
          setStageDrawerOpen={setStageDrawerOpen}
          leftOpen={leftOpen}
          setLeftOpen={setLeftOpen}
          activeIdx={activeIdx}
          setActivePhase={setActivePhase}
        />
      )}

      {/* ── Center: toolbar + canvas ─────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Toolbar — current phase, then view preset, transform tools, view
            controls, lighting, AI, each cluster separated by a divider. This
            is the studio's only toolbar row now that the header absorbed the
            old separate tab-nav row (see StudioPage.tsx). */}
        <ToolsDrawerPanel
          toolbarSlot={toolbarSlot}
          toolbarSlotTop={toolbarSlotTop}
          toolsDrawerOpen={toolsDrawerOpen}
          setToolsDrawerOpen={setToolsDrawerOpen}
          activeIdx={activeIdx}
          toolMode={toolMode}
          setToolMode={setToolMode}
          selectedFurId={selectedFurId}
          furniture={furniture}
          angleInputDeg={angleInputDeg}
          setAngleInputDeg={setAngleInputDeg}
          moveFurniture={moveFurniture}
          canUndo={canUndo}
          canRedo={canRedo}
          setShowHelp={setShowHelp}
          setPresetVersion={setPresetVersion}
          screenshotStatus={screenshotStatus}
          handleScreenshot={handleScreenshot}
          hasScan={hasScan}
          showScan={showScan}
          setShowScan={setShowScan}
          sceneLightOn={sceneLightOn}
          setSceneLightOn={setSceneLightOn}
          lightsOn={lightsOn}
          setLightsOn={setLightsOn}
          sunHour={sunHour}
          setSunHour={setSunHour}
          setShowAiSheet={setShowAiSheet}
          setShowPanel={setShowPanel}
        />

        {/* Canvas area. relative: anchors the Mebelirovka top-right control
            row below, which must survive the 2D/3D viewport swap (the 3D box
            is display:none in 2D mode, so anything pinned inside it would
            vanish — and the switch itself has to stay put so its knob can
            animate across the swap). */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row relative">
        {/* Stories-style tab navigation — owns this viewport's top row
            (arrows at the corners, current tab name centered), which is why
            the corner control clusters below all start at top-16 instead of
            top-3: the strip keeps one consistent click spot on every tab. */}
        <StudioTabStrip roomId={room.id} />
        {/* Mebelirovka: one viewport at a time. The 2D/3D pill switch swaps
            the full-width top-view plan editor ('2d') for the live 3D
            viewport ('3d', the default). In 3D mode the row wrapper spans
            exactly the 3D box, so this top-right row lands in the same corner
            the view-mode pill occupies on other tabs; the Tashqi
            segment renders here (to the switch's left) only in 3D mode —
            cutaway modes are meaningless on the flat plan. z-20 matches the
            other corner controls: above the canvas and z-10 clusters, below
            the drop overlay (z-40). */}
        {(isMebelTab || isChiroqTab) && (
          <div className="absolute top-16 right-3 z-20 flex items-center gap-2">
            <PlanViewToggle
              view={isMebelTab ? mebelView : chiroqView}
              onToggle={() =>
                isMebelTab
                  ? setMebelView((v) => (v === '3d' ? '2d' : '3d'))
                  : setChiroqView((v) => (v === '3d' ? '2d' : '3d'))
              }
            />
            {(isMebelTab ? mebelView : chiroqView) === '3d' && (
              <ViewModeSegment cutaway={cutaway} setCutaway={setCutaway} />
            )}
          </div>
        )}
        {/* Mebelirovka 2D mode: the top-view plan editor takes the whole slot */}
        {isMebelTab && mebelView === '2d' && (
          <div className="flex-1 min-w-0 min-h-0 bg-[#F6F4EF]">
            <MebelPlanView />
          </div>
        )}
        {/* Chiroqlar 2D mode: the reflected ceiling plan takes the whole slot
            (was a permanent side-by-side split; now toggled like Mebelirovka) */}
        {isChiroqTab && chiroqView === '2d' && (
          <div className="flex-1 min-w-0 min-h-0 bg-[#F6F4EF]">
            <ChiroqPlanView
              armedType={armedLightType}
              onPlaced={() => setArmedLightType(null)}
              selectedId={selectedLightId}
              onSelect={selectLight}
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
        <div
          ref={canvasBoxRef}
          // Mebelirovka 2D mode hides (but keeps mounted) the whole 3D box so
          // toggling back to 3D is instant and loses no scene state.
          className={`flex-1 min-w-0 min-h-0 relative overflow-hidden ${(isMebelTab && mebelView === '2d') || (isChiroqTab && chiroqView === '2d') ? 'hidden' : ''}`}
          {...viewportDropProps}
        >

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
            <p className="absolute top-16 left-1/2 -translate-x-1/2 z-40 max-w-[80%] bg-amber-50 border border-amber-200 text-amber-700 text-[11px] px-3 py-1.5 rounded-lg shadow">
              {modelDropWarn}
            </p>
          )}

          {/* View mode — relocated here from the tools drawer's old
              "Ko'rinish" chips + cutaway button. One segmented control pinned
              to the viewport's top-right corner, exposing the same three-state
              CutawayMode machine the old cycling button did: 3D = normal
              interior view ('off'), Tashqi = auto cutaway ('auto' — walls
              facing the camera hide). The K key still toggles the two
              states. z-20: above
              the canvas and the z-10 button clusters, below the drop overlay
              (z-40) and the mobile panel/backdrop tier (z-40/50).
              On the Mebelirovka tab the segment instead renders in the
              slot-level top-right control row (next to the 2D/3D switch), so
              it is skipped here. */}
          {!isMebelTab && !isChiroqTab && (
            <div className="absolute top-16 right-3 z-20">
              <ViewModeSegment cutaway={cutaway} setCutaway={setCutaway} />
            </div>
          )}

          {/* Navigation help card — top-32 keeps it clear of the view-mode
              segmented control pinned at top-16 in the same corner (which in
              turn sits below the tab strip's top row). */}
          {showHelp && (
            <div className="absolute top-32 right-3 z-30 w-72 max-w-[90%] bg-white/97 backdrop-blur rounded-2xl shadow-xl border border-gray-200 p-4 text-[12px] leading-5 text-gray-700">
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
                <li><b>K</b> — Ichki / Tashqi</li>
                <li><b>N</b> — Kun/Tun &nbsp; <b>L</b> — Chiroqlar</li>
                <li><b>F</b> — Markazlash &nbsp; <b>Del</b> — O'chirish</li>
                <li><b>Esc</b> — bekor qilish</li>
              </ul>
            </div>
          )}

          {/* Mebelirovka quick actions — doors/windows editor + 3D model import */}
          {isMebelTab && (
            // top-28 below sm: the 2D/3D + view-mode row (also at
            // top-16, right-anchored) spans nearly the whole width on phones
            // and would run over these pills; from sm up both tiers fit.
            <div className="absolute top-28 sm:top-16 left-3 z-10 flex flex-col gap-2">
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

          <ThreeDCanvasScene
            glAttempt={glAttempt}
            setGlAttempt={setGlAttempt}
            initCam={initCam}
            dpr={dpr}
            glCanvasRef={glCanvasRef}
            onPointerMissed={clearAllSelections}
            topView={topView}
            sceneLightOn={sceneLightOn}
            sun={sun}
            W={W}
            D={D}
            H={H}
            highQuality3d={highQuality3d}
            room={room}
            geometry={geometry}
            designState={designState}
            showContactShadows={showContactShadows}
            useComposer={useComposer}
            lightsOn={lightsOn}
            cutaway={cutaway}
            selectedWall={selectedWall}
            focusSurface={focusSurface}
            holdBind={holdBind}
            selOpening={selOpening}
            selectOpening={selectOpening}
            updateElement={updateElement}
            removeElement={removeElement}
            controlsRef={controlsRef}
            addingRoom={addingRoom}
            handleAddRoom={handleAddRoom}
            aptRooms={aptRooms}
            activeLayoutPos={activeLayoutPos}
            onSave={onSave}
            navigate={navigate}
            handleDeleteSibling={handleDeleteSibling}
            toolMode={toolMode}
            selectedFurId={selectedFurId}
            selectFurniture={selectFurniture}
            selectedPart={selectedPart}
            selectFurniturePart={selectFurniturePart}
            showScan={showScan}
            replacedGhosts={replacedGhosts}
            setScanSwap={setScanSwap}
            selectedDoorId={selectedDoorId}
            selectDoor={selectDoor}
            selectedLightId={selectedLightId}
            selectLight={selectLight}
            cam={cam}
            presetVersion={presetVersion}
            setPresetVersion={setPresetVersion}
            interiorMaxDist={interiorMaxDist}
            topMinDist={topMinDist}
            maxPolarAngle={maxPolarAngle}
            setDpr={setDpr}
            setDeclineCount={setDeclineCount}
          />
        </div>
        </div>
      </div>

      {/* ── Right: contextual design panel ───────────────────────── */}
      <DesignPanelDock
        showPanel={showPanel}
        setShowPanel={setShowPanel}
        rightOpen={rightOpen}
        setRightOpen={setRightOpen}
        room={room}
        activePhase={activePhase}
        selectedWall={selectedWall}
        setSelectedWall={setSelectedWall}
        selectedLightId={selectedLightId}
        selectLight={selectLight}
        armedLightType={armedLightType}
        setArmedLightType={setArmedLightType}
        planMode={isChiroqTab && chiroqView === '2d'}
      />

      <ThreeDOverlaySheets
        showAddSheet={showAddSheet}
        setShowAddSheet={setShowAddSheet}
        addSheetSection={addSheetSection}
        scanSwap={scanSwap}
        setScanSwap={setScanSwap}
        setReplacedGhosts={setReplacedGhosts}
        elementsSheetOpen={elementsSheetOpen}
        setElementsSheetOpen={setElementsSheetOpen}
        pendingWindowSpot={pendingWindowSpot}
        setPendingWindowSpot={setPendingWindowSpot}
        wallGeom={wallGeom}
        computeOpeningRect={computeOpeningRect}
        addElement={addElement}
        setSelectedWall={setSelectedWall}
        showAiSheet={showAiSheet}
        setShowAiSheet={setShowAiSheet}
        roomId={room.id}
        radial={radial}
        radialItems={(r) => buildRadialItems(r, {
          setSelectedWall, setActivePhase, setShowPanel, createOpening, setShowAddSheet,
        })}
        closeRadial={closeRadial}
      />
    </div>
  );
}
