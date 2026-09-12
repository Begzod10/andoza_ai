/**
 * WallOpenings — the interactive editing layer for windows & doors, rendered
 * on top of the (visual-only) WindowFrames/DoorFrames. It owns:
 *   • selection (tap an opening once to select it — the width/height/sill/
 *     style/delete panel lives in DoorLeaves.tsx's WindowEditor/DoorEditor,
 *     which opens automatically on selection, so this layer has no toolbar
 *     of its own)
 *   • free-drag move (once selected, press-and-drag anywhere on the opening
 *     to reposition it along the wall in real time; window = X+Y, door = X
 *     only, bottom on floor)
 *   • live meter dimension labels while selected (window: 4, door: 2) —
 *     shown as soon as the opening is selected, not only while dragging
 *   • Canva-style magenta alignment guides + snapping to sibling openings
 *   • edge clamping + no-overlap
 *
 * Everything is expressed in each wall's LOCAL frame — `position` (mm along the
 * wall from its left edge) and `sill_height` (mm above the floor). A drag only
 * ever writes those two numbers back via updateElement(wallId, …), so an
 * opening can never leave its wall.
 *
 * Perf note: a pointer drag commits to the store via updateElement exactly
 * ONCE, on pointerup — never on every pointermove. Live drag position lives
 * in `liveDragRef` (see below) and is read directly during render (already
 * re-triggered every pointermove by the pre-existing `setGuides` call), so
 * the dragged opening's own visuals stay fully live without touching
 * Zustand's `geometry` — which every other 3D/panel consumer also reads —
 * on every frame of the gesture.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import type { RoomGeometry, WallElement } from '@/store/roomStore'
import { liveOpeningDrag } from '@/lib/liveOpeningDrag'

export interface OpeningSel { wallId: string; elId: string }

interface WallDef {
  id: string
  axis: 'X' | 'Z'
  /** world position of the wall's inner face on the OTHER axis */
  face: number
  /** along-axis world coordinate of the wall's LEFT edge (position = 0) */
  leftAlong: number
  length: number
  ry: number
  normal: THREE.Vector3
  plane: THREE.Plane
}

const SNAP_M = 0.03 // 3 cm alignment threshold
// Keyboard nudge step for a selected opening's position — matches the
// resize steppers' existing ±100mm convention (there is no drag "grid" for
// position; the pointer drag is continuous).
const KEYBOARD_NUDGE_MM = 100

function buildWallDefs(W: number, D: number): Record<string, WallDef> {
  return {
    A: { id: 'A', axis: 'X', face: -D / 2, leftAlong: -W / 2, length: W, ry: 0, normal: new THREE.Vector3(0, 0, 1), plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), D / 2) },
    C: { id: 'C', axis: 'X', face: D / 2, leftAlong: -W / 2, length: W, ry: Math.PI, normal: new THREE.Vector3(0, 0, -1), plane: new THREE.Plane(new THREE.Vector3(0, 0, -1), D / 2) },
    B: { id: 'B', axis: 'Z', face: W / 2, leftAlong: -D / 2, length: D, ry: -Math.PI / 2, normal: new THREE.Vector3(-1, 0, 0), plane: new THREE.Plane(new THREE.Vector3(-1, 0, 0), W / 2) },
    D: { id: 'D', axis: 'Z', face: -W / 2, leftAlong: -D / 2, length: D, ry: Math.PI / 2, normal: new THREE.Vector3(1, 0, 0), plane: new THREE.Plane(new THREE.Vector3(1, 0, 0), W / 2) },
  }
}

/** World coordinates of a point on the wall face at along-offset `alongM` (from
 *  left edge) and height `yM`, nudged `push` metres into the room. */
function toWorld(wd: WallDef, alongM: number, yM: number, push = 0): [number, number, number] {
  const along = wd.leftAlong + alongM
  const n = wd.normal
  if (wd.axis === 'X') return [along + n.x * push, yM, wd.face + n.z * push]
  return [wd.face + n.x * push, yM, along + n.z * push]
}

const s = 1 / 1000

export function WallOpenings({
  geometry, W, D, H, hiddenWalls, selected, onSelect, updateElement, removeElement, onInteracting,
}: {
  geometry: RoomGeometry
  W: number; D: number; H: number
  hiddenWalls?: ReadonlySet<string>
  selected: OpeningSel | null
  onSelect: (sel: OpeningSel | null) => void
  updateElement: (wallId: string, elId: string, patch: Partial<Omit<WallElement, 'id'>>) => void
  removeElement: (wallId: string, elId: string) => void
  onInteracting: (active: boolean) => void
}) {
  const defs = useMemo(() => buildWallDefs(W, D), [W, D])
  const dragging = useRef(false)
  const [guides, setGuides] = useState<Array<{ kind: 'h' | 'v'; wallId: string; at: number }>>([])

  // ── Live-drag position (perf) ───────────────────────────────────────
  // The whole gesture writes to the store exactly ONCE, on pointerup.
  // While dragging, the live position/sill_height live only in this ref —
  // never in Zustand — so every pointermove does NOT trigger a full
  // `geometry` rebuild (which would cascade re-renders through every other
  // consumer of `geometry`: ThreeDPage, RoomScene, DesignPanel's
  // WallSection/SuvoqSection/WallPanelGenerator, …). The `setGuides(g)` call
  // in `onMove` already re-renders this component on every pointermove (it
  // always did, even before this fix), so reading this ref during render
  // is enough to keep the dragged opening's visuals — hit-plane, selection
  // border, dimension labels — perfectly live without any extra store write
  // or extra re-render source.
  const liveDragRef = useRef<{ wallId: string; elId: string; position: number; sill_height: number } | null>(null)

  // Selection-border plane geometry is only ever needed for the single
  // currently-selected opening, so a one-slot cache keyed on its (width,
  // height) is enough to stop `new THREE.PlaneGeometry(...)` from being
  // reallocated on every re-render while dragging (mirrors the per-segment
  // memoization WallComponents.tsx uses — this can't be a real `useMemo`
  // because the geometry is built inside a `.map()` callback, not a
  // component, so hooks aren't available here).
  const edgesPlaneCache = useRef<{ key: string; geo: THREE.PlaneGeometry } | null>(null)
  function getEdgesPlane(widthM: number, heightM: number): THREE.PlaneGeometry {
    const key = `${widthM}:${heightM}`
    const cached = edgesPlaneCache.current
    if (cached && cached.key === key) return cached.geo
    cached?.geo.dispose()
    const geo = new THREE.PlaneGeometry(widthM, heightM)
    edgesPlaneCache.current = { key, geo }
    return geo
  }
  // Dispose the last cached instance when this layer unmounts (e.g. leaving
  // the 3D view) — the per-key disposal inside getEdgesPlane only handles
  // the "dimensions changed" case, not final teardown.
  useEffect(() => () => { edgesPlaneCache.current?.geo.dispose() }, [])

  // ── Drag maths ───────────────────────────────────────────────────────
  function computeDrag(wd: WallDef, el: WallElement, hit: THREE.Vector3): { position: number; sill_height: number; guides: Array<{ kind: 'h' | 'v'; wallId: string; at: number }> } {
    const isDoor = el.type === 'eshik'
    const wallLenMm = wd.length * 1000
    const wallHMm = H * 1000
    const along = wd.axis === 'X' ? hit.x : hit.z
    const uMm = (along - wd.leftAlong) * 1000

    let position = uMm - el.width / 2
    let sill = isDoor ? 0 : hit.y * 1000 - el.height / 2

    const siblings = (geometry.walls.find((w) => w.id === wd.id)?.elements ?? []).filter((e) => e.id !== el.id)
    const activeGuides: Array<{ kind: 'h' | 'v'; wallId: string; at: number }> = []

    // ── Vertical (Y) snap — windows only ──
    if (!isDoor) {
      const myEdges = { bottom: sill, center: sill + el.height / 2, top: sill + el.height }
      for (const sib of siblings) {
        const sibEdges = [sib.sill_height, sib.sill_height + sib.height / 2, sib.sill_height + sib.height]
        for (const mv of [myEdges.bottom, myEdges.center, myEdges.top]) {
          for (const sv of sibEdges) {
            if (Math.abs(mv - sv) < SNAP_M * 1000) {
              // Snap the whole window so that edge lands on the sibling's edge.
              const delta = sv - mv
              sill += delta
              myEdges.bottom += delta; myEdges.center += delta; myEdges.top += delta
              activeGuides.push({ kind: 'h', wallId: wd.id, at: sv })
            }
          }
        }
      }
    }

    // ── Horizontal (X) snap — both ──
    {
      let myL = position, myC = position + el.width / 2, myR = position + el.width
      for (const sib of siblings) {
        const sibL = sib.position, sibC = sib.position + sib.width / 2, sibR = sib.position + sib.width
        const mine = { left: myL, center: myC, right: myR }
        const theirs = { left: sibL, center: sibC, right: sibR }
        for (const mv of Object.values(mine)) {
          for (const sv of Object.values(theirs)) {
            if (Math.abs(mv - sv) < SNAP_M * 1000) {
              const delta = sv - mv
              position += delta; myL += delta; myC += delta; myR += delta
              activeGuides.push({ kind: 'v', wallId: wd.id, at: sv })
            }
          }
        }
      }
    }

    // ── No-overlap in X against siblings whose Y-range overlaps ──
    const myTop = sill + el.height, myBot = sill
    let minRight = wallLenMm, maxLeft = 0
    for (const sib of siblings) {
      const sTop = sib.sill_height + sib.height, sBot = sib.sill_height
      const yOverlap = myTop > sBot && myBot < sTop
      if (!yOverlap) continue
      const sibL = sib.position, sibR = sib.position + sib.width
      const myCenter = position + el.width / 2
      if (sibR <= myCenter) maxLeft = Math.max(maxLeft, sibR)
      else if (sibL >= myCenter) minRight = Math.min(minRight, sibL)
    }
    position = Math.max(maxLeft, Math.min(minRight - el.width, position))

    // ── Final edge clamps ──
    position = Math.max(0, Math.min(wallLenMm - el.width, position))
    if (!isDoor) sill = Math.max(0, Math.min(wallHMm - el.height, sill))

    return { position, sill_height: sill, guides: activeGuides }
  }

  function onDown(e: ThreeEvent<PointerEvent>, el: WallElement) {
    e.stopPropagation()
    if (!(selected && selected.elId === el.id)) return
    dragging.current = true
    onInteracting(true)
    ;(e.target as Element)?.setPointerCapture?.(e.pointerId)
  }
  function onMove(e: ThreeEvent<PointerEvent>, wd: WallDef, el: WallElement) {
    if (!dragging.current || !(selected && selected.elId === el.id)) return
    e.stopPropagation()
    const hit = new THREE.Vector3()
    if (!e.ray.intersectPlane(wd.plane, hit)) return
    // Collision/edge clamping (computeDrag) still runs on every pointermove
    // — that's cheap and drives the live visual feedback below. What no
    // longer happens here is a store write: the result goes into a ref, not
    // into `updateElement`, so this does not touch `geometry` at all.
    const { position, sill_height, guides: g } = computeDrag(wd, el, hit)
    liveDragRef.current = { wallId: wd.id, elId: el.id, position, sill_height }
    // Second write target — see liveOpeningDrag.ts's header comment. Same
    // value, same moment, so WindowFrames/DoorFrames/OpeningLeaves never
    // desync from WallOpenings' own hit-plane/selection border/labels.
    liveOpeningDrag.current = { wallId: wd.id, elId: el.id, position, sill_height }
    setGuides(g)
  }
  function onUp(e: ThreeEvent<PointerEvent>) {
    if (!dragging.current) return
    dragging.current = false
    onInteracting(false)
    setGuides([])
    // The ONE store write for the whole drag gesture — the final position.
    const live = liveDragRef.current
    if (live) updateElement(live.wallId, live.elId, { position: live.position, sill_height: live.sill_height })
    liveDragRef.current = null
    liveOpeningDrag.current = null
    ;(e.target as Element)?.releasePointerCapture?.(e.pointerId)
  }

  const walls = geometry.walls.filter((w) => defs[w.id] && !hiddenWalls?.has(w.id))

  return (
    <>
      {walls.flatMap((w) => {
        const wd = defs[w.id]
        return w.elements.map((el) => {
          if (el.type !== 'deraza' && el.type !== 'eshik' && el.type !== 'balkon') return null
          const isDoor = el.type === 'eshik'
          const isSel = selected?.wallId === w.id && selected?.elId === el.id
          // While THIS element is the one being dragged, render from the
          // live ref instead of the (intentionally stale, until pointerup)
          // store value — everything below reads `liveEl`, never `el`, for
          // anything position/sill_height related.
          const live = liveDragRef.current
          const liveEl: WallElement = live && live.wallId === w.id && live.elId === el.id
            ? { ...el, position: live.position, sill_height: live.sill_height }
            : el
          const centerAlongM = (liveEl.position + liveEl.width / 2) * s
          const centerY = (liveEl.sill_height + liveEl.height / 2) * s
          const [px, py, pz] = toWorld(wd, centerAlongM, centerY, 0.02)
          return (
            <group key={`op-${w.id}-${el.id}`}>
              {/* Invisible (faint when selected) hit plane for select + drag */}
              <mesh
                position={[px, py, pz]}
                rotation={[0, wd.ry, 0]}
                onClick={(e) => { e.stopPropagation(); onSelect({ wallId: w.id, elId: el.id }); }}
                onPointerDown={(e) => onDown(e, el)}
                onPointerMove={(e) => onMove(e, wd, el)}
                onPointerUp={onUp}
                onPointerCancel={onUp}
              >
                <planeGeometry args={[el.width * s, el.height * s]} />
                <meshBasicMaterial color="#2E5BFF" transparent opacity={isSel ? 0.18 : 0} depthWrite={false} side={THREE.DoubleSide} />
              </mesh>

              {/* Keyboard path to mesh selection: three.js meshes have no
                  native DOM focus, so this renders a real (invisible)
                  <button> anchored at the opening's centre via <Html>. Tab
                  reaches it, Enter/Space is the browser's native button
                  activation (calling the same onSelect the mesh's onClick
                  uses), arrows nudge position via the same updateElement the
                  drag handler calls, and Delete/Backspace calls
                  removeElement directly — independent of the width/height/
                  sill/style/delete panel that DoorLeaves.tsx's
                  WindowEditor/DoorEditor already shows on selection. */}
              <Html position={[px, py, pz]} center zIndexRange={[200, 0]} style={{ pointerEvents: 'none' }}>
                <button
                  type="button"
                  aria-label={`${isDoor ? 'Eshik' : el.type === 'balkon' ? 'Balkon eshigi' : 'Deraza'} — ${w.id} devor. Tanlash: Enter, ko'chirish: strelkalar, o'chirish: Delete`}
                  onClick={() => onSelect({ wallId: w.id, elId: el.id })}
                  onKeyDown={(e) => {
                    const wallLenMm = wd.length * 1000
                    switch (e.key) {
                      case 'ArrowLeft':
                      case 'ArrowUp':
                        e.preventDefault()
                        updateElement(w.id, el.id, { position: clampPosition(el, wallLenMm, -KEYBOARD_NUDGE_MM) })
                        break
                      case 'ArrowRight':
                      case 'ArrowDown':
                        e.preventDefault()
                        updateElement(w.id, el.id, { position: clampPosition(el, wallLenMm, KEYBOARD_NUDGE_MM) })
                        break
                      case 'Delete':
                      case 'Backspace':
                        e.preventDefault()
                        removeElement(w.id, el.id)
                        if (isSel) onSelect(null)
                        break
                    }
                  }}
                  style={{
                    width: 28, height: 28, padding: 0, margin: 0,
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    pointerEvents: 'auto',
                  }}
                />
              </Html>

              {/* Selection border */}
              {isSel && (
                <lineSegments position={[px, py, pz]} rotation={[0, wd.ry, 0]}>
                  <edgesGeometry args={[getEdgesPlane(el.width * s, el.height * s)]} />
                  <lineBasicMaterial color="#2E5BFF" />
                </lineSegments>
              )}

              {/* Live meter dimension labels — shown as soon as the opening
                  is selected (matching the ceiling-lights behaviour), and
                  already reads `liveEl`, so they keep updating live once a
                  drag starts without needing a separate "while dragging"
                  gate. Width/height/sill/style/delete live in DoorLeaves.tsx's
                  WindowEditor/DoorEditor panel, not here. */}
              {isSel && (
                <DimensionLabels wd={wd} el={liveEl} W={W} D={D} H={H} isDoor={isDoor} />
              )}
            </group>
          )
        })
      })}

      {/* Magenta alignment guides across the wall */}
      {guides.map((g, i) => {
        const wd = defs[g.wallId]
        if (!wd) return null
        if (g.kind === 'h') {
          // horizontal line across the wall at height at/1000
          const y = g.at * s
          const a = toWorld(wd, 0, y, 0.03)
          const b = toWorld(wd, wd.length, y, 0.03)
          return <GuideLine key={`g${i}`} a={a} b={b} />
        }
        // vertical line at along = at/1000, full height
        const along = g.at * s
        const a = toWorld(wd, along, 0, 0.03)
        const b = toWorld(wd, along, H, 0.03)
        return <GuideLine key={`g${i}`} a={a} b={b} />
      })}
    </>
  )
}

/** New position (mm) after a keyboard ±delta, clamped to the wall's bounds.
 *  Unlike the pointer drag's computeDrag, this does not re-run the sibling
 *  no-overlap/snap logic — it is a simple bounded nudge, not a full re-drag. */
function clampPosition(el: WallElement, wallLenMm: number, deltaMm: number): number {
  return Math.max(0, Math.min(wallLenMm - el.width, el.position + deltaMm))
}

function GuideLine({ a, b, color = '#FF2E9A' }: { a: [number, number, number]; b: [number, number, number]; color?: string }) {
  // Built as a real THREE.Line and mounted via <primitive> to sidestep the
  // JSX intrinsic `<line>` colliding with the DOM SVG line typings.
  const obj = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(a[0], a[1], a[2]),
      new THREE.Vector3(b[0], b[1], b[2]),
    ])
    return new THREE.Line(g, new THREE.LineBasicMaterial({ color }))
  }, [a, b, color])
  return <primitive object={obj} />
}

/** The dimension lines + meter labels: window → 4 (left/right/floor/ceiling),
 *  door → 2 (left/right). */
function DimensionLabels({ wd, el, H, isDoor }: { wd: WallDef; el: WallElement; W: number; D: number; H: number; isDoor: boolean }) {
  const leftM = el.position * s
  const rightM = wd.length - (el.position + el.width) * s
  const floorM = el.sill_height * s
  const ceilM = H - (el.sill_height + el.height) * s
  const cx = (el.position + el.width / 2) * s
  const cy = (el.sill_height + el.height / 2) * s
  const leftEdge = el.position * s
  const rightEdge = (el.position + el.width) * s
  const botY = el.sill_height * s
  const topY = (el.sill_height + el.height) * s

  const items: Array<{ a: [number, number, number]; b: [number, number, number]; mid: [number, number, number]; val: number }> = [
    { a: toWorld(wd, 0, cy, 0.03), b: toWorld(wd, leftEdge, cy, 0.03), mid: toWorld(wd, leftEdge / 2, cy, 0.05), val: leftM },
    { a: toWorld(wd, rightEdge, cy, 0.03), b: toWorld(wd, wd.length, cy, 0.03), mid: toWorld(wd, (rightEdge + wd.length) / 2, cy, 0.05), val: rightM },
  ]
  if (!isDoor) {
    items.push(
      { a: toWorld(wd, cx, 0, 0.03), b: toWorld(wd, cx, botY, 0.03), mid: toWorld(wd, cx, botY / 2, 0.05), val: floorM },
      { a: toWorld(wd, cx, topY, 0.03), b: toWorld(wd, cx, H, 0.03), mid: toWorld(wd, cx, (topY + H) / 2, 0.05), val: ceilM },
    )
  }

  return (
    <>
      {items.map((it, i) => (
        <group key={i}>
          <GuideLine a={it.a} b={it.b} />
          <Html position={it.mid} center zIndexRange={[210, 0]}>
            <div style={{ background: '#1A2340', color: 'white', fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 6, whiteSpace: 'nowrap' }}>
              {Math.max(0, it.val).toFixed(2)} m
            </div>
          </Html>
        </group>
      ))}
    </>
  )
}
