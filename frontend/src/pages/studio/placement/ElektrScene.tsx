import { Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { SafeEnvironment } from '@/components/studio/SafeEnvironment'
import { DoorLeaves, WindowSashes } from '@/components/studio/DoorLeaves'
import type { PlacedElectrical, RoomGeometry, DesignState } from '@/store/roomStore'
import { isAbcdRoom, planPolygon } from '@/lib/planPolygon'
import { roomExtents } from '@/lib/roomDims'
import { DEFAULT_HDRI } from '@/lib/hdri'
import type { Room } from '@/lib/api'
import { RoomScene, PlacedLights, FurnitureModels, SceneLighting } from '../ThreeDPage'
import { StaticElectrical3D, WireLine3D } from './Electrical3D'
import type { WireConfig } from './types'

// ─── 3D Elektr view ───────────────────────────────────────────────────────────

function ElektrScene({ room, geometry, designState, electricals, wireConfigs }: {
  room: Room
  geometry: RoomGeometry
  designState: DesignState
  electricals: PlacedElectrical[]
  wireConfigs: Record<string, WireConfig>
}) {
  // X follows wall A, Z follows wall B — the orientation every view shares
  const { W, D } = roomExtents(geometry, { W: room.length, D: room.width })
  const H = room.ceiling_height > 0 ? room.ceiling_height : 2.7
  const panel = electricals.find(e => e.type === 'panel')
  const poly = useMemo(() => (isAbcdRoom(geometry) ? null : planPolygon(geometry)), [geometry])

  // Wire channel height: 0.22m above the tallest door/window top, minimum 2.25m, max ceiling-10cm
  const maxOpeningTopM = geometry.walls.reduce((acc, wall) =>
    wall.elements.reduce((wAcc, el) => Math.max(wAcc, (el.sill_height ?? 0) + el.height) / 1000, acc)
  , 0)
  const wireChannelH = Math.min(H - 0.1, Math.max(maxOpeningTopM + 0.22, 2.25))

  return (
    <>
      {/* The same key/fill/sun rig the other 3D views use. Without it this
          preview had only the environment map to go on, which is why its
          ceiling read black while the very same room looked lit elsewhere. */}
      <SceneLighting width={W} depth={D} height={H} highQuality={false} />
      <RoomScene
        room={room}
        geometry={geometry}
        topView={false}
        designState={designState}
        showContactShadows={false}
        composerActive={false}
        highQuality={false}
        lightsOn={true}
      />
      {/* The room as the other tabs show it — the joinery, the furniture placed
          in Mebelirovka and the fixtures placed in Chiroqlar. A socket only
          makes sense next to the thing it feeds, so all of it has to be here. */}
      <DoorLeaves geometry={geometry} wallWidth={W} wallDepth={D} interactive={false} />
      <WindowSashes geometry={geometry} wallWidth={W} wallDepth={D} interactive={false} />
      <Suspense fallback={null}>
        <FurnitureModels />
      </Suspense>
      <PlacedLights
        roomW={W}
        roomD={D}
        roomH={H}
        lightsOn={true}
        highQuality={false}
      />
      {electricals.map(el => (
        <StaticElectrical3D key={el.id} el={el} W={W} D={D} poly={poly}/>
      ))}
      {panel && electricals.filter(e => e.type !== 'panel').map(el => {
        const cfg = wireConfigs[el.id]
        if (!cfg) return null
        return <WireLine3D key={el.id} el={el} panel={panel} W={W} D={D} wireH={wireChannelH} cw={cfg.cw} color={cfg.color} poly={poly}/>
      })}
      <SafeEnvironment files={DEFAULT_HDRI} intensity={0.35} background/>
    </>
  )
}

export function ElektrThreeDView({ room, geometry, designState, electricals, wireConfigs }: {
  room: Room
  geometry: RoomGeometry
  designState: DesignState
  electricals: PlacedElectrical[]
  wireConfigs: Record<string, WireConfig>
}) {
  // X follows wall A, Z follows wall B — the orientation every view shares
  const { W, D } = roomExtents(geometry, { W: room.length, D: room.width })
  const H = room.ceiling_height > 0 ? room.ceiling_height : 2.7
  const initPos: [number, number, number] = [-W * 0.3, H * 0.55, D * 0.35]
  const initTarget: [number, number, number] = [0, H * 0.4, 0]

  return (
    <div className="relative w-full h-full">
      <Canvas
        camera={{ position: initPos, fov: 65, near: 0.05, far: 100 }}
        shadows
        gl={{ powerPreference: 'default', antialias: false }}
        frameloop="demand"
      >
        <Suspense fallback={null}>
          <ElektrScene
            room={room} geometry={geometry} designState={designState}
            electricals={electricals} wireConfigs={wireConfigs}
          />
          <OrbitControls
            target={initTarget}
            enableDamping dampingFactor={0.06}
            rotateSpeed={0.45} zoomSpeed={0.8}
            // Both drag axes reversed, matching the main 3D view: dragging
            // right sends the room left, dragging down tilts the other way.
            reverseOrbit
            minDistance={0.25}
            maxDistance={Math.max(W, D) * 4}
          />
        </Suspense>
      </Canvas>
      {/* bottom-left (was top-left) — the stories tab strip's centered title
          pill now floats along the top edge of the plan+3D area. */}
      <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/40 rounded text-white text-[10px] font-medium pointer-events-none select-none">
        3D Ko'rinish
      </div>
    </div>
  )
}
