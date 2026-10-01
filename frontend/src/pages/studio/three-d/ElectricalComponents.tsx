import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { useRoomStore } from "@/store/roomStore";
import type { PlacedElectrical } from "@/store/roomStore";
import { ELECTRICAL_DIMS } from "./constants";
import { TYPE_LABEL } from "@/pages/studio/placement/constants";
import { useHoldToDelete } from "@/hooks/useHoldToDelete";
import { wallDefsFromVertices, type PolyWallDef } from "@/lib/wallDefsFromVertices";
import { alongWallM, wallMountFrame, wallMountPoint } from "@/lib/wallMountFrame";
import { clearOfOpenings } from "@/lib/electricalClearance";
import { Faceplate, PLATE_T } from "./Faceplates";

/**
 * Wall-mounted electrical devices (switches, sockets, panels) and their
 * drag-to-reposition behaviour. Split out of ThreeDPage.tsx — see that
 * file's header comment for the full picture.
 */

function DraggableElectricalItem({
  el, W, D, polyDefs, isDragging, dragPosMmRef, onPointerDown,
}: {
  el: PlacedElectrical
  W: number; D: number
  /** Per-edge frames for a drawn/scanned room; empty for a legacy rectangle. */
  polyDefs: Record<string, PolyWallDef>
  isDragging: boolean
  dragPosMmRef: React.MutableRefObject<number>
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void
}) {
  const groupRef = useRef<THREE.Group>(null)
  const isPanel = el.type === 'panel'
  const isAc = el.type === 'ac'
  const dim = ELECTRICAL_DIMS[el.type] ?? { w: 0.08, h: 0.08 }
  // A faceplate is flush; a consumer unit is a cabinet; a split unit's indoor
  // half is a long shallow box hung off the wall.
  const depth = isPanel ? 0.12 : isAc ? 0.2 : PLATE_T
  // How far the back of the fitting sits off the wall face. A faceplate is
  // screwed to it, so only enough to keep the two surfaces from z-fighting;
  // the cabinet and the split unit hang clear.
  const T = isPanel || isAc ? 0.004 : 0.0012
  const frame = useMemo(
    () => wallMountFrame(el.wallId, W, D, polyDefs),
    [el.wallId, W, D, polyDefs],
  )

  // Static position, from the wall's own frame — which is what makes this work
  // for a drawn room's W1..Wn as well as a rectangle's A..D.
  const { px, py, pz, ry } = useMemo(() => {
    const cy = el.heightMm / 1000 + dim.h / 2
    if (!frame) return { px: 0, py: cy, pz: 0, ry: 0 }
    const { x, z } = wallMountPoint(frame, el.positionMm / 1000, depth / 2 + T)
    return { px: x, py: cy, pz: z, ry: frame.ry }
  }, [el.positionMm, el.heightMm, frame, dim.h, depth, T])

  useFrame(() => {
    if (!isDragging || !groupRef.current || !frame) return
    const pos = dragPosMmRef.current / 1000
    const live = wallMountPoint(frame, pos, depth / 2 + T)
    groupRef.current.position.x = live.x
    groupRef.current.position.z = live.z
  })

  if (isAc) {
    return (
      // The handlers belong to the whole device, not to the one mesh that
      // happens to be its body: pressing the louvre or the seam used to miss
      // the unit entirely and hit the wall behind it, which opened the wall
      // menu instead of dragging the unit or offering to delete it.
      <group ref={groupRef} position={[px, py, pz]} rotation={[0, ry, 0]}
        onPointerDown={onPointerDown}
        onPointerEnter={() => { document.body.style.cursor = 'grab' }}
        onPointerLeave={() => { if (!isDragging) document.body.style.cursor = '' }}>
        {/* Body — rounded-looking white case standing off the wall. */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[dim.w, dim.h, depth]} />
          <meshStandardMaterial color="#F5F5F2" roughness={0.45} metalness={0.05}
            emissive={isDragging ? '#4466AA' : '#000'} emissiveIntensity={isDragging ? 0.08 : 0} />
        </mesh>
        {/* Louvre across the underside, where the air actually comes out. */}
        <mesh position={[0, -dim.h / 2 + 0.03, depth / 2 - 0.02]} rotation={[-0.5, 0, 0]}>
          <boxGeometry args={[dim.w * 0.86, 0.05, 0.012]} />
          <meshStandardMaterial color="#D8D8D4" roughness={0.6} />
        </mesh>
        {/* Front seam, so it reads as a case rather than a blank slab. */}
        <mesh position={[0, dim.h * 0.12, depth / 2 + 0.001]}>
          <boxGeometry args={[dim.w * 0.94, 0.006, 0.004]} />
          <meshStandardMaterial color="#E2E2DE" roughness={0.6} />
        </mesh>
      </group>
    )
  }

  if (isPanel) {
    return (
      <group ref={groupRef} position={[px, py, pz]} rotation={[0, ry, 0]}
        onPointerDown={onPointerDown}
        onPointerEnter={() => { document.body.style.cursor = 'grab' }}
        onPointerLeave={() => { if (!isDragging) document.body.style.cursor = '' }}>
        <mesh castShadow>
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
    <group ref={groupRef} position={[px, py, pz]} rotation={[0, ry, 0]}
      onPointerDown={onPointerDown}
      onPointerEnter={() => { document.body.style.cursor = 'grab' }}
      onPointerLeave={() => { if (!isDragging) document.body.style.cursor = '' }}>
      <Faceplate type={el.type} w={dim.w} h={dim.h} isDragging={isDragging} />
    </group>
  )
}


export function DraggableElectricalModels({
  controlsRef, W, D, hiddenWalls,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>
  W: number; D: number
  /** Walls the camera is behind. Their faceplates go with them — a socket
   *  hanging in mid-air where its wall was is worse than no socket. */
  hiddenWalls?: ReadonlySet<string>
}) {
  const { bind: holdBind } = useHoldToDelete()
  const electricals = useRoomStore(s => s.electricals)
  const moveElectrical = useRoomStore(s => s.moveElectrical)
  const geometry = useRoomStore(s => s.geometry)
  // Per-edge frames for a drawn/scanned room; a legacy rectangle has none and
  // takes wallMountFrame's own A..D branch.
  const polyDefs = useMemo(
    () => (geometry.vertices && geometry.vertices.length >= 3
      ? wallDefsFromVertices(geometry.vertices, geometry.walls.map(w => w.id))
      : {}),
    [geometry],
  )
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
    holdBind({
      label: TYPE_LABEL[el.type] ?? 'Qurilma',
      onDelete: () => useRoomStore.getState().removeElectrical(el.id),
    }).onPointerDown(e)
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

    const frame = wallMountFrame(el.wallId, W, D, polyDefs)
    if (!frame) return
    // The plane of the wall the device is on. Built from the wall's own
    // normal and midpoint rather than from the room's bounding box, so a
    // diagonal wall in a drawn room drags along itself and not along X or Z.
    const normal = new THREE.Vector3(frame.nx, 0, frame.nz)
    const wallPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      normal, new THREE.Vector3(frame.midX, 0, frame.midZ),
    )
    const wallLenMm = frame.length * 1000
    const openings = geometry.walls.find(w => w.id === el.wallId)?.elements ?? []
    const dim = ELECTRICAL_DIMS[el.type] ?? { w: 0.08, h: 0.08 }
    const band = {
      widthMm: dim.w * 1000,
      bottomMm: el.heightMm,
      topMm: el.heightMm + dim.h * 1000,
    }
    const canvas = gl.domElement

    const handleMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      if (!raycaster.ray.intersectPlane(wallPlane, hitPoint.current)) return
      const posMm = alongWallM(frame, hitPoint.current) * 1000
      // Clamped to the wall AND off any door or window it would land on —
      // a socket dragged across the door used to stop on the leaf.
      dragPosMmRef.current = clearOfOpenings(posMm, band, openings, wallLenMm)
    }

    canvas.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', commitDrag)
    return () => {
      canvas.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', commitDrag)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingId, W, D, polyDefs, geometry])

  if (electricals.length === 0) return null
  return (
    <>
      {electricals.filter(el => !hiddenWalls?.has(el.wallId)).map(el => (
        <DraggableElectricalItem
          key={el.id}
          el={el} W={W} D={D} polyDefs={polyDefs}
          isDragging={draggingId === el.id}
          dragPosMmRef={dragPosMmRef}
          onPointerDown={(e) => startDrag(el, e)}
        />
      ))}
    </>
  )
}
