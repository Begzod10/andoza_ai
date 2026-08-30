/**
 * Cutaway diorama building blocks for the 3D studio.
 *
 * The room is presented as an open box: solid wall bodies with a dark walnut
 * "picture frame" trim along the exposed edges, sitting on a floor slab.
 * Walls facing the camera hide (auto mode) or are fixed-hidden (diorama mode)
 * so the interior reads like an architectural cutaway model.
 *
 * All geometry is procedural from room dimensions and merged into single
 * meshes per part — no per-segment meshes.
 */
import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeBufferGeometries } from 'three-stdlib'

export type CutawayMode = 'off' | 'auto' | 'diorama'

// ─── Style constants (Phase 3 palette will re-export these) ──────────────────
export const TRIM_COLOR = '#2B2622'      // near-black walnut
export const TRIM_ROUGHNESS = 0.55
export const TRIM_SIZE = 0.05            // 5 cm profile
export const SLAB_HEIGHT = 0.12          // 12 cm floor slab

// Fixed pair removed in diorama presentation mode (camera lives in +X/+Z quadrant)
const DIORAMA_HIDDEN: ReadonlySet<string> = new Set(['B', 'C'])

// Outward normals of the four legacy walls
const WALL_NORMALS: Record<string, [number, number]> = {
  A: [0, -1], // -Z
  C: [0, 1],  // +Z
  B: [1, 0],  // +X
  D: [-1, 0], // -X
}

// ─── Hidden-wall tracking ─────────────────────────────────────────────────────

/**
 * Which walls should currently be hidden. React state updates only when the
 * set actually changes (crossing an azimuth threshold), not every frame.
 * Hysteresis prevents flicker at the boundary.
 */
export function useHiddenWalls(mode: CutawayMode): ReadonlySet<string> {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set())
  const current = useRef<ReadonlySet<string>>(hidden)

  useFrame(({ camera }) => {
    let next: Set<string>
    if (mode === 'off') {
      if (current.current.size === 0) return
      next = new Set()
    } else if (mode === 'diorama') {
      if (setsEqual(current.current, DIORAMA_HIDDEN)) return
      next = new Set(DIORAMA_HIDDEN)
    } else {
      // auto: hide walls whose outward normal points toward the camera
      const vx = camera.position.x
      const vz = camera.position.z
      const len = Math.hypot(vx, vz) || 1
      const nx = vx / len
      const nz = vz / len
      next = new Set<string>()
      for (const id of ['A', 'B', 'C', 'D']) {
        const [wx, wz] = WALL_NORMALS[id]
        const dot = wx * nx + wz * nz
        const wasHidden = current.current.has(id)
        // hysteresis: hide above 0.30, unhide below 0.22
        if (dot > (wasHidden ? 0.22 : 0.3)) next.add(id)
      }
      if (setsEqual(current.current, next)) return
    }
    current.current = next
    setHidden(next)
  })

  return hidden
}

function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

// ─── Fade wrapper ─────────────────────────────────────────────────────────────

interface FadeState {
  mats: THREE.Material[]
  opacity: number
}

/**
 * Smoothly fades its children in/out (~200ms) by mutating material opacity in
 * useFrame — no React re-renders during the ramp. Assumes materials are unique
 * per mesh (true for the studio's JSX-created materials).
 */
export function WallFade({ hidden, children }: { hidden: boolean; children: React.ReactNode }) {
  const group = useRef<THREE.Group>(null)
  const fade = useRef<FadeState>({ mats: [], opacity: 1 })

  useFrame((_, dt) => {
    const g = group.current
    if (!g) return
    const f = fade.current
    const target = hidden ? 0 : 1
    if (Math.abs(f.opacity - target) < 0.001) {
      if (target === 1 && f.mats.length) restore(f)
      g.visible = target !== 0
      return
    }
    // (Re)collect materials at the start of a ramp — children may have changed
    if (f.mats.length === 0) {
      g.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const m of list) {
          if (m.userData.__fadeOrig === undefined) {
            m.userData.__fadeOrig = { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite }
          }
          f.mats.push(m)
        }
      })
    }
    g.visible = true
    // ~200ms linear ramp
    const step = dt / 0.2
    f.opacity = target === 0 ? Math.max(0, f.opacity - step) : Math.min(1, f.opacity + step)
    for (const m of f.mats) {
      m.transparent = true
      m.depthWrite = f.opacity > 0.5
      m.opacity = f.opacity * ((m.userData.__fadeOrig?.opacity as number) ?? 1)
    }
    if (f.opacity === 0) g.visible = false
  })

  return <group ref={group}>{children}</group>
}

function restore(f: FadeState) {
  for (const m of f.mats) {
    const orig = m.userData.__fadeOrig as { transparent: boolean; opacity: number; depthWrite: boolean } | undefined
    if (orig) {
      m.transparent = orig.transparent
      m.opacity = orig.opacity
      m.depthWrite = orig.depthWrite
    }
  }
  f.mats = []
}

// ─── Trim pieces ──────────────────────────────────────────────────────────────

function trimMaterial() {
  return <meshStandardMaterial color={TRIM_COLOR} roughness={TRIM_ROUGHNESS} metalness={0} />
}

/** Dark cap running along the top of one wall (overhangs the profile slightly). */
export function WallTopRim({ length, thickness, axis, cx, cz, height }: {
  length: number; thickness: number; axis: 'X' | 'Z'; cx: number; cz: number; height: number
}) {
  const tr = TRIM_SIZE
  const w = axis === 'X' ? length + 2 * tr : thickness + 2 * tr
  const d = axis === 'X' ? thickness + 2 * tr : length + 2 * tr
  return (
    <mesh position={[cx, height + tr / 2, cz]} castShadow>
      <boxGeometry args={[w, tr, d]} />
      {trimMaterial()}
    </mesh>
  )
}

/** Four vertical posts on the outer corners — the frame silhouette. */
export function CornerPosts({ W, D, T, H }: { W: number; D: number; T: number; H: number }) {
  const geo = useMemo(() => {
    const s = TRIM_SIZE * 2
    const boxes: THREE.BufferGeometry[] = []
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const b = new THREE.BoxGeometry(s, H + TRIM_SIZE, s)
        b.translate(sx * (W / 2 + T - s / 2), (H + TRIM_SIZE) / 2, sz * (D / 2 + T - s / 2))
        boxes.push(b)
      }
    }
    const merged = mergeBufferGeometries(boxes)
    for (const b of boxes) b.dispose()
    return merged
  }, [W, D, T, H])

  if (!geo) return null
  return (
    <mesh geometry={geo} castShadow>
      {trimMaterial()}
    </mesh>
  )
}

/** Dark slab under the floor so the room reads as a floating box. */
export function FloorSlab({ W, D, T }: { W: number; D: number; T: number }) {
  return (
    <mesh position={[0, -SLAB_HEIGHT / 2, 0]} receiveShadow castShadow>
      <boxGeometry args={[W + 2 * T, SLAB_HEIGHT, D + 2 * T]} />
      {trimMaterial()}
    </mesh>
  )
}
