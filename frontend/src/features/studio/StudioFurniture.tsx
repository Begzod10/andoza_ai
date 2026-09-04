/**
 * Placed-furniture rendering — the read-only 3D view (FurnitureItem/
 * FurnitureModels) and the interactive drag/rotate/scale/part-edit tool
 * (DraggableFurnitureItem/DraggableFurnitureModels) shared by the active
 * room and the sibling-room preview (SiblingRooms.tsx). Split out of
 * ThreeDPage.tsx, which was a 5300-line single file — this is a pure
 * code-motion extraction, not a rewrite.
 */
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useRoomStore } from "@/store/roomStore";
import type { PlacedFurniture, UserFurnitureEntry } from "@/store/roomStore";
import { FURNITURE_CATALOG, catalogToFurnitureEntry } from "@/lib/furnitureCatalog";
import { extractSceneInfo } from "@/lib/modelConverter";
import {
  partKeyFor, resolvePartKey, resolvePartFromMesh, partLabel,
  applyHiddenParts, hasMeshesOutsidePart, setPartHighlight, exportPartToGlb,
} from "@/lib/modelParts";
import { saveModelToDb, arrayBufferToBlobUrl } from "@/lib/modelDb";
import { nanoid } from "nanoid";
import * as THREE from "three";
import { toDiffuseOnly } from "@/lib/modelMaterials";

// ─── Shared furniture entry (catalog + user-uploaded) ─────────────────────────

type AnyFurnitureEntry = {
  id: string
  modelPath: string
  scale: number
  sizeM: { w: number; d: number; h: number }
  hasTextures?: boolean
  /** Do'kon catalog models arrive with no known native unit — scale/sizeM
   *  above are placeholders. The real values are auto-detected from the
   *  loaded GLB's own geometry (extractSceneInfo) the first time it renders,
   *  same as a freshly-imported user model. */
  autoScale?: boolean
}

function useFurnitureEntry(furnitureId: string): AnyFurnitureEntry | undefined {
  const userFurniture = useRoomStore((s) => s.userFurniture)
  const catalogFurniture = useRoomStore((s) => s.catalogFurniture)
  // Memoize: catalogToFurnitureEntry() mints a NEW object every call, so
  // without this a do'kon model's entry changed reference on every render —
  // which invalidated the scene.clone() memo below and made R3F churn (and
  // dispose the shared GLTF cache) while dragging, so the model vanished until
  // a reload. Built-in FURNITURE_CATALOG entries are stable references already.
  return useMemo(
    () =>
      FURNITURE_CATALOG.find((f) => f.id === furnitureId) ??
      userFurniture.find((f) => f.id === furnitureId) ??
      catalogToFurnitureEntry(catalogFurniture.find((f) => f.id === furnitureId)),
    [furnitureId, userFurniture, catalogFurniture],
  )
}

/** Most parts detailed in the import diagnostic — see the note in prepareMesh. */
const REPORT_LIMIT = 40

/** Set shadows on every mesh + strip its materials down to colour.
 *  Preserves single-vs-array structure. */
function prepareMesh(obj: THREE.Object3D, debugLabel?: string) {
  const report: Record<string, unknown>[] = []
  let parts = 0
  obj.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.castShadow = true
    child.receiveShadow = true
    if (Array.isArray(child.material)) {
      child.material = child.material.map(toDiffuseOnly)
    } else {
      child.material = toDiffuseOnly(child.material as THREE.Material)
    }
    if (!import.meta.env.DEV || !debugLabel) return
    parts += 1
    // Collect a sample only. An imported model can carry thousands of parts
    // (3ds Max/Corona exports routinely do), and console.table on a list that
    // long blocks the main thread for tens of seconds — the studio came up
    // "unresponsive" purely from logging about the model it had just loaded.
    if (report.length >= REPORT_LIMIT) return
    const mats = Array.isArray(child.material) ? child.material : [child.material]
    for (const m of mats) {
      const s = m as THREE.MeshStandardMaterial
      report.push({
        mesh: child.name,
        material: s.name,
        map: !!s.map,
        mapPx: s.map?.image ? `${s.map.image.width}x${s.map.image.height}` : '—',
        uv: !!child.geometry.getAttribute('uv'),
        color: s.color?.getHexString?.(),
        metalness: s.metalness,
        roughness: s.roughness,
        vertexColors: s.vertexColors,
      })
    }
  })
  if (report.length) {
    // Why a model renders untextured is invisible from the outside: a bound map
    // can still be blank, unwrapped, or drowned by a metallic response.
    const omitted = parts - report.length
    console.groupCollapsed(
      `[furniture] ${debugLabel} — ${parts} part(s)` +
      (omitted > 0 ? `, showing first ${report.length}` : ''),
    )
    console.table(report)
    console.groupEnd()
  }
}

/** Apply per-material color tints. Uses '*' as wildcard for all materials. */
function applyColorOverrides(obj: THREE.Object3D, overrides: Record<string, string>) {
  const wildcard = overrides['*']
  obj.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const mats = Array.isArray(child.material) ? child.material : [child.material]
    mats.forEach((m) => {
      if (!(m instanceof THREE.MeshStandardMaterial)) return
      const named = overrides[m.name]
      if (named) m.color.set(named)
      // A wildcard tint multiplies into the texture, so applying the default
      // white to a mapped material is a no-op at best — and a way to wash a
      // model out at worst. Named overrides stay explicit and still apply.
      else if (wildcard && !m.map) m.color.set(wildcard)
    })
  })
}

// ─── Placed furniture renderer ────────────────────────────────────────────────

export function FurnitureItem({ item }: { item: PlacedFurniture }) {
  const entry = useFurnitureEntry(item.furniture_id)
  const modelPath = entry?.modelPath ?? ''
  const { scene } = useGLTF(modelPath || '/models/table_boconcept_hauge.glb')
  const cloned = useMemo(() => {
    const c = scene.clone(true)
    applyHiddenParts(c, item.hiddenParts)
    // Only user-imported models are worth reporting on — catalog GLBs are known good
    prepareMesh(c, entry && 'blobId' in entry ? entry.id : undefined)
    return c
  }, [scene, entry, item.hiddenParts]);

  // Compute bottom offset ONCE per clone, before R3F touches the object's position.
  // Storing scale-independent value so it stays correct when scaleOverride changes.
  const yOffUnit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(cloned)
    return isFinite(box.min.y) ? -box.min.y : 0
  }, [cloned]);

  // A do'kon catalog model has no authored scale — detect it from the loaded
  // GLB's own geometry, same heuristic a fresh user import goes through.
  const autoScale = useMemo(() => {
    if (!entry?.autoScale) return null
    try { return extractSceneInfo(cloned).scale } catch { return 1 }
  }, [entry, cloned])

  useLayoutEffect(() => {
    if (!item.colorOverrides || Object.keys(item.colorOverrides).length === 0) return
    applyColorOverrides(cloned, item.colorOverrides)
  }, [cloned, item.colorOverrides])

  if (!entry || !modelPath) return null;
  const s = (autoScale ?? entry.scale) * (item.scaleOverride ?? 1);
  return (
    <primitive
      object={cloned}
      // A clone shares geometry/materials with drei's cached GLTF — never let
      // R3F auto-dispose those on unmount or every other placement of the same
      // model would go blank.
      dispose={null}
      position={[item.x / 1000, yOffUnit * s, item.y / 1000]}
      rotation={[0, item.rotation, 0]}
      scale={s}
    />
  );
}

export function FurnitureModels() {
  const furniture = useRoomStore((s) => s.furniture);
  if (furniture.length === 0) return null;
  return (
    <>
      {furniture.map((item) => (
        <FurnitureItem key={item.id} item={item} />
      ))}
    </>
  );
}

// Preload all catalog models so first render is instant
FURNITURE_CATALOG.forEach((e) => useGLTF.preload(e.modelPath));

// ─── Draggable furniture (ThreeDPage only) ────────────────────────────────────

export type ToolMode = 'select' | 'move' | 'rotate' | 'scale' | 'part'

/** Part selection: which sub-object of which placed item is active. */
export interface SelectedPart {
  itemId: string
  partKey: string
  label: string
}

function DraggableFurnitureItem({
  item,
  isDragging,
  isSelected,
  toolMode,
  dragPosRef,
  dragRotRef,
  dragScaleRef,
  onMeshPointerDown,
  onButtonPointerDown,
  onFootprint,
  selectedPartKey,
  onSelectPart,
}: {
  item: PlacedFurniture
  isDragging: boolean
  isSelected: boolean
  toolMode: ToolMode
  dragPosRef: RefObject<THREE.Vector3>
  dragRotRef: RefObject<number>
  dragScaleRef: RefObject<number>
  onMeshPointerDown: (e: ThreeEvent<PointerEvent>) => void
  onButtonPointerDown: (e: React.PointerEvent) => void
  onFootprint: (id: string, hw: number, hd: number) => void
  /** Active part key when this item owns the current part selection */
  selectedPartKey: string | null
  onSelectPart: (part: SelectedPart | null) => void
}) {
  const entry = useFurnitureEntry(item.furniture_id)
  const modelPath = entry?.modelPath ?? ''
  const { scene } = useGLTF(modelPath || '/models/table_boconcept_hauge.glb')
  const cloned = useMemo(() => {
    const c = scene.clone(true)
    applyHiddenParts(c, item.hiddenParts)
    // Only user-imported models are worth reporting on — catalog GLBs are known good
    prepareMesh(c, entry && 'blobId' in entry ? entry.id : undefined)
    return c
  }, [scene, entry, item.hiddenParts])
  const groupRef = useRef<THREE.Group>(null)
  const primitiveRef = useRef<THREE.Object3D>(null)
  const selRef = useRef<THREE.Group>(null)
  const { invalidate } = useThree()
  const [detaching, setDetaching] = useState(false)

  // If pruning removed the last mesh, the item is an empty shell — drop it.
  useEffect(() => {
    let hasMesh = false
    cloned.traverse((c) => { if ((c as THREE.Mesh).isMesh) hasMesh = true })
    if (!hasMesh) useRoomStore.getState().removeFurniture(item.id)
  }, [cloned, item.id])

  // Highlight the selected part; cleanup restores the materials (the node may
  // already be pruned on cleanup — resolvePartKey then returns null, fine).
  useEffect(() => {
    if (!selectedPartKey) return
    const node = resolvePartKey(cloned, selectedPartKey)
    if (!node) return
    setPartHighlight(node, true)
    invalidate()
    return () => { setPartHighlight(node, false); invalidate() }
  }, [selectedPartKey, cloned, invalidate])

  function handlePartClick(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation()
    const part = resolvePartFromMesh(cloned, e.object)
    const key = partKeyFor(cloned, part)
    if (!key) return
    onSelectPart({ itemId: item.id, partKey: key, label: partLabel(part) })
  }

  function deleteSelectedPart() {
    if (!selectedPartKey) return
    const node = resolvePartKey(cloned, selectedPartKey)
    onSelectPart(null)
    if (node && !hasMeshesOutsidePart(cloned, node)) {
      // Last visible part — removing it leaves an invisible, unclickable shell
      useRoomStore.getState().removeFurniture(item.id)
      return
    }
    useRoomStore.getState().hideFurniturePart(item.id, selectedPartKey)
  }

  async function detachSelectedPart() {
    if (!selectedPartKey || detaching) return
    const node = resolvePartKey(cloned, selectedPartKey)
    if (!node) return
    setDetaching(true)
    try {
      const { buffer, sizeM, worldCenter } = await exportPartToGlb(node)
      const id = nanoid()
      await saveModelToDb(id, buffer)
      const path = arrayBufferToBlobUrl(buffer)
      useGLTF.preload(path)
      const store = useRoomStore.getState()
      store.addUserFurniture({
        id,
        name: partLabel(node),
        emoji: '🧩',
        blobId: id,
        modelPath: path,
        scale: 1, // world rotation+scale are baked into the exported GLB
        sizeM,
        hasTextures: entry?.hasTextures ?? false,
      })
      store.placeFurniture({
        id: `furn_${id}`,
        furniture_id: id,
        x: worldCenter.x * 1000,
        y: worldCenter.z * 1000,
        rotation: 0,
      })
      onSelectPart(null)
      if (hasMeshesOutsidePart(cloned, node)) {
        store.hideFurniturePart(item.id, selectedPartKey)
      } else {
        store.removeFurniture(item.id)
      }
    } catch (err) {
      console.error('[PartDetach] failed:', err)
      alert("Qismni ajratib bo'lmadi: " + (err instanceof Error ? err.message : 'xato'))
    } finally {
      setDetaching(false)
    }
  }

  // Compute Y offset and XZ footprint ONCE per clone, before R3F sets position.
  const { yOffUnit, geomHW, geomHD, geomHH, geomCX, geomCZ } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(cloned)
    const ok = isFinite(box.min.x)
    return {
      yOffUnit: ok ? -box.min.y : 0,
      geomHW: ok ? (box.max.x - box.min.x) / 2 : 0.3,
      geomHD: ok ? (box.max.z - box.min.z) / 2 : 0.3,
      geomHH: ok ? (box.max.y - box.min.y) / 2 : 0.5,
      // Bounding-box centre in the model's local space — many models pivot at
      // a corner, so the selection cage must centre on the GEOMETRY, not the
      // pivot, or cage and mesh visibly disagree.
      geomCX: ok ? (box.min.x + box.max.x) / 2 : 0,
      geomCZ: ok ? (box.min.z + box.max.z) / 2 : 0,
    }
  }, [cloned])

  // A do'kon catalog model has no authored scale — detect it from the loaded
  // GLB's own geometry, same heuristic a fresh user import goes through.
  const effScale = useMemo(() => {
    if (!entry?.autoScale) return entry?.scale ?? 1
    try { return extractSceneInfo(cloned).scale } catch { return 1 }
  }, [entry, cloned])

  // Report actual footprint to parent for collision detection
  useEffect(() => {
    if (!entry) return
    const s = effScale * (item.scaleOverride ?? 1)
    onFootprint(item.id, geomHW * s, geomHD * s)
  }, [item.id, geomHW, geomHD, entry, effScale, item.scaleOverride, onFootprint])

  useLayoutEffect(() => {
    if (!item.colorOverrides || Object.keys(item.colorOverrides).length === 0) return
    applyColorOverrides(cloned, item.colorOverrides)
  }, [cloned, item.colorOverrides])

  useFrame(() => {
    if (!isDragging) {
      // restore the cage after a live-scale drag hid it
      if (selRef.current && !selRef.current.visible) selRef.current.visible = true
      return
    }
    if (toolMode === 'move' && groupRef.current && dragPosRef.current) {
      groupRef.current.position.x = dragPosRef.current.x
      groupRef.current.position.z = dragPosRef.current.z
    } else if (toolMode === 'rotate' && primitiveRef.current && dragRotRef.current !== null) {
      primitiveRef.current.rotation.y = dragRotRef.current
      // keep the selection cage glued to the model during live rotation
      if (selRef.current) selRef.current.rotation.y = dragRotRef.current
    } else if (toolMode === 'scale' && primitiveRef.current && entry) {
      const liveScale = effScale * (dragScaleRef.current ?? 1)
      primitiveRef.current.scale.setScalar(liveScale)
      // cage is sized for the committed scale — hide it while live-scaling
      if (selRef.current) selRef.current.visible = false
    }
  })

  // Clean 12-edge selection cage — a triangle wireframe draws face diagonals,
  // which reads as a "rotated" box around the model.
  const so0 = item.scaleOverride ?? 1
  const cageGeo = useMemo(() => {
    if (!entry) return null
    const sc = effScale * so0
    const w = geomHW * sc * 2 + 0.06
    const d = geomHD * sc * 2 + 0.06
    // Height from the real geometry — catalog sizeM.h can disagree with it
    const h = geomHH * sc * 2 + 0.06
    return new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d))
  }, [entry, so0, effScale, geomHW, geomHD, geomHH])
  useEffect(() => () => { cageGeo?.dispose() }, [cageGeo])

  if (!entry || !modelPath) return null

  const so = item.scaleOverride ?? 1
  const s = effScale * so
  const yOff = yOffUnit * s
  // A do'kon catalog model's sizeM.h is an unset placeholder (0) — the real
  // geometry height (geomHH, doubled) times scale is the only true source.
  const modelH = entry.autoScale ? geomHH * 2 * s : (entry.sizeM.h ?? 1) * so
  const buttonH = modelH + 0.18
  const btnActive = isDragging
  const fw = geomHW * s * 2   // actual footprint width
  const fd = geomHD * s * 2   // actual footprint depth
  const meshCursor = toolMode === 'select' ? 'pointer'
                   : toolMode === 'part'   ? 'crosshair'
                   : toolMode === 'rotate' ? 'ew-resize'
                   : toolMode === 'scale'  ? 'ns-resize'
                   : 'grab'

  return (
    <group ref={groupRef} position={[item.x / 1000, 0, item.y / 1000]}>
      <primitive
        ref={primitiveRef}
        object={cloned}
        // Shares geometry/materials with the cached GLTF — don't auto-dispose.
        dispose={null}
        position={[0, yOff, 0]}
        rotation={[0, item.rotation, 0]}
        scale={s}
        onPointerDown={toolMode === 'part' ? handlePartClick : onMeshPointerDown}
        onPointerEnter={() => { document.body.style.cursor = meshCursor }}
        onPointerLeave={() => { if (!isDragging) document.body.style.cursor = '' }}
      />
      {/* Part-mode action bar — floats above the model while a part is selected */}
      {toolMode === 'part' && selectedPartKey && (
        <Html position={[0, buttonH, 0]} center zIndexRange={[110, 0]} style={{ pointerEvents: 'none' }}>
          <div
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              pointerEvents: 'all', display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.96)', borderRadius: 10, padding: '5px 8px',
              boxShadow: '0 4px 14px rgba(0,0,0,0.25)', border: '1px solid rgba(0,0,0,0.08)',
              whiteSpace: 'nowrap', userSelect: 'none',
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {partLabel(resolvePartKey(cloned, selectedPartKey) ?? cloned)}
            </span>
            <button
              onClick={detachSelectedPart}
              disabled={detaching}
              title="Qismni alohida obyekt sifatida ajratish"
              style={{
                fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 7,
                border: '1px solid #2563EB', background: '#EFF6FF', color: '#2563EB',
                cursor: detaching ? 'wait' : 'pointer',
              }}
            >
              {detaching ? '⏳' : 'Ajratish'}
            </button>
            <button
              onClick={deleteSelectedPart}
              disabled={detaching}
              title="Qismni o'chirish"
              style={{
                fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 7,
                border: '1px solid #DC2626', background: '#FEF2F2', color: '#DC2626',
                cursor: 'pointer',
              }}
            >
              O'chirish
            </button>
            <button
              onClick={() => onSelectPart(null)}
              title="Bekor qilish"
              style={{
                fontSize: 11, fontWeight: 700, padding: '3px 6px', borderRadius: 7,
                border: 'none', background: 'transparent', color: '#9CA3AF', cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        </Html>
      )}
      {/* Selection indicators — rotate WITH the model and centre on its
          bounding box (models often pivot at a corner, not the middle) */}
      {isSelected && (
        <group ref={selRef} rotation={[0, item.rotation, 0]}>
          <group position={[geomCX * s, 0, geomCZ * s]}>
            {/* Flat footprint outline — clearly visible in top/isometric view */}
            <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[fw + 0.08, fd + 0.08]} />
              <meshBasicMaterial color="#2563EB" transparent opacity={0} />
            </mesh>
            {/* Ground-level border rect using 4 thin box edges */}
            {[
              { pos: [0, 0.012, -(fd / 2 + 0.04)] as [number,number,number], scale: [fw + 0.08, 0.012, 0.012] as [number,number,number] },
              { pos: [0, 0.012,  (fd / 2 + 0.04)] as [number,number,number], scale: [fw + 0.08, 0.012, 0.012] as [number,number,number] },
              { pos: [-(fw / 2 + 0.04), 0.012, 0] as [number,number,number], scale: [0.012, 0.012, fd + 0.08] as [number,number,number] },
              { pos: [ (fw / 2 + 0.04), 0.012, 0] as [number,number,number], scale: [0.012, 0.012, fd + 0.08] as [number,number,number] },
            ].map((edge, i) => (
              <mesh key={i} position={edge.pos}>
                <boxGeometry args={edge.scale} />
                <meshBasicMaterial color="#2563EB" />
              </mesh>
            ))}
            {/* 3D selection cage — pure box EDGES (a triangle wireframe would
                draw face diagonals that read as a rotated box) */}
            {cageGeo && (
              <lineSegments geometry={cageGeo} position={[0, geomHH * s, 0]}>
                <lineBasicMaterial color="#2563EB" />
              </lineSegments>
            )}
          </group>
        </group>
      )}
      {toolMode === 'move' && (
        <Html position={[0, buttonH, 0]} center zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }}>
          <button
            onPointerDown={(e) => { e.stopPropagation(); onButtonPointerDown(e) }}
            title="Siljitish"
            style={{
              pointerEvents: 'all', width: 30, height: 30, borderRadius: '50%',
              border: btnActive ? '2px solid #1E40AF' : '1.5px solid rgba(0,0,0,0.18)',
              background: btnActive ? '#1E40AF' : 'rgba(255,255,255,0.92)',
              color: btnActive ? '#fff' : '#555',
              cursor: btnActive ? 'grabbing' : 'grab',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.22)', userSelect: 'none', touchAction: 'none',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11 3l-4 4h3v3H7V7l-4 4 4 4v-3h3v3H7l4 4 4-4h-3v-3h3v3l4-4-4-4v3h-3V7h3l-4-4z"/>
            </svg>
          </button>
        </Html>
      )}
      {toolMode === 'rotate' && (
        <Html position={[0, buttonH, 0]} center zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }}>
          <button
            onPointerDown={(e) => { e.stopPropagation(); onButtonPointerDown(e) }}
            title="Aylantirish"
            style={{
              pointerEvents: 'all', width: 30, height: 30, borderRadius: '50%',
              border: btnActive ? '2px solid #1E40AF' : '1.5px solid rgba(0,0,0,0.18)',
              background: btnActive ? '#1E40AF' : 'rgba(255,255,255,0.92)',
              color: btnActive ? '#fff' : '#555',
              cursor: 'ew-resize',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.22)', userSelect: 'none', touchAction: 'none',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
          </button>
        </Html>
      )}
      {toolMode === 'scale' && (
        <Html position={[0, buttonH, 0]} center zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }}>
          <button
            onPointerDown={(e) => { e.stopPropagation(); onButtonPointerDown(e) }}
            title="O'lcham o'zgartirish"
            style={{
              pointerEvents: 'all', width: 30, height: 30, borderRadius: '50%',
              border: btnActive ? '2px solid #059669' : '1.5px solid rgba(0,0,0,0.18)',
              background: btnActive ? '#059669' : 'rgba(255,255,255,0.92)',
              color: btnActive ? '#fff' : '#555',
              cursor: 'ns-resize',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.22)', userSelect: 'none', touchAction: 'none',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 21H3M21 3H3M12 7v10M9 10l3-3 3 3M9 14l3 3 3-3"/>
            </svg>
          </button>
        </Html>
      )}
    </group>
  )
}

export function DraggableFurnitureModels({
  controlsRef,
  roomW,
  roomD,
  toolMode,
  selectedId,
  onSelectItem,
  selectedPart,
  onSelectPart,
}: {
  controlsRef: RefObject<OrbitControlsImpl | null>
  roomW: number
  roomD: number
  toolMode: ToolMode
  selectedId: string | null
  onSelectItem: (id: string) => void
  selectedPart: SelectedPart | null
  onSelectPart: (part: SelectedPart | null) => void
}) {
  const furniture = useRoomStore((s) => s.furniture)
  const userFurniture = useRoomStore((s) => s.userFurniture)
  const catalogFurniture = useRoomStore((s) => s.catalogFurniture)
  const moveFurniture = useRoomStore((s) => s.moveFurniture)
  const resizeFurniture = useRoomStore((s) => s.resizeFurniture)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dragPosRef = useRef(new THREE.Vector3())
  const dragRotRef = useRef(0)
  const dragScaleRef = useRef(1)
  const draggingIdRef = useRef<string | null>(null)
  const furnitureRef = useRef(furniture)
  furnitureRef.current = furniture
  const dragHalfRef = useRef({ w: 0.3, d: 0.3 })
  const rotateStartXRef = useRef(0)
  const scaleStartYRef = useRef(0)
  const scaleStartValueRef = useRef(1)
  const rotateStartAngleRef = useRef(0)
  const { camera, gl } = useThree()
  const floorPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), [])
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const hitPoint = useRef(new THREE.Vector3())
  // Actual XZ half-extents reported by each item from its real geometry bounding box
  const footprintsRef = useRef<Map<string, { hw: number; hd: number }>>(new Map())
  const handleFootprint = useCallback((id: string, hw: number, hd: number) => {
    footprintsRef.current.set(id, { hw, hd })
  }, [])

  function resolveEntry(furnitureId: string): AnyFurnitureEntry | undefined {
    return (
      FURNITURE_CATALOG.find((f) => f.id === furnitureId) ??
      (userFurniture as UserFurnitureEntry[]).find((f) => f.id === furnitureId) ??
      catalogToFurnitureEntry(catalogFurniture.find((f) => f.id === furnitureId))
    )
  }

  // Half-extents of an item's AABB after its yaw rotation — a model authored
  // long along Z and rotated 90° occupies X, and vice versa. Using unrotated
  // extents locked dragging on one axis for rotated large items.
  function rotatedHalf(hw: number, hd: number, rot: number): { hw: number; hd: number } {
    const c = Math.abs(Math.cos(rot))
    const s = Math.abs(Math.sin(rot))
    return { hw: hw * c + hd * s, hd: hw * s + hd * c }
  }

  // AABB overlap test using actual geometry footprints, not catalog sizeM
  function wouldCollide(draggingId: string, nx: number, nz: number): boolean {
    const all = furnitureRef.current
    const aFP0 = footprintsRef.current.get(draggingId)
    if (!aFP0) return false
    const dragItem = all.find((f) => f.id === draggingId)
    const aFP = rotatedHalf(aFP0.hw, aFP0.hd, dragItem?.rotation ?? 0)
    const GAP = 0.03 // 3 cm minimum clearance

    for (const f of all) {
      if (f.id === draggingId) continue
      const bFP0 = footprintsRef.current.get(f.id)
      if (!bFP0) continue
      const bFP = rotatedHalf(bFP0.hw, bFP0.hd, f.rotation)
      const dx = Math.abs(nx - f.x / 1000)
      const dz = Math.abs(nz - f.y / 1000)
      if (dx < aFP.hw + bFP.hw + GAP && dz < aFP.hd + bFP.hd + GAP) return true
    }
    return false
  }

  function activateDrag(item: PlacedFurniture, clientX: number, clientY = 0) {
    onSelectItem(item.id)
    if (toolMode === 'move') {
      // Prefer actual geometry footprint; fall back to catalog sizeM
      const fp = footprintsRef.current.get(item.id)
      const entry = resolveEntry(item.furniture_id)
      const so = item.scaleOverride ?? 1
      const hw0 = fp?.hw ?? (entry?.sizeM.w ?? 0.6) * so / 2
      const hd0 = fp?.hd ?? (entry?.sizeM.d ?? 0.6) * so / 2
      // Wall clamping must use the ROTATED extents, or a long model turned
      // 90° gets its free axis locked against the walls
      const { hw, hd } = rotatedHalf(hw0, hd0, item.rotation)
      const WALL_MARGIN = 0.05 // 5 cm clearance from wall inner face
      dragHalfRef.current = { w: hw + WALL_MARGIN, d: hd + WALL_MARGIN }
      dragPosRef.current.set(item.x / 1000, 0, item.y / 1000)
      document.body.style.cursor = 'grabbing'
    } else if (toolMode === 'rotate') {
      rotateStartXRef.current = clientX
      rotateStartAngleRef.current = item.rotation
      dragRotRef.current = item.rotation
      document.body.style.cursor = 'ew-resize'
    } else if (toolMode === 'scale') {
      const so = item.scaleOverride ?? 1
      scaleStartYRef.current = clientY
      scaleStartValueRef.current = so
      dragScaleRef.current = so
      document.body.style.cursor = 'ns-resize'
    }
    draggingIdRef.current = item.id
    setDraggingId(item.id)
    if (controlsRef.current) controlsRef.current.enabled = false
  }

  function startDragFromMesh(item: PlacedFurniture, e: ThreeEvent<PointerEvent>) {
    e.stopPropagation()
    if (toolMode === 'select') { onSelectItem(item.id); return }
    activateDrag(item, e.clientX, e.clientY)
  }

  function startDragFromButton(item: PlacedFurniture, e: React.PointerEvent) {
    e.stopPropagation()
    e.preventDefault()
    if (toolMode === 'select') { onSelectItem(item.id); return }
    activateDrag(item, e.clientX, e.clientY)
  }

  function commitDrag() {
    const id = draggingIdRef.current
    if (!id) return
    const item = furnitureRef.current.find((f) => f.id === id)
    if (item) {
      if (toolMode === 'move') {
        moveFurniture(id, dragPosRef.current.x * 1000, dragPosRef.current.z * 1000, item.rotation)
      } else if (toolMode === 'rotate') {
        moveFurniture(id, item.x, item.y, dragRotRef.current)
      } else if (toolMode === 'scale') {
        resizeFurniture(id, dragScaleRef.current)
      }
    }
    draggingIdRef.current = null
    setDraggingId(null)
    if (controlsRef.current) controlsRef.current.enabled = true
    document.body.style.cursor = ''
  }

  useEffect(() => {
    if (!draggingId) return
    const canvas = gl.domElement

    const handleMove = (e: PointerEvent) => {
      if (toolMode === 'move') {
        const rect = canvas.getBoundingClientRect()
        const ndc = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        )
        raycaster.setFromCamera(ndc, camera)
        if (!raycaster.ray.intersectPlane(floorPlane, hitPoint.current)) return
        const { w, d } = dragHalfRef.current
        const halfW = roomW / 2
        const halfD = roomD / 2
        const snap = 0.05
        const rawX = Math.max(-halfW + w, Math.min(halfW - w, hitPoint.current.x))
        const rawZ = Math.max(-halfD + d, Math.min(halfD - d, hitPoint.current.z))
        const x = Math.round(rawX / snap) * snap
        const z = Math.round(rawZ / snap) * snap
        // Only update position if it doesn't overlap another item
        if (!wouldCollide(draggingIdRef.current!, x, z)) {
          dragPosRef.current.set(x, 0, z)
        }
      } else if (toolMode === 'rotate') {
        const deltaX = e.clientX - rotateStartXRef.current
        const rawRot = rotateStartAngleRef.current - deltaX * (Math.PI / 120)
        const step = 5 * (Math.PI / 180)
        dragRotRef.current = Math.round(rawRot / step) * step
      } else if (toolMode === 'scale') {
        const deltaY = scaleStartYRef.current - e.clientY // drag up = bigger
        // Generous bounds: unit-misdetected imports may need large corrections
        const newScale = Math.max(0.05, Math.min(20, scaleStartValueRef.current * Math.pow(2, deltaY / 200)))
        dragScaleRef.current = newScale
      }
    }

    canvas.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', commitDrag)
    return () => {
      canvas.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', commitDrag)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingId, toolMode, roomW, roomD])

  return (
    <>
      {/* An item whose entry no longer resolves — its uploaded model was
          deleted from the library — must render NOTHING. Drawing it anyway
          made it fall through to the catalog fallback model below, leaving a
          phantom table set standing where the deleted furniture had been. */}
      {furniture.filter((item) => !!resolveEntry(item.furniture_id)).map((item) => (
        <Suspense key={item.id} fallback={null}>
          <DraggableFurnitureItem
            item={item}
            isDragging={draggingId === item.id}
            isSelected={selectedId === item.id}
            toolMode={toolMode}
            dragPosRef={dragPosRef}
            dragRotRef={dragRotRef}
            dragScaleRef={dragScaleRef}
            onMeshPointerDown={(e) => startDragFromMesh(item, e)}
            onButtonPointerDown={(e) => startDragFromButton(item, e)}
            onFootprint={handleFootprint}
            selectedPartKey={selectedPart?.itemId === item.id ? selectedPart.partKey : null}
            onSelectPart={onSelectPart}
          />
        </Suspense>
      ))}
    </>
  )
}
