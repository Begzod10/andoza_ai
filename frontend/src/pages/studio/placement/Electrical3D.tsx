import { useMemo } from 'react'
import * as THREE from 'three'
import type { PlacedElectrical } from '@/store/roomStore'
import type { PlanPolygon } from '@/lib/planPolygon'
import { ELEC_DIMS_3D } from './constants'
import { elecPos3D, polyElecPos3D, polyRouteWire3D, routeWire3D } from './geometry'

// ─── 3D Elektr view ───────────────────────────────────────────────────────────

export function StaticElectrical3D({ el, W, D, poly }: { el: PlacedElectrical; W: number; D: number; poly: PlanPolygon | null }) {
  const isPanel = el.type === 'panel'
  const dim = ELEC_DIMS_3D[el.type]
  const depth = isPanel ? 0.12 : 0.018
  const p = poly ? polyElecPos3D(poly, el) : elecPos3D(el, W, D)
  if (!p) return null // wall not in this room's outline
  const isSwitch = el.type.startsWith('switch')
  if (isPanel) {
    return (
      <group position={[p.px, p.py, p.pz]} rotation={[0, p.ry, 0]}>
        <mesh castShadow>
          <boxGeometry args={[dim.w, dim.h, depth]}/>
          <meshStandardMaterial color="#E8E4DC" roughness={0.6} metalness={0.1}/>
        </mesh>
        <mesh position={[0, 0, depth/2 + 0.002]}>
          <boxGeometry args={[dim.w - 0.02, dim.h - 0.02, 0.01]}/>
          <meshStandardMaterial color="#1B3784" roughness={0.4} metalness={0.15}/>
        </mesh>
        {[-0.08, 0, 0.08].map((rowY, ri) =>
          [-0.08, 0.08].map((colX, ci) => (
            <mesh key={`${ri}-${ci}`} position={[colX, rowY, depth/2 + 0.008]}>
              <boxGeometry args={[0.06, 0.04, 0.006]}/>
              <meshStandardMaterial color="#F0F0F0" roughness={0.5}/>
            </mesh>
          ))
        )}
        <mesh position={[dim.w/2 - 0.03, 0, depth/2 + 0.012]}>
          <boxGeometry args={[0.012, 0.04, 0.008]}/>
          <meshStandardMaterial color="#C0B8A8" metalness={0.6} roughness={0.3}/>
        </mesh>
      </group>
    )
  }
  return (
    <group position={[p.px, p.py, p.pz]} rotation={[0, p.ry, 0]}>
      <mesh castShadow>
        <boxGeometry args={[dim.w, dim.h, depth]}/>
        <meshStandardMaterial color="#F5F5F0" roughness={0.5} metalness={0.05}/>
      </mesh>
      {isSwitch ? (
        <mesh position={[0, 0.005, depth/2 + 0.001]}>
          <boxGeometry args={[dim.w * 0.7, dim.h * 0.55, 0.004]}/>
          <meshStandardMaterial color="#1B3784" roughness={0.4} metalness={0.1}/>
        </mesh>
      ) : (
        <>
          <mesh position={[-0.012, 0.008, depth/2 + 0.001]}>
            <cylinderGeometry args={[0.004, 0.004, 0.003, 12]}/>
            <meshStandardMaterial color="#1B3784"/>
          </mesh>
          <mesh position={[0.012, 0.008, depth/2 + 0.001]}>
            <cylinderGeometry args={[0.004, 0.004, 0.003, 12]}/>
            <meshStandardMaterial color="#1B3784"/>
          </mesh>
        </>
      )}
    </group>
  )
}

export function WireLine3D({ el, panel, W, D, wireH, cw, color, poly }: {
  el: PlacedElectrical; panel: PlacedElectrical
  W: number; D: number; wireH: number
  cw: boolean; color: string
  poly: PlanPolygon | null
}) {
  const lineObj = useMemo(() => {
    const pts = poly ? polyRouteWire3D(poly, el, panel, wireH, cw) : routeWire3D(el, panel, W, D, wireH, cw)
    if (!pts) return null
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    const mat = new THREE.LineBasicMaterial({ color })
    return new THREE.Line(geo, mat)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el.id, el.positionMm, el.wallId, panel.positionMm, panel.wallId, W, D, wireH, cw, color, poly])

  if (!lineObj) return null
  return <primitive object={lineObj}/>
}
