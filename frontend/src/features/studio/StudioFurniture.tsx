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
import {
  resolveFurnitureMove, resolveFurnitureRotation,
  type Obstacle, type OrientedFootprint,
} from '@/lib/furnitureCollision'
import { holdCameraStill, swallowPickClick } from '@/lib/pickEvents'
import { useHoldToDelete } from "@/hooks/useHoldToDelete";
import { SelectionOutline } from "./SelectionOutline";
import type { PlacedFurniture, UserFurnitureEntry } from "@/store/roomStore";
import { FURNITURE_CATALOG } from "@/lib/furnitureCatalog";
import { resolveCatalogEntry } from "@/lib/furnitureEntry";
import { planPolygon, offsetPolygon } from "@/lib/planPolygon";
import { roomExtents } from "@/lib/roomDims";
import {
  halfExtentsToBounds, FUR_WALL_GAP,
  worldToPlan, planToWorld, type RoomBounds,
} from "@/lib/furnitureBounds";
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

/**
 * The catalogue/library entry a placement refers to.
 *
 * `resolveCatalogEntry` rather than `catalogToFurnitureEntry` because the
 * RETURNED OBJECT'S IDENTITY is load-bearing here: it is a dependency of the
 * `useMemo` that holds the model's `scene.clone(true)`, and a clone that is
 * rebuilt on every render costs the model its click handling. See the doc
 * comment on resolveCatalogEntry for the whole chain.
 */
function useFurnitureEntry(furnitureId: string): AnyFurnitureEntry | undefined {
  const userFurniture = useRoomStore((s) => s.userFurniture)
  const catalogFurniture = useRoomStore((s) => s.catalogFurniture)
  return (
    FURNITURE_CATALOG.find((f) => f.id === furnitureId) ??
    userFurniture.find((f) => f.id === furnitureId) ??
    resolveCatalogEntry(catalogFurniture.find((f) => f.id === furnitureId))
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
  // Only user-imported models are worth reporting on — catalog GLBs are known good
  const debugLabel = entry && 'blobId' in entry ? entry.id : undefined
  // Depends on `debugLabel` (a string), NOT on `entry` (an object): the clone's
  // own identity has to survive an ordinary re-render, or react-three-fiber
  // reconstructs the <primitive> around a new object and the model loses the
  // click that keeps a tap from falling through to the wall behind it. See
  // lib/furnitureEntry.ts for the bug that came of it.
  const cloned = useMemo(() => {
    const c = scene.clone(true)
    applyHiddenParts(c, item.hiddenParts)
    prepareMesh(c, debugLabel)
    return c
  }, [scene, debugLabel, item.hiddenParts]);

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

// NOTE: this module used to eagerly `useGLTF.preload()` every catalog GLB the
// instant it loaded (i.e. whenever the studio chunk loads — including for
// tabs like "Chiroqlar"/lighting that never render furniture at all). That
// force-fetched the entire catalog (4.4MB+ per model on disk) up front.
// Each <FurnitureItem>/<DraggableFurnitureItem> already calls useGLTF(modelPath)
// itself, and drei caches by URL — so removing this just makes loading lazy
// (on first actual placement/render) instead of eager. Every call site is
// already wrapped in a <Suspense> boundary (see ThreeDPage, PlacementPage,
// WalkthroughPage, SharedRoomPage), so this is a pure perf change.

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
  displayInfo,
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
  displayInfo: { name: string; priceUzs: number | null }
  /** Active part key when this item owns the current part selection */
  selectedPartKey: string | null
  onSelectPart: (part: SelectedPart | null) => void
}) {
  const entry = useFurnitureEntry(item.furniture_id)
  const modelPath = entry?.modelPath ?? ''
  const { scene } = useGLTF(modelPath || '/models/table_boconcept_hauge.glb')
  // Only user-imported models are worth reporting on — catalog GLBs are known good
  const debugLabel = entry && 'blobId' in entry ? entry.id : undefined
  // Depends on `debugLabel` (a string), NOT on `entry` (an object): the clone's
  // own identity has to survive an ordinary re-render, or react-three-fiber
  // reconstructs the <primitive> around a new object and the model loses the
  // click that keeps a tap from falling through to the wall behind it. See
  // lib/furnitureEntry.ts for the bug that came of it.
  const cloned = useMemo(() => {
    const c = scene.clone(true)
    applyHiddenParts(c, item.hiddenParts)
    prepareMesh(c, debugLabel)
    return c
  }, [scene, debugLabel, item.hiddenParts])
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
  const { yOffUnit, geomHW, geomHD, geomHH } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(cloned)
    const ok = isFinite(box.min.x)
    return {
      yOffUnit: ok ? -box.min.y : 0,
      geomHW: ok ? (box.max.x - box.min.x) / 2 : 0.3,
      geomHD: ok ? (box.max.z - box.min.z) / 2 : 0.3,
      geomHH: ok ? (box.max.y - box.min.y) / 2 : 0.5,
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
      // restore the outline after a live-scale drag hid it
      if (selRef.current && !selRef.current.visible) selRef.current.visible = true
      return
    }
    if ((toolMode === 'move' || toolMode === 'select') && groupRef.current && dragPosRef.current) {
      groupRef.current.position.x = dragPosRef.current.x
      groupRef.current.position.z = dragPosRef.current.z
    } else if (toolMode === 'rotate' && primitiveRef.current && dragRotRef.current !== null) {
      primitiveRef.current.rotation.y = dragRotRef.current
      // A turn against a wall shifts the model off it; show that as it
      // happens rather than letting the model jump when the drag is let go.
      if (groupRef.current && dragPosRef.current) {
        groupRef.current.position.x = dragPosRef.current.x
        groupRef.current.position.z = dragPosRef.current.z
      }
      // keep the selection cage glued to the model during live rotation
      if (selRef.current) selRef.current.rotation.y = dragRotRef.current
    } else if (toolMode === 'scale' && primitiveRef.current && entry) {
      const liveScale = effScale * (dragScaleRef.current ?? 1)
      primitiveRef.current.scale.setScalar(liveScale)
      // the outline is built at the committed scale — hide it while
      // live-scaling rather than let it drift off the model
      if (selRef.current) selRef.current.visible = false
    }
  })

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
  // In 'select' mode, an already-selected item is directly draggable (see
  // startDragFromMesh) — 'grab' signals that, same as 'move' mode; a
  // not-yet-selected item just gets the plain 'pointer' selection cursor.
  const meshCursor = toolMode === 'select' ? (isSelected ? 'grab' : 'pointer')
                   : toolMode === 'part'   ? 'crosshair'
                   : toolMode === 'rotate' ? 'ew-resize'
                   : toolMode === 'scale'  ? 'ns-resize'
                   : 'grab'

  return (
    <group ref={groupRef} position={[item.x / 1000, 0, item.y / 1000]}>
      <primitive
        ref={primitiveRef}
        object={cloned}
        position={[0, yOff, 0]}
        rotation={[0, item.rotation, 0]}
        scale={s}
        onPointerDown={toolMode === 'part' ? handlePartClick : onMeshPointerDown}
        onClick={swallowPickClick}
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
      {/* Selection outline — rotates WITH the model, and is hidden by the
          same frame loop while a live scale drag is in flight. */}
      {isSelected && (
        <group ref={selRef} rotation={[0, item.rotation, 0]}>
          <SelectionOutline object={cloned} scale={s} position={[0, yOff, 0]} rotationY={0} />
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

      {/* What this is — name, footprint, price — shown on selection alone, in
          any tool mode. Deleting is not offered here any more: it is a press
          and hold on the model itself, which is far harder to hit by accident
          than a red button sitting under the thumb throughout a drag. */}
      {isSelected && (
        <Html position={[0, buttonH + 0.22, 0]} center zIndexRange={[110, 0]} style={{ pointerEvents: 'none' }}>
          <div
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              pointerEvents: 'all', background: 'white', borderRadius: 12, padding: '10px 12px', minWidth: 150,
              boxShadow: '0 6px 20px rgba(0,0,0,.18)', whiteSpace: 'nowrap', textAlign: 'center',
            }}
          >
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#111827' }}>{displayInfo.name}</p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6B7280' }}>
              {fw.toFixed(2)} × {fd.toFixed(2)} m
              {displayInfo.priceUzs != null && ` · ${displayInfo.priceUzs.toLocaleString('uz-UZ')} so'm`}
            </p>
          </div>
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
  onDelete,
  selectedPart,
  onSelectPart,
}: {
  controlsRef: RefObject<OrbitControlsImpl | null>
  roomW: number
  roomD: number
  toolMode: ToolMode
  selectedId: string | null
  onSelectItem: (id: string) => void
  onDelete: (id: string) => void
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
  /** The dragged model's own half-extents, metres, UNROTATED. The resolver
   *  turns them itself — a bounding box big enough to hold a model at every
   *  angle is bigger than the model at any of them, and the difference is a
   *  gap against the wall. */
  const dragHalfRef = useRef({ w: 0.3, d: 0.3 })
  const rotateStartXRef = useRef(0)
  const scaleStartYRef = useRef(0)
  const scaleStartValueRef = useRef(1)
  const rotateStartAngleRef = useRef(0)
  const geometry = useRoomStore((s) => s.geometry)
  // The walls the drag actually has to respect. `roomW`/`roomD` are the room's
  // BOUNDING extents, which for a drawn or scanned room describe a rectangle
  // the room merely fits inside — clamping to it let a model be pushed into
  // the notch of an L, through two walls. The outline (inset by the wall gap)
  // is the room itself; a legacy A-B-C-D rectangle has none and keeps the
  // plain per-axis clamp.
  const roomBounds = useMemo<RoomBounds>(() => {
    const poly = planPolygon(geometry)
    // For a polygon the extents must come from the same call planPolygon
    // makes, or the plan frame this converts into would be offset from the
    // one the outline is expressed in and the clamp would fence off the
    // wrong strip of floor. The roomW/roomD props carry a caller's fallback
    // and are only right for the legacy rectangle, which needs no outline.
    const ext = poly ? roomExtents(geometry) : { W: roomW, D: roomD }
    return {
      W: ext.W * 1000,
      D: ext.D * 1000,
      inner: poly ? offsetPolygon(poly, -FUR_WALL_GAP) : null,
      outline: poly ? poly.vertices : null,
    }
  }, [geometry, roomW, roomD])

  const { bind: holdBind } = useHoldToDelete()
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
      resolveCatalogEntry(catalogFurniture.find((f) => f.id === furnitureId))
    )
  }

  // Display info for the selected-item panel below — a placed instance only
  // carries a name/price snapshot for user uploads (see PlacedFurniture's own
  // doc comment); a do'kon catalog placement has to look its name/price up
  // by furniture_id instead, same as AddObjectSheet's own furniture list does.
  function resolveDisplayInfo(item: PlacedFurniture): { name: string; priceUzs: number | null } {
    if (item.name) return { name: item.name, priceUzs: item.unitPriceUzs ?? null }
    const catalogItem = catalogFurniture.find((f) => f.id === item.furniture_id)
    if (catalogItem) return { name: catalogItem.name_uz, priceUzs: catalogItem.price_uzs }
    const userItem = (userFurniture as UserFurnitureEntry[]).find((f) => f.id === item.furniture_id)
    if (userItem) return { name: userItem.name, priceUzs: null }
    return { name: 'Mebel', priceUzs: null }
  }

  /**
   * Everything else standing in the room, as footprints the resolver can test
   * against — each at its own angle, measured from its real geometry rather
   * than its catalogue size.
   *
   * A model whose GLB has not loaded has reported no footprint yet and is left
   * out: an unknown shape is better treated as absent than as a guess, which
   * would fence off floor that may well be empty.
   */
  function obstaclesFor(skipId: string): Obstacle[] {
    const out: Obstacle[] = []
    for (const f of furnitureRef.current) {
      if (f.id === skipId) continue
      const fp = footprintsRef.current.get(f.id)
      if (!fp) continue
      out.push({
        at: worldToPlan({ x: f.x / 1000, z: f.y / 1000 }, roomBounds),
        box: { ...halfExtentsToBounds(fp.hw * 1000, fp.hd * 1000), rotation: f.rotation },
      })
    }
    return out
  }

  /** The dragged model's footprint, in the plan's millimetres, at `rotation`. */
  function dragBox(rotation: number): OrientedFootprint {
    const { w, d } = dragHalfRef.current
    return { ...halfExtentsToBounds(w * 1000, d * 1000), rotation }
  }

  function activateDrag(item: PlacedFurniture, clientX: number, clientY = 0) {
    onSelectItem(item.id)
    // 'select' mode reaching here only happens via the already-selected-item
    // bypass above — there's no rotate/scale affordance in that mode, so a
    // plain drag always means reposition, exactly like 'move' mode.
    if (toolMode === 'move' || toolMode === 'select') {
      // Prefer actual geometry footprint; fall back to catalog sizeM
      const fp = footprintsRef.current.get(item.id)
      const entry = resolveEntry(item.furniture_id)
      const so = item.scaleOverride ?? 1
      const hw0 = fp?.hw ?? (entry?.sizeM.w ?? 0.6) * so / 2
      const hd0 = fp?.hd ?? (entry?.sizeM.d ?? 0.6) * so / 2
      dragHalfRef.current = { w: hw0, d: hd0 }
      document.body.style.cursor = 'grabbing'
    } else if (toolMode === 'rotate') {
      // Turning needs the footprint too: a model may only turn into space it
      // can actually occupy.
      const fp = footprintsRef.current.get(item.id)
      const entry = resolveEntry(item.furniture_id)
      const so = item.scaleOverride ?? 1
      dragHalfRef.current = {
        w: fp?.hw ?? (entry?.sizeM.w ?? 0.6) * so / 2,
        d: fp?.hd ?? (entry?.sizeM.d ?? 0.6) * so / 2,
      }
      rotateStartXRef.current = clientX
      rotateStartAngleRef.current = item.rotation
      document.body.style.cursor = 'ew-resize'
    } else if (toolMode === 'scale') {
      const so = item.scaleOverride ?? 1
      scaleStartYRef.current = clientY
      scaleStartValueRef.current = so
      dragScaleRef.current = so
      document.body.style.cursor = 'ns-resize'
    }
    // Position and angle are both live in every mode: a move has to know which
    // way the model faces, and a turn may have to shift it to find the room.
    dragPosRef.current.set(item.x / 1000, 0, item.y / 1000)
    dragRotRef.current = item.rotation
    draggingIdRef.current = item.id
    setDraggingId(item.id)
    if (controlsRef.current) controlsRef.current.enabled = false
  }

  // A press on an already-selected item starts dragging immediately, even in
  // 'select' mode — no toolbar switch to 'move' needed first. Matches the
  // same fix already shipped for ceiling lights (LightingComponents.tsx) and
  // wall openings (WallOpenings.tsx): first press on an unselected item only
  // selects it (selectedId hasn't updated yet for this render), a
  // subsequent press on the now-selected item drags it. Non-select tool
  // modes (move/rotate/scale) are unaffected — they already dragged on the
  // very first press.
  function startDragFromMesh(item: PlacedFurniture, e: ThreeEvent<PointerEvent>) {
    e.stopPropagation()
    // Hold to delete rides along with the drag: it gives way as soon as the
    // finger travels, so this still drags exactly as it did.
    holdBind({
      label: resolveDisplayInfo(item).name,
      onDelete: () => onDelete(item.id),
    }).onPointerDown(e)
    if (toolMode === 'select' && selectedId !== item.id) {
      onSelectItem(item.id)
      // The press that selects must not also orbit the camera.
      holdCameraStill(controlsRef.current)
      return
    }
    activateDrag(item, e.clientX, e.clientY)
  }

  function startDragFromButton(item: PlacedFurniture, e: React.PointerEvent) {
    e.stopPropagation()
    e.preventDefault()
    // The handle is the model: holding it deletes, exactly as holding the
    // model does. It was the one way of grabbing a model that could not.
    holdBind({
      label: resolveDisplayInfo(item).name,
      onDelete: () => onDelete(item.id),
    }).onPointerDown(e)
    if (toolMode === 'select' && selectedId !== item.id) {
      onSelectItem(item.id)
      holdCameraStill(controlsRef.current)
      return
    }
    activateDrag(item, e.clientX, e.clientY)
  }

  function commitDrag() {
    const id = draggingIdRef.current
    if (!id) return
    const item = furnitureRef.current.find((f) => f.id === id)
    if (item) {
      if (toolMode === 'move' || toolMode === 'select') {
        moveFurniture(id, dragPosRef.current.x * 1000, dragPosRef.current.z * 1000, item.rotation)
      } else if (toolMode === 'rotate') {
        // Position too: turning against a wall shifts the model off it, and
        // committing the old position would put it back through the wall.
        moveFurniture(id, dragPosRef.current.x * 1000, dragPosRef.current.z * 1000, dragRotRef.current)
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
      if (toolMode === 'move' || toolMode === 'select') {
        const rect = canvas.getBoundingClientRect()
        const ndc = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        )
        raycaster.setFromCamera(ndc, camera)
        if (!raycaster.ray.intersectPlane(floorPlane, hitPoint.current)) return
        // No grid snap: the model follows the finger, and the resolver below
        // is what stops it. Rounding to 50 mm first put a model up to half a
        // step away from the wall it was pushed against and made a slow drag
        // move in visible jumps.
        //
        // The resolver works in the plan's frame (mm from the room's corner);
        // the drag works in world metres about the room's centre.
        const fitted = resolveFurnitureMove(
          worldToPlan({ x: dragPosRef.current.x, z: dragPosRef.current.z }, roomBounds),
          worldToPlan({ x: hitPoint.current.x, z: hitPoint.current.z }, roomBounds),
          dragBox(dragRotRef.current),
          roomBounds,
          obstaclesFor(draggingIdRef.current!),
        )
        const { x, z } = planToWorld(fitted, roomBounds)
        dragPosRef.current.set(x, 0, z)
      } else if (toolMode === 'rotate') {
        const deltaX = e.clientX - rotateStartXRef.current
        const rawRot = rotateStartAngleRef.current - deltaX * (Math.PI / 120)
        const step = 5 * (Math.PI / 180)
        const wantRot = Math.round(rawRot / step) * step
        // A model may only turn into room it can actually occupy. If turning
        // in place would put a corner through a wall or into the next model,
        // the resolver shifts it off by as little as will do; if nothing will,
        // it keeps the angle it had rather than letting it sweep through.
        const solved = resolveFurnitureRotation(
          worldToPlan({ x: dragPosRef.current.x, z: dragPosRef.current.z }, roomBounds),
          dragBox(wantRot),
          wantRot,
          roomBounds,
          obstaclesFor(draggingIdRef.current!),
        )
        if (solved) {
          dragRotRef.current = solved.rotation
          const w = planToWorld(solved.at, roomBounds)
          dragPosRef.current.set(w.x, 0, w.z)
        }
      } else if (toolMode === 'scale') {
        const deltaY = scaleStartYRef.current - e.clientY // drag up = bigger
        // Generous bounds: unit-misdetected imports may need large corrections
        const newScale = Math.max(0.05, Math.min(20, scaleStartValueRef.current * Math.pow(2, deltaY / 200)))
        dragScaleRef.current = newScale
      }
    }

    // Movement is watched on the WINDOW, not on the canvas. R3F mounts every
    // <Html> overlay — the model's own name card, the drag handle, a door's
    // button, the dimension labels — as a SIBLING of the canvas, above it. A
    // pointermove whose target is one of those never reaches a listener on the
    // canvas, so the dragged thing froze the moment the finger crossed its own
    // label and started again on the far side. That is the drag "lag".
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', commitDrag)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', commitDrag)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingId, toolMode, roomBounds])

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
            displayInfo={resolveDisplayInfo(item)}
          />
        </Suspense>
      ))}
    </>
  )
}
