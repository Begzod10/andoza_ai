import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useOutletContext, useNavigate, useLocation } from "react-router-dom";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useRoomStore } from "@/store/roomStore";
import { StudioTabStrip } from "@/components/studio/StudioTabStrip";
import { PlanViewToggle } from "@/components/studio/PlanViewToggle";
import { QuarterArcMenu } from "@/components/studio/QuarterArcMenu";
import { useArcCategories } from "@/features/studio/useArcCategories";
import { getRooms, deleteRoom, listCatalogFurniture } from "@/lib/api";
import type { Room } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MebelPlanView } from "@/features/studio/MebelPlanView";
import type { ToolMode } from "@/features/studio/StudioFurniture";
export { FurnitureModels } from "@/features/studio/StudioFurniture";
import { type ScanSwapRequest } from "./three-d/RoomScanOverlay";
import { nanoid } from "nanoid";
import { fitDeviceHeightMm } from "@/lib/placement";
import { HoldDeleteButton } from "@/hooks/useHoldToDelete";
import { ELECTRICAL_DIMS } from "./three-d/constants";
import { clearOfOpenings } from "@/lib/electricalClearance";
import { windowSpotKey, restylesExisting, type StyledWindow } from "@/lib/windowSpot";
import type { FloorPatternId } from "@/lib/floorGeometry";
import { listWallpapers, type Wallpaper as WallpaperEntry } from "@/lib/api";
import { resolveTargetWall } from "@/components/studio/design-panel/shared";
import { LIGHT_TYPES } from "@/lib/lightCatalog";
import type { PlacedElectrical } from "@/store/roomStore";
import * as THREE from "three";
import { roomExtents } from "@/lib/roomDims";
import { sunPosition, dayOfYear, siteOf } from "@/lib/sunPosition";
import { ChiroqPlanView } from "@/features/studio/ChiroqPlanView";
import type { LightTypeId } from "@/lib/lightCatalog";
import { RENO_STAGES, type PhaseKey } from "@/lib/phases";
import { type ViewPreset } from "./three-d/constants";
import { computeAbsolutePositions } from "./three-d/helpers";
import { PlacedLights } from "./three-d/LightingComponents";
import { SceneLighting, BrandedSky } from "./three-d/SceneEnvironment";
import { RoomScene } from "./three-d/RoomShell";
import { useExclusiveSelection } from "./three-d/useExclusiveSelection";
import { useSurfaceRadialMenu } from "./three-d/useSurfaceRadialMenu";
import { buildRadialItems } from "./three-d/radialMenuItems";
import { useOpeningCreation } from "./three-d/useOpeningCreation";
import { useRoomThumbnailCapture } from "./three-d/useCanvasCapture";
import { useCanvasFraming } from "./three-d/useCanvasFraming";
import { useThreeDKeyboardShortcuts } from "./three-d/useThreeDKeyboardShortcuts";
import { useAddRoomNavigation } from "./three-d/useAddRoomNavigation";
import { PhaseStageNav } from "./three-d/PhaseStageNav";
import { ModelToolbar } from "./three-d/ModelToolbar";
import { ToolsDrawerPanel } from "./three-d/ToolsDrawerPanel";
import { DesignPanelDock } from "./three-d/DesignPanelDock";
import { ThreeDOverlaySheets } from "./three-d/ThreeDOverlaySheets";
import { RenderSheet } from "@/components/studio/RenderSheet";
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
 *   - PhaseStageNav.tsx, ToolsDrawerPanel.tsx,
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
  /** The middle of the header row, where the tab strip goes. Null until the
   *  header has mounted it — and absent entirely on a page that is not inside
   *  StudioPage's layout, which keeps the strip floating over its viewport. */
  tabSlot?: HTMLDivElement | null;
  /** A node inside the header's ⋮ dropdown, for this page's own menu rows.
   *  Null while the dropdown is closed. */
  menuSlot?: HTMLDivElement | null;
  /** Closes the ⋮ dropdown — for a row that opens a sheet, which would
   *  otherwise sit under the still-open menu. */
  closeMenu?: () => void;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export type { PhaseKey } from "@/lib/phases"

export default function ThreeDPage() {
  const { room, onSave, tabSlot, menuSlot, closeMenu } = useOutletContext<StudioContext>();
  const geometry = useRoomStore((s) => s.geometry);
  const designState = useRoomStore((s) => s.designState);
  const highQuality3d = useRoomStore((s) => s.highQuality3d);
  const resetRoom = useRoomStore((s) => s.resetRoom);
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
  const [lightsOn, setLightsOn] = useState(true);
  const [sceneLightOn, setSceneLightOn] = useState(true);
  // Shared with the walkthrough — see the note on `sunHour` in the store.
  const sunHour = useRoomStore((st) => st.sunHour);
  const setSunHour = useRoomStore((st) => st.setSunHour);
  const today = useMemo(() => dayOfYear(new Date()), []);
  // Site and orientation are the room's own (Qibla section of the ⋮ menu):
  // Tashkent and wall A facing north until the user says otherwise.
  const roomLocation = useRoomStore((st) => st.designState.location);
  const facing = useRoomStore((st) => st.designState.facing);
  const sun = useMemo(() => sunPosition({
    hour: sunHour,
    dayOfYear: today,
    ...siteOf(roomLocation),
    facing,
    peakIntensity: highQuality3d ? 1.3 : 1.0,
  }), [sunHour, today, highQuality3d, roomLocation, facing]);
  const [showHelp, setShowHelp] = useState(false);
  // LiDAR scan reference layer (GLB overlay + object ghost boxes). ON by
  // default when the room actually has scan data, so a user who just
  // finished a LiDAR scan immediately sees their detected furniture instead
  // of landing on what looks like an empty room — previously this required
  // manually finding and toggling "Skan ko'rinishi" with no visible cue
  // anything had been detected.
  //
  // room.room_scan is folded in from an async fetch (StudioPage's apiRoom
  // query) and is still undefined on this component's first render, so a
  // useState lazy initializer here would freeze at false. Sync it in an
  // effect instead, once, the first time scan data actually arrives.
  const [showScan, setShowScan] = useState(false);
  const [showQibla, setShowQibla] = useState(false);
  const hasScan = !!room.room_scan;
  const scanAutoShownRef = useRef(false);
  useEffect(() => {
    if (hasScan && !scanAutoShownRef.current) {
      scanAutoShownRef.current = true;
      setShowScan(true);
    }
  }, [hasScan]);
  // Ghost indices already swapped for a real catalog model — hidden from then on.
  const [replacedGhosts, setReplacedGhosts] = useState<Set<number>>(() => new Set());
  // The scanned-object ghost currently being replaced from the catalog, if any.
  const [scanSwap, setScanSwap] = useState<ScanSwapRequest | null>(null);
  // 0 = full quality; 1 = safe-mode retry after a WebGL context failure
  const [glAttempt, setGlAttempt] = useState(0);

  // Project-card thumbnail: grabbed from the live canvas when the user
  // leaves this room's 3D view, so the pixels shown are what they last saw.
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  useRoomThumbnailCapture(glCanvasRef, room.id);
  // Manual "Skrinshot" export — same glCanvasRef/preserveDrawingBuffer setup
  // as the thumbnail capture above, but PNG (lossless) and downloaded to the

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
  // (its walls are still bare plaster — nothing has been done to them yet).
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
  const [showRender, setShowRender] = useState(false);
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
  const { radial, holdBind, closeRadial, armedOpening, disarmOpening } = useSurfaceRadialMenu(controlsRef);
  // Tapping a wall, the ceiling or the floor drops whatever was selected.
  // onPointerMissed only fires on a tap that hits NOTHING, so a tap on the
  // room itself left a model selected behind the ring — its outline, its tool
  // column and its label all still up, over a menu about the wall.
  const clearOnSurfaceTap = useRef(clearAllSelections);
  clearOnSurfaceTap.current = clearAllSelections;
  useEffect(() => { if (radial) clearOnSurfaceTap.current(); }, [radial]);

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
   * Drop a socket/switch where the wall was tapped.
   *
   * The tap already carries both things the Elektr tab would otherwise make
   * the user supply: which wall, and where along it — `wallGeom.alongM` is the
   * same projection a new window or door uses, so a device lands under the
   * finger rather than at some default spot. The height is the catalogue's,
   * not the tap's: sockets belong at 300mm and switches at 900mm whatever
   * height the wall happened to be touched at.
   */
  function placeElectricalAt(
    wallId: string,
    point: { x: number; y: number; z: number } | undefined,
    type: string,
    heightMmIn: number,
  ) {
    const g = wallGeom(wallId);
    if (!g || !point) return;
    const dims = ELECTRICAL_DIMS[type];
    const widthMm = (dims?.w ?? 0.1) * 1000;
    const margin = widthMm / 2 + 50;
    const lengthMm = g.length * 1000;
    const alongMm = g.alongM(point) * 1000;
    // Tapping a wall through the door or window on it would otherwise mount
    // the device on the leaf; the same rule the drag follows moves it clear.
    const heightMm = fitDeviceHeightMm(heightMmIn, (dims?.h ?? 0.1) * 1000, H * 1000);
    const openings = geometry.walls.find((w) => w.id === wallId)?.elements ?? [];
    const positionMm = lengthMm <= margin * 2
      ? lengthMm / 2
      : clearOfOpenings(
          alongMm,
          { widthMm, bottomMm: heightMm, topMm: heightMm + (dims?.h ?? 0.1) * 1000 },
          openings,
          lengthMm,
          margin,
        );
    useRoomStore.getState().addElectrical({
      id: nanoid(),
      type: type as PlacedElectrical['type'],
      wallId,
      positionMm,
      // Brought down if the room's ceiling is too low for it to hang at its
      // catalogue height — an air conditioner at 2400mm just fits a 2700mm
      // ceiling and would push through anything lower.
      heightMm,
    });
    setActivePhase('montaj');
  }

  /** The window the ring last made, so picking another style changes that one
   *  instead of adding a second window on top of it. */
  const lastStyledWindow = useRef<StyledWindow | null>(null);
  /** The same, for doors. */
  const lastStyledDoor = useRef<StyledWindow | null>(null);

  /** Papers the tapped wall — or every wall, when the tap carried none. */
  function applyWallpaperTo(wallId: string | undefined, url: string) {
    useRoomStore.getState().setWallCovering(resolveTargetWall(wallId ?? null), {
      // The design panel's own default mapping: repeatX is tiles per metre,
      // so 1.0 is a 100 x 100 cm sheet, undistorted.
      kind: 'texture', url, color: '#ffffff',
      repeatX: 1.0, repeatY: 1.0, offsetX: 0, offsetY: 0, rotation: 0,
    });
  }

  /**
   * A window of a chosen style, at the tapped spot, in one go.
   *
   * `createOpening('deraza', ...)` opens NewWindowSheet to ask for width,
   * height, style and colour. Picking the style off the ring answers the
   * question the sheet exists for, so this takes the sheet's own default size
   * and places the window directly; the sheet is still one tap away under
   * "O'lchamli" for a window that has to be exact.
   */
  function createWindowStyled(
    wallId: string,
    point: { x: number; y: number; z: number } | undefined,
    styleId: string,
  ) {
    const g = wallGeom(wallId);
    if (!g || !point) return;

    // The ring stays open, so a second style is the user reconsidering the
    // window they just made, not asking for another one beside it. Same spot,
    // same window: restyle it. A new window means tapping a new spot.
    const spot = windowSpotKey(wallId, point);
    const last = lastStyledWindow.current;
    const wallNow = useRoomStore.getState().geometry.walls.find((w) => w.id === last?.wallId);
    // ...unless it has since been deleted, in which case make a new one.
    if (restylesExisting(last, spot, wallNow?.elements)) {
      updateElement(last.wallId, last.id, { styleId });
      return;
    }

    const { position, sill_height } = computeOpeningRect(g, point, 900, 1200, false);
    addElement(wallId, { type: 'deraza', width: 900, height: 1200, sill_height, position, styleId });
    // addElement mints the id itself, and appends, so the new opening is the
    // last one on that wall.
    const wall = useRoomStore.getState().geometry.walls.find((w) => w.id === wallId);
    const added = wall?.elements?.[wall.elements.length - 1];
    lastStyledWindow.current = added ? { spot, wallId, id: added.id } : null;
    setSelectedWall(wallId);
  }

  /**
   * A door of a chosen style, at the tapped spot, at the standard 900 x 2100.
   *
   * Same rule as the windows: the ring stays open, so a second style is the
   * user reconsidering the door in front of them rather than asking for
   * another one beside it.
   */
  function createDoorStyled(
    wallId: string,
    point: { x: number; y: number; z: number } | undefined,
    styleId: string,
  ) {
    const g = wallGeom(wallId);
    if (!g || !point) return;

    const spot = windowSpotKey(wallId, point);
    const last = lastStyledDoor.current;
    const wallNow = useRoomStore.getState().geometry.walls.find((w) => w.id === last?.wallId);
    if (restylesExisting(last, spot, wallNow?.elements)) {
      updateElement(last.wallId, last.id, { styleId });
      return;
    }

    const { position, sill_height } = computeOpeningRect(g, point, 900, 2100, true);
    addElement(wallId, { type: 'eshik', width: 900, height: 2100, sill_height, position, styleId });
    const wall = useRoomStore.getState().geometry.walls.find((w) => w.id === wallId);
    const added = wall?.elements?.[wall.elements.length - 1];
    lastStyledDoor.current = added ? { spot, wallId, id: added.id } : null;
    setSelectedWall(wallId);
  }

  /**
   * Hang a fixture where the ceiling was tapped.
   *
   * The tap already says where the light goes, which is the one thing the
   * panel would otherwise make the user supply twice — so the point is used
   * directly, clamped inside the room rather than trusted blindly, since a
   * tap near the edge would otherwise hang a chandelier in the wall.
   */
  function placeLightAt(point: { x: number; y: number; z: number } | undefined, type: string) {
    if (!point) return;
    const t = LIGHT_TYPES.find((l) => l.id === type);
    const halfW = (t?.sizeM.w ?? 0.3) / 2;
    const halfD = (t?.sizeM.d ?? 0.3) / 2;
    const clamp = (v: number, half: number, span: number) =>
      Math.min(Math.max(v, -span / 2 + half), span / 2 - half);
    useRoomStore.getState().addLight({
      id: nanoid(),
      type: type as LightTypeId,
      xMm: Math.round((clamp(point.x, halfW, W) + W / 2) * 1000),
      zMm: Math.round((clamp(point.z, halfD, D) + D / 2) * 1000),
      ...(t?.mount === 'wall' ? { wallId: 'A' as const } : {}),
    });
    setActivePhase('chiroq');
  }

  const addSheetSection: 'wallpaper' | 'lyustra' | 'furniture' =
    activePhase === 'boyoq' ? 'wallpaper' : activePhase === 'montaj' ? 'lyustra' : 'furniture';

  /** The corner arc's categories, read from the same sources the design panel
   *  uses. `openPanelAt` is its escape hatch: a category with more items than
   *  the arc holds ends in a button that opens the full panel instead. */
  const openPanelAt = useCallback((phase: 'boyoq' | 'chiroq' | 'mebel') => {
    setActivePhase(phase);
    setShowPanel(true);
  }, [setActivePhase]);
  const arcCategories = useArcCategories({ selectedWall, openPanelAt });

  // The same query key and scope the design panel's Oboy tab uses, so the ring
  // and the panel share one cache entry and an upload in either shows in both.
  const { data: wallpapers = [] } = useQuery<WallpaperEntry[]>({
    queryKey: ['wallpapers', 'oboy'],
    queryFn: () => listWallpapers({ kind: 'oboy' }),
    staleTime: 60_000,
  });

  const { wallGeom, computeOpeningRect, createOpening } = useOpeningCreation({
    W, D, H, geometry, addElement, setPendingWindowSpot, setSelectedWall,
  });

  // Live aspect ratio of the 3D canvas, the camera framing it drives, and the
  // resulting orbit-distance limits — see useCanvasFraming for the full story.
  const { canvasBoxRef, cam, initCam, topMinDist, maxPolarAngle } = useCanvasFraming({
    preset, W, D, H, roomId: room.id, setPresetVersion,
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
    setToolMode, setSceneLightOn, setLightsOn, setPresetVersion,
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
          menuSlot={menuSlot}
          closeMenu={closeMenu}
          hasScan={hasScan}
          showScan={showScan}
          setShowScan={setShowScan}
          showQibla={showQibla}
          setShowQibla={setShowQibla}
          sceneLightOn={sceneLightOn}
          sunHour={sunHour}
          setSunHour={setSunHour}
          setShowAiSheet={setShowAiSheet}
          setShowRender={setShowRender}
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
        {/* In the header row when there is a slot for it, floating over the
            viewport otherwise. Inline there: the overlay variant positions
            itself absolutely, which inside a flex header would sit it over
            the title. */}
        {tabSlot
          ? createPortal(<StudioTabStrip roomId={room.id} variant="inline" />, tabSlot)
          : <StudioTabStrip roomId={room.id} />}
        {/* Mebelirovka: one viewport at a time. The 2D/3D pill switch swaps
            the full-width top-view plan editor ('2d') for the live 3D
            viewport ('3d', the default). z-20 matches the other corner
            controls: above the canvas and z-10 clusters, below the drop
            overlay (z-40). */}
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
        >

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
            </div>
          )}

          {/* The transform tools for whatever model is selected, down the
              left edge. They come with the selection and go with it — see
              ModelToolbar. */}
          <ModelToolbar selectedId={selectedFurId} toolMode={toolMode} setToolMode={setToolMode} />

          {/* The orange "Buyum qo'shish" CTA stood here until the user asked
              for it to go (2026-09-28). The corner arc offers the same things
              and the sheet is still reachable from the design panel. */}

          {/* Bottom-right corner: the arc menu, mobile only — desktop reaches
              all of this from the design panel and the tools drawer, neither
              of which a phone shows without a detour. Sits beside the CTA
              above rather than replacing it: that button adds whatever suits
              the current phase, this one names the three outright. */}
          <div className="lg:hidden">
            <QuarterArcMenu
              className="bottom-5 right-4"
              label="Qo'shish menyusi"
              categories={arcCategories}
            />
          </div>

          <ThreeDCanvasScene
          armedOpeningId={armedOpening?.elId ?? null}
            glAttempt={glAttempt}
            setGlAttempt={setGlAttempt}
            initCam={initCam}
            dpr={dpr}
            glCanvasRef={glCanvasRef}
            onPointerMissed={() => { clearAllSelections(); disarmOpening(); }}
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
            cutaway="off"
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
            showQibla={showQibla}
            replacedGhosts={replacedGhosts}
            setScanSwap={setScanSwap}
            selectedDoorId={selectedDoorId}
            selectDoor={selectDoor}
            selectedLightId={selectedLightId}
            selectLight={selectLight}
            cam={cam}
            presetVersion={presetVersion}
            setPresetVersion={setPresetVersion}
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

      {/* Press-and-hold delete, mounted once outside the canvas: it is ordinary
          DOM, and whichever item was held supplies its own label and action. */}
      <HoldDeleteButton />

      <RenderSheet open={showRender} onOpenChange={setShowRender} glCanvasRef={glCanvasRef} />
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
          setSelectedWall, setActivePhase, setShowPanel, createOpening,
          placeElectrical: placeElectricalAt,
          placeLight: placeLightAt,
          setCornice: (trim) => useRoomStore.getState().setDesignState({ cornice: trim }),
          setSkirting: (trim) => useRoomStore.getState().setDesignState({ skirting: trim }),
          // Settings ride across a switch, as the panel does it: a border
          // width chosen for one profile is still what the room wants.
          setCeilingDesign: (id) => useRoomStore.getState().setDesignState({
            ceiling: { design: id, settings: useRoomStore.getState().designState.ceiling?.settings },
          }),
          wallpapers,
          applyWallpaper: (url) => applyWallpaperTo(r.wallId, url),
          applyWallColor: (hex) =>
            useRoomStore.getState().setWallCovering(resolveTargetWall(r.wallId ?? null), { kind: 'paint', color: hex }),
          createWindowStyled,
          createDoorStyled,
          restyleOpening: (wallId, elId, styleId) => updateElement(wallId, elId, { styleId }),
          setFloorPattern: (floorType, patternId, settings) =>
            useRoomStore.getState().setDesignState({
              floorType,
              floorPattern: { id: patternId as FloorPatternId, settings },
              // The same flag the panel sets: the bare-screed placeholder is
              // only for a floor nobody has chosen yet.
              floorConfigured: true,
            }),
        })}
        closeRadial={closeRadial}
      />
    </div>
  );
}
