import { Suspense, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
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
import { computeOccupiedSides } from "./helpers";
import { QiblaMarker } from "./QiblaMarker";
import { RoomScanReference, type ScanSwapRequest } from "./RoomScanOverlay";
import { DraggableLightModels } from "./LightingComponents";
import { DraggableElectricalModels } from "./ElectricalComponents";
import { AddRoomButtons, SiblingRooms, OpeningLayer } from "./SiblingRoomLayout";
import { RealismEffects, SceneLighting, MoonriseSky, SUN_INTENSITY } from "./SceneEnvironment";
import { MOONRISE_FOG_COLOR, STUDIO_TONE_MAPPING_EXPOSURE } from "@/lib/moonriseSky";
import { skyPinnedSun } from "@/lib/skyPinnedSun";
import { DoubleClickFocus, KeepAutoClear, DevSceneHandle, CameraAnimator } from "./CameraControls";
import { WallsBehindCamera } from "./useWallsBehindCamera";
import { Panorama360 } from "./Panorama360";
import { PanoramaSnap } from "./PanoramaSnap";
import { SwapButtons, RoomScene } from "./RoomShell";
import type { RoomSide } from "./constants";
import { applyUniformZoom } from "@/lib/orbitZoom";

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
  selectedWall, focusSurface, holdBind, panorama, onPanoramaCaptured, armedOpeningId,
  selOpening, selectOpening, updateElement, removeElement,
  controlsRef,
  addingRoom, handleAddRoom, aptRooms, activeLayoutPos,
  onSave, navigate, handleDeleteSibling,
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
  /** The opening a double tap has armed for dragging, if any. */
  armedOpeningId?: string | null;
  selOpening: OpeningSel | null;
  selectOpening: (sel: OpeningSel | null) => void;
  updateElement: (wallId: string, elementId: string, patch: Partial<Omit<WallElement, 'id'>>) => void;
  removeElement: (wallId: string, elementId: string) => void;
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
  addingRoom: boolean;
  handleAddRoom: (side: RoomSide) => void;
  aptRooms: Room[] | undefined;
  activeLayoutPos: { x: number; z: number } | null;
  onSave: () => Promise<void>;
  navigate: (path: string) => void;
  handleDeleteSibling: (id: string, name: string) => Promise<void>;
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
        <RoomScene
          room={room}
          geometry={geometry}
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
          geometry={geometry}
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
            </>
          )}
        </WallsBehindCamera>
        <DraggableLightModels controlsRef={controlsRef} roomW={W} roomD={D} roomH={H} toolMode={toolMode} lightsOn={lightsOn} highQuality={highQuality3d} selectedId={selectedLightId} onSelect={selectLight} />

        <RealismEffects enabled={useComposer} />

        <OrbitControls
          ref={controlsRef}
          makeDefault
          // The 360 camera turns on the spot and has no pivot; an orbit rig
          // reaching for one would fight it for every drag.
          enabled={!panorama}
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
          maxDistance={topView ? Math.max(W, D) * 4 : Math.max(W, D) * 4 + 6}
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
  );
}
