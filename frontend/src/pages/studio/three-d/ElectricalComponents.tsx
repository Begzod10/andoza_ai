import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { useRoomStore } from "@/store/roomStore";
import type { PlacedElectrical } from "@/store/roomStore";
import { ELECTRICAL_DIMS } from "./constants";
import { getWallPlane } from "./helpers";

/**
 * Wall-mounted electrical devices (switches, sockets, panels) and their
 * drag-to-reposition behaviour. Split out of ThreeDPage.tsx — see that
 * file's header comment for the full picture.
 */

function DraggableElectricalItem({
  el, W, D, isDragging, dragPosMmRef, onPointerDown,
}: {
  el: PlacedElectrical
  W: number; D: number
  isDragging: boolean
  dragPosMmRef: React.MutableRefObject<number>
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void
}) {
  const groupRef = useRef<THREE.Group>(null)
  const isPanel = el.type === 'panel'
  const dim = ELECTRICAL_DIMS[el.type] ?? { w: 0.08, h: 0.08 }
  const depth = isPanel ? 0.12 : 0.018
  const T = 0.004
  const isSwitch = el.type.startsWith('switch')
  const isH = el.wallId === 'A' || el.wallId === 'C'

  // Compute static position (the axis that stays fixed during drag)
  const { px, py, pz, ry } = useMemo(() => {
    const cy = el.heightMm / 1000 + dim.h / 2
    const p = el.positionMm / 1000
    switch (el.wallId) {
      case 'A': return { px: p - W / 2, py: cy, pz: -(D / 2) + depth / 2 + T, ry: 0 }
      case 'C': return { px: p - W / 2, py: cy, pz: D / 2 - depth / 2 - T, ry: Math.PI }
      case 'D': return { px: -(W / 2) + depth / 2 + T, py: cy, pz: p - D / 2, ry: Math.PI / 2 }
      case 'B': return { px: W / 2 - depth / 2 - T, py: cy, pz: p - D / 2, ry: -Math.PI / 2 }
      default: return { px: 0, py: cy, pz: 0, ry: 0 }
    }
  }, [el, W, D, dim.h, depth])

  useFrame(() => {
    if (!isDragging || !groupRef.current) return
    const pos = dragPosMmRef.current / 1000
    if (isH) groupRef.current.position.x = pos - W / 2
    else     groupRef.current.position.z = pos - D / 2
  })

  if (isPanel) {
    return (
      <group ref={groupRef} position={[px, py, pz]} rotation={[0, ry, 0]}>
        <mesh castShadow
          onPointerDown={onPointerDown}
          onPointerEnter={() => { document.body.style.cursor = 'grab' }}
          onPointerLeave={() => { if (!isDragging) document.body.style.cursor = '' }}>
          <boxGeometry args={[dim.w, dim.h, depth]} />
          <meshStandardMaterial color="#E8E4DC" roughness={0.6} metalness={0.1}
            emissive={isDragging ? '#4466AA' : '#000'} emissiveIntensity={isDragging ? 0.08 : 0}/>
        </mesh>
        <mesh position={[0, 0, depth / 2 + 0.002]}>
          <boxGeometry args={[dim.w - 0.02, dim.h - 0.02, 0.01]} />
          <meshStandardMaterial color="#1B3784" roughness={0.4} metalness={0.15} />
        </mesh>
        {[-0.08, 0, 0.08].map((rowY, ri) =>
          [-0.08, 0.08].map((colX, ci) => (
            <mesh key={`${ri}-${ci}`} position={[colX, rowY, depth / 2 + 0.008]}>
              <boxGeometry args={[0.06, 0.04, 0.006]} />
              <meshStandardMaterial color="#F0F0F0" roughness={0.5} />
            </mesh>
          ))
        )}
        <mesh position={[dim.w / 2 - 0.03, 0, depth / 2 + 0.012]}>
          <boxGeometry args={[0.012, 0.04, 0.008]} />
          <meshStandardMaterial color="#C0B8A8" metalness={0.6} roughness={0.3} />
        </mesh>
      </group>
    )
  }

  return (
    <group ref={groupRef} position={[px, py, pz]} rotation={[0, ry, 0]}>
      <mesh castShadow
        onPointerDown={onPointerDown}
        onPointerEnter={() => { document.body.style.cursor = 'grab' }}
        onPointerLeave={() => { if (!isDragging) document.body.style.cursor = '' }}>
        <boxGeometry args={[dim.w, dim.h, depth]} />
        <meshStandardMaterial color="#F5F5F0" roughness={0.5} metalness={0.05}
          emissive={isDragging ? '#4466AA' : '#000'} emissiveIntensity={isDragging ? 0.1 : 0}/>
      </mesh>
      {isSwitch ? (
        <mesh position={[0, 0.005, depth / 2 + 0.001]}>
          <boxGeometry args={[dim.w * 0.7, dim.h * 0.55, 0.004]} />
          <meshStandardMaterial color="#1B3784" roughness={0.4} metalness={0.1} />
        </mesh>
      ) : (
        <>
          <mesh position={[-0.012, 0.008, depth / 2 + 0.001]}>
            <cylinderGeometry args={[0.004, 0.004, 0.003, 12]} />
            <meshStandardMaterial color="#1B3784" />
          </mesh>
          <mesh position={[0.012, 0.008, depth / 2 + 0.001]}>
            <cylinderGeometry args={[0.004, 0.004, 0.003, 12]} />
            <meshStandardMaterial color="#1B3784" />
          </mesh>
        </>
      )}
    </group>
  )
}


export function DraggableElectricalModels({
  controlsRef, W, D,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>
  W: number; D: number
}) {
  const electricals = useRoomStore(s => s.electricals)
  const moveElectrical = useRoomStore(s => s.moveElectrical)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const draggingIdRef = useRef<string | null>(null)
  const dragPosMmRef = useRef(0)
  const electricalsRef = useRef(electricals)
  electricalsRef.current = electricals

  const { camera, gl } = useThree()
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const hitPoint = useRef(new THREE.Vector3())

  function startDrag(el: PlacedElectrical, e: ThreeEvent<PointerEvent>) {
    e.stopPropagation()
    dragPosMmRef.current = el.positionMm
    draggingIdRef.current = el.id
    setDraggingId(el.id)
    if (controlsRef.current) controlsRef.current.enabled = false
    document.body.style.cursor = 'grabbing'
  }

  function commitDrag() {
    const id = draggingIdRef.current
    if (!id) return
    moveElectrical(id, Math.round(dragPosMmRef.current))
    draggingIdRef.current = null
    setDraggingId(null)
    if (controlsRef.current) controlsRef.current.enabled = true
    document.body.style.cursor = ''
  }

  useEffect(() => {
    if (!draggingId) return
    const el = electricalsRef.current.find(e => e.id === draggingId)
    if (!el) return

    const wallPlane = getWallPlane(el.wallId as 'A' | 'B' | 'C' | 'D', W, D)
    const isH = el.wallId === 'A' || el.wallId === 'C'
    const wallLenMm = isH ? W * 1000 : D * 1000
    const canvas = gl.domElement

    const handleMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      if (!raycaster.ray.intersectPlane(wallPlane, hitPoint.current)) return
      let posMm = isH
        ? (hitPoint.current.x + W / 2) * 1000
        : (hitPoint.current.z + D / 2) * 1000
      posMm = Math.max(100, Math.min(wallLenMm - 100, posMm))
      dragPosMmRef.current = posMm
    }

    canvas.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', commitDrag)
    return () => {
      canvas.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', commitDrag)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingId, W, D])

  if (electricals.length === 0) return null
  return (
    <>
      {electricals.map(el => (
        <DraggableElectricalItem
          key={el.id}
          el={el} W={W} D={D}
          isDragging={draggingId === el.id}
          dragPosMmRef={dragPosMmRef}
          onPointerDown={(e) => startDrag(el, e)}
        />
      ))}
    </>
  )
}
