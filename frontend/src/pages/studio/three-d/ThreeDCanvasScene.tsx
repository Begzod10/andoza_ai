import { Suspense, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  PerformanceMonitor,
  AdaptiveDpr,
  AdaptiveEvents,
  Grid,
} from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
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
import { SafeEnvironment } from "@/components/studio/SafeEnvironment";
import { DEFAULT_HDRI } from "@/lib/hdri";
import { skyFogColor } from "@/lib/skyEnvironment";
import { computeOccupiedSides } from "./helpers";
import { RoomScanReference, type ScanSwapRequest } from "./RoomScanOverlay";
import { DraggableLightModels } from "./LightingComponents";
import { DraggableElectricalModels } from "./ElectricalComponents";
import { AddRoomButtons, SiblingRooms, OpeningLayer } from "./SiblingRoomLayout";
import { RealismEffects, SceneLighting } from "./SceneEnvironment";
import { DoubleClickFocus, KeepAutoClear, DevSceneHandle, CameraAnimator } from "./CameraControls";
import { SwapButtons, RoomScene } from "./RoomShell";
import type { RoomSide } from "./constants";
import { applyUniformZoom } from "@/lib/orbitZoom";

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
  selectedWall, focusSurface, holdBind,
  selOpening, selectOpening, updateElement, removeElement,
  controlsRef,
  addingRoom, handleAddRoom, aptRooms, activeLayoutPos,
  onSave, navigate, handleDeleteSibling,
  toolMode, selectedFurId, selectFurniture, selectedPart, selectFurniturePart,
  showScan, replacedGhosts, setScanSwap,
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
  holdBind: (surface: RadialSurface, wallId?: string) => Record<string, unknown>;
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

        {/* No phase-forced wall material: entering Suvoq used to force
            the photo-real plaster PBR onto every wall (plasterWalls was
            `activePhase === 'suvoq'`, from the era when the Suvoq panel
            was a passive info card and the default covering was bare
            plaster anyway). New rooms now start with the brick baseline,
            which must stay visible through every phase until the user
            actually clicks a texture/color — so each wall simply renders
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
          onSelect={selectOpening}
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
        <DraggableElectricalModels controlsRef={controlsRef} W={W} D={D} />
        <OpeningLayer
          geometry={geometry}
          W={W}
          D={D}
          cutaway={topView ? 'off' : cutaway}
          toolMode={toolMode}
          controlsRef={controlsRef}
          selectedId={selectedDoorId}
          onSelect={selectDoor}
        />
        <DraggableLightModels controlsRef={controlsRef} roomW={W} roomD={D} roomH={H} toolMode={toolMode} lightsOn={lightsOn} highQuality={highQuality3d} selectedId={selectedLightId} onSelect={selectLight} />

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
          // One orbit range everywhere: close enough to inspect a skirting
          // joint, far enough to pull right outside the room. Nothing has to
          // hide for that — the walls are single-sided planes and the shadow
          // shell writes no colour, so from outside you simply look in.
          minDistance={topView ? topMinDist : 0.25}
          maxDistance={topView ? Math.max(W, D) * 4 : Math.max(W, D) * 4 + 6}
          maxPolarAngle={topView ? Math.PI * 0.3 : maxPolarAngle}
          minPolarAngle={topView ? 0 : 0.08}
          rotateSpeed={topView ? 0.6 : 0.45}
          // Both drag axes run opposite to OrbitControls' default
          // grab-and-turn, as the user asked: dragging right sends the
          // room left, dragging down tilts the view the other way too.
          // reverseOrbit is the both-axes flag (there are separate
          // reverseHorizontalOrbit / reverseVerticalOrbit flags if these
          // ever need to diverge again).
          reverseOrbit
          // zoomSpeed is NOT passed as a prop on purpose: it is retuned from
          // the live distance on every change (see applyUniformZoom), and a
          // prop would overwrite that on the next React render.
          onChange={(e) => applyUniformZoom(
            (e?.target ?? controlsRef.current) as unknown as { getDistance(): number; zoomSpeed: number },
            Math.max(W, D),
          )}
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
  );
}
