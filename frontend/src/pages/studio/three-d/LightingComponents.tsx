import { useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject, type RefObject } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { useRoomStore } from "@/store/roomStore";
import type { PlacedLight } from "@/store/roomStore";
import type { ToolMode } from "@/features/studio/StudioFurniture";
import { lightType, kelvinToHex, lumensToIntensity, type LightType } from "@/lib/lightCatalog";
import { LightFixture, fixturePose } from "@/components/studio/LightFixtures";
import { computeDiskLightPositions } from "./helpers";

/**
 * Ceiling lighting: the auto-placed disk grid, the pooled real-light
 * emitters shared by every view, and the draggable user-placed fixtures used
 * by the editor. Split out of ThreeDPage.tsx — see that file's header
 * comment for the full picture.
 */

function CeilingLightDisk({ x, z, height, emit = true }: {
  x: number; z: number; height: number; emit?: boolean
}) {
  return (
    <group>
      <mesh position={[x, height - 0.009, z]}>
        <cylinderGeometry args={[0.068, 0.062, 0.018, 24]} />
        <meshStandardMaterial color="#BFBBB0" metalness={0.65} roughness={0.28} />
      </mesh>
      <mesh position={[x, height - 0.002, z]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.05, 24]} />
        <meshStandardMaterial
          color={emit ? "#F0F8FF" : "#707070"}
          emissive={emit ? "#C8E8FF" : "#000000"}
          emissiveIntensity={emit ? 1.9 : 0}
          roughness={1}
        />
      </mesh>
    </group>
  );
}


// CeilingLights renders auto-grid ONLY when no user lights are placed.
// User-placed lights are rendered + made draggable by DraggableLightModels (in Canvas).
// Real pointLights are pooled: max 4 on highQuality, max 2 on mobile, evenly spread
// across the fixture grid so total output stays constant regardless of fixture count.
// Fixture disks always react to lightsOn via emissiveIntensity (uniform visual toggle).
export function CeilingLights({
  width, depth, height, lightsOn, highQuality,
}: {
  width: number; depth: number; height: number;
  lightsOn: boolean;
  highQuality: boolean;
}) {
  const userLightsCount = useRoomStore((s) => s.lights.length);
  const autoPositions = useMemo(
    () => computeDiskLightPositions(width, depth),
    [width, depth],
  );

  if (userLightsCount > 0) return null;

  const spread = Math.max(width, depth) * 1.9;
  const nLights = highQuality
    ? Math.min(4, autoPositions.length)
    : Math.min(2, autoPositions.length);
  const perIntensity = 1.6 / Math.max(1, nLights);

  // Pick evenly-spaced positions from the auto-grid for the real pointLights
  const poolPositions: [number, number][] = [];
  if (autoPositions.length > 0 && nLights > 0) {
    const step = autoPositions.length / nLights;
    for (let k = 0; k < nLights; k++) {
      const idx = Math.min(Math.round(k * step), autoPositions.length - 1);
      poolPositions.push(autoPositions[idx]);
    }
  }

  return (
    <group>
      {/* Emissive disks — always rendered, brightness follows lightsOn */}
      {autoPositions.map(([x, z], i) => (
        <CeilingLightDisk key={i} x={x} z={z} height={height} emit={lightsOn} />
      ))}
      {/* Pooled real pointLights — only when on */}
      {lightsOn && poolPositions.map(([x, z], k) => (
        <pointLight
          key={k}
          position={[x, height - 0.06, z]}
          color="#D8EEFF"
          intensity={perIntensity}
          distance={spread}
          decay={2}
        />
      ))}
    </group>
  );
}


// ─── User-placed lights, shared by every view ─────────────────────────────────

/**
 * The real emitters for the user-placed set.
 *
 * Only a few fixtures actually light the room — `nLights` of them, spread
 * evenly through the list — while every fixture still glows. Pooling keeps
 * frame time flat as the count grows, and is invisible otherwise because each
 * pooled light carries its own colour temperature, brightness and beam.
 */
function PooledLightEmitters({
  lights, roomW, roomD, roomH, lightsOn, highQuality,
}: {
  lights: PlacedLight[]
  roomW: number
  roomD: number
  roomH: number
  lightsOn: boolean
  highQuality: boolean
}) {
  if (!lightsOn || lights.length === 0) return null

  const nLights = highQuality ? Math.min(4, lights.length) : Math.min(2, lights.length)
  const perIntensity = 1.4 / Math.max(1, nLights)
  const spread = Math.max(roomW, roomD) * 1.9
  const pooled = nLights > 0
    ? Array.from({ length: nLights }, (_, k) => lights[Math.min(Math.round(k * lights.length / nLights), lights.length - 1)])
    : []

  return (
    <>
      {pooled.filter((l) => !l.off).map((l, k) => {
        const t = lightType(l.type)
        const pose = fixturePose(l, t, roomW, roomD, roomH)
        const color = kelvinToHex(l.colorK ?? t.colorK)
        const intensity = perIntensity * lumensToIntensity(t.lumens, l.brightnessPct ?? 100)
        const beam = l.beamDeg ?? t.beamDeg

        // A beam angle means a cone: aim it down, tilted by the fixture's own
        // tilt so the pool of light lands where the body is pointing.
        if (beam !== undefined) {
          const tilt = l.tiltRad ?? 0
          const yaw = l.rotation ?? 0
          const reach = Math.max(1.5, pose.y)
          return (
            <spotLight
              key={k}
              position={[pose.x, pose.y - 0.05, pose.z]}
              target-position={[
                pose.x + Math.sin(tilt) * Math.sin(yaw) * reach,
                Math.max(0, pose.y - reach),
                pose.z + Math.sin(tilt) * Math.cos(yaw) * reach,
              ]}
              color={color}
              intensity={intensity * 2.2}
              angle={THREE.MathUtils.degToRad(beam) / 2}
              penumbra={0.45}
              distance={spread}
              decay={2}
            />
          )
        }
        return (
          <pointLight
            key={k}
            position={[pose.x, pose.y - 0.06, pose.z]}
            color={color}
            intensity={intensity}
            distance={spread}
            decay={2}
          />
        )
      })}
    </>
  )
}


/**
 * User-placed lights, read-only.
 *
 * The editor gets DraggableLightModels; every other view — the walkthrough,
 * the elektr 3D preview — renders this, so a fixture placed in Chiroqlar is
 * lit and drawn the same way wherever the room is shown. Without it those
 * views fall dark the moment the first fixture is placed, because CeilingLights
 * stands down as soon as the user has placed any.
 */
export function PlacedLights({
  roomW, roomD, roomH, lightsOn, highQuality,
}: {
  roomW: number
  roomD: number
  roomH: number
  lightsOn: boolean
  highQuality: boolean
}) {
  const lights = useRoomStore((s) => s.lights)
  if (lights.length === 0) return null

  return (
    <>
      <PooledLightEmitters
        lights={lights}
        roomW={roomW}
        roomD={roomD}
        roomH={roomH}
        lightsOn={lightsOn}
        highQuality={highQuality}
      />
      {lights.map((l) => {
        const t = lightType(l.type)
        const pose = fixturePose(l, t, roomW, roomD, roomH)
        return (
          <group key={l.id} position={[pose.x, pose.y, pose.z]} rotation={[0, pose.rot, 0]}>
            <LightFixture light={l} on={lightsOn} />
          </group>
        )
      })}
    </>
  )
}


// ─── Draggable ceiling lights (user-placed from elektr menu) ──────────────────

export function DraggableLightModels({
  controlsRef,
  roomW,
  roomD,
  roomH,
  toolMode,
  lightsOn,
  highQuality,
  selectedId,
  onSelect,
}: {
  controlsRef: RefObject<OrbitControlsImpl | null>
  roomW: number
  roomD: number
  roomH: number
  toolMode: ToolMode
  lightsOn: boolean
  highQuality: boolean
  selectedId?: string | null
  onSelect?: (id: string | null) => void
}) {
  const lights = useRoomStore((s) => s.lights)
  const moveLight = useRoomStore((s) => s.moveLight)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const draggingIdRef = useRef<string | null>(null)
  const dragPosRef = useRef(new THREE.Vector2())
  const lightsRef = useRef(lights)
  lightsRef.current = lights
  const { camera, gl } = useThree()
  const ceilingPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), roomH), [roomH])
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const hitPoint = useRef(new THREE.Vector3())

  function startDrag(light: PlacedLight, e: ThreeEvent<PointerEvent>) {
    // An already-selected light is draggable right away, no tool-mode switch
    // needed — only an unselected light in 'select' mode is a plain click.
    if (toolMode === 'select' && light.id !== selectedId) return
    e.stopPropagation()
    dragPosRef.current.set(light.xMm, light.zMm)
    draggingIdRef.current = light.id
    setDraggingId(light.id)
    if (controlsRef.current) controlsRef.current.enabled = false
    document.body.style.cursor = 'grabbing'
  }

  function commitDrag() {
    const id = draggingIdRef.current
    if (!id) return
    moveLight(id, Math.round(dragPosRef.current.x), Math.round(dragPosRef.current.y))
    draggingIdRef.current = null
    setDraggingId(null)
    if (controlsRef.current) controlsRef.current.enabled = true
    document.body.style.cursor = ''
  }

  useEffect(() => {
    if (!draggingId) return
    const canvas = gl.domElement
    const halfW = (roomW / 2) * 1000
    const halfD = (roomD / 2) * 1000

    const handleMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      if (!raycaster.ray.intersectPlane(ceilingPlane, hitPoint.current)) return
      const xMm = Math.max(-halfW, Math.min(halfW, hitPoint.current.x * 1000)) + halfW
      const zMm = Math.max(-halfD, Math.min(halfD, hitPoint.current.z * 1000)) + halfD
      dragPosRef.current.set(xMm, zMm)
    }

    canvas.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', commitDrag)
    return () => {
      canvas.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', commitDrag)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingId, roomW, roomD, roomH])

  if (lights.length === 0) return null
  return (
    <>
      {/* Same emitters every other view gets — see PooledLightEmitters. */}
      <PooledLightEmitters
        lights={lights}
        roomW={roomW}
        roomD={roomD}
        roomH={roomH}
        lightsOn={lightsOn}
        highQuality={highQuality}
      />

      {lights.map((l) => {
        const t = lightType(l.type)
        const pose = fixturePose(l, t, roomW, roomD, roomH)
        const isDragging = draggingId === l.id
        const isSelected = selectedId === l.id
        return (
          <group key={l.id}>
            <group position={[pose.x, pose.y, pose.z]} rotation={[0, pose.rot, 0]}>
              <LightFixture light={l} on={lightsOn} />
              {/* Invisible grab/select handle over the fixture */}
              <mesh
                onPointerDown={(e) => {
                  e.stopPropagation()
                  onSelect?.(l.id)
                  startDrag(l, e)
                }}
                onPointerEnter={() => { document.body.style.cursor = toolMode === 'select' ? 'pointer' : 'grab' }}
                onPointerLeave={() => { if (!isDragging) document.body.style.cursor = '' }}
              >
                <sphereGeometry args={[Math.max(0.14, t.sizeM.w * 0.6), 12, 10]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
              {isSelected && (
                <lineSegments>
                  <edgesGeometry
                    args={[new THREE.BoxGeometry(
                      t.sizeM.w + 0.06,
                      t.sizeM.h + 0.06,
                      t.sizeM.d + 0.06,
                    )]}
                  />
                  <lineBasicMaterial color="#2563EB" />
                </lineSegments>
              )}
            </group>
            {/* Live distance-to-wall labels — shown as soon as the fixture is
                selected, tracking the same drag position the raycast writes
                to (dragPosRef) so they never desync from the drag gesture.
                Rendered as a sibling of the (rotated) fixture group since
                wall distances are along absolute room axes, not the
                fixture's own yaw. */}
            {isSelected && (
              <LightWallDistanceLabels
                light={l}
                lightType={t}
                roomW={roomW}
                roomD={roomD}
                y={pose.y}
                isDragging={isDragging}
                dragPosRef={dragPosRef}
              />
            )}
          </group>
        )
      })}
    </>
  )
}

const wallDimLabelStyle: CSSProperties = {
  background: '#1A2340',
  color: 'white',
  fontSize: 11,
  fontWeight: 700,
  padding: '2px 6px',
  borderRadius: 6,
  whiteSpace: 'nowrap',
}

/**
 * Live "distance to each of the 4 walls" labels for the currently selected
 * ceiling light — visible the instant it's selected, and tracking the same
 * live drag position `startDrag`'s raycast writes to (`dragPosRef`) so the
 * numbers never lag or desync from the fixture's own drag gesture.
 *
 * There's no existing 4-wall dimension helper in this codebase to reuse —
 * WallOpenings.tsx's DimensionLabels and MebelPlanView.tsx's DimRuler are
 * both single-axis/wall-local. This mirrors their visual language (same
 * label style as WallOpenings' DimensionLabels) for a freestanding fixture
 * measured against all 4 walls instead.
 */
function LightWallDistanceLabels({
  light, lightType: t, roomW, roomD, y, isDragging, dragPosRef,
}: {
  light: PlacedLight
  lightType: LightType
  roomW: number
  roomD: number
  y: number
  isDragging: boolean
  dragPosRef: MutableRefObject<THREE.Vector2>
}) {
  // Mirrors dragPosRef's own (xMm, zMm) convention — see startDrag/handleMove.
  const [live, setLive] = useState({ x: light.xMm, z: light.zMm })

  useEffect(() => {
    if (!isDragging) setLive({ x: light.xMm, z: light.zMm })
  }, [isDragging, light.xMm, light.zMm])

  useFrame(() => {
    if (!isDragging) return
    const nx = dragPosRef.current.x
    const nz = dragPosRef.current.y
    setLive((prev) => (prev.x === nx && prev.z === nz ? prev : { x: nx, z: nz }))
  })

  const hw = t.sizeM.w * 500
  const hd = t.sizeM.d * 500
  const roomWmm = roomW * 1000
  const roomDmm = roomD * 1000

  const distLeft = Math.max(0, live.x - hw)
  const distRight = Math.max(0, roomWmm - (live.x + hw))
  const distBack = Math.max(0, live.z - hd)
  const distFront = Math.max(0, roomDmm - (live.z + hd))

  // Same mm→world-metres conversion fixturePose() uses: room-centred, so a
  // fixture at mm (0,0) sits at world (-roomW/2, -roomD/2).
  const toWorldX = (mm: number) => mm / 1000 - roomW / 2
  const toWorldZ = (mm: number) => mm / 1000 - roomD / 2

  const worldX = toWorldX(live.x)
  const worldZ = toWorldZ(live.z)
  const leftMidX = toWorldX((live.x - hw) / 2)
  const rightMidX = toWorldX((live.x + hw + roomWmm) / 2)
  const backMidZ = toWorldZ((live.z - hd) / 2)
  const frontMidZ = toWorldZ((live.z + hd + roomDmm) / 2)

  return (
    <>
      <Html position={[leftMidX, y, worldZ]} center zIndexRange={[210, 0]}>
        <div style={wallDimLabelStyle}>{(distLeft / 1000).toFixed(2)} m</div>
      </Html>
      <Html position={[rightMidX, y, worldZ]} center zIndexRange={[210, 0]}>
        <div style={wallDimLabelStyle}>{(distRight / 1000).toFixed(2)} m</div>
      </Html>
      <Html position={[worldX, y, backMidZ]} center zIndexRange={[210, 0]}>
        <div style={wallDimLabelStyle}>{(distBack / 1000).toFixed(2)} m</div>
      </Html>
      <Html position={[worldX, y, frontMidZ]} center zIndexRange={[210, 0]}>
        <div style={wallDimLabelStyle}>{(distFront / 1000).toFixed(2)} m</div>
      </Html>
    </>
  )
}
