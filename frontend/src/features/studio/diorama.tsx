/**
 * Cutaway building blocks for the 3D studio.
 *
 * Walls facing the camera hide (auto mode) or are fixed-hidden (diorama mode)
 * so the interior reads like an architectural cutaway model.
 *
 * The room used to be framed like a museum model — a near-black walnut trim
 * capping every wall top, four posts down the outer corners and a dark slab
 * under the floor. It drew hard black bars across the picture, so the frame is
 * gone and the walls simply end where they end.
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
export const SHELL_PLASTER = '#D8CDBE'   // outer shell / cut faces

// Fixed pair removed in diorama presentation mode (camera lives in +X/+Z quadrant)
const DIORAMA_HIDDEN: ReadonlySet<string> = new Set(['B', 'C'])

// Outward normals of the four legacy walls
const WALL_NORMALS: Record<string, [number, number]> = {
  A: [0, -1], // -Z
  C: [0, 1],  // +Z
  B: [1, 0],  // +X
  D: [-1, 0], // -X
}

type ResolvedElMm = { position: number; width: number; height: number; sill_height: number }

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

interface FadeOriginal {
  transparent: boolean
  opacity: number
  depthWrite: boolean
  colorWrite: boolean
}

/**
 * Smoothly fades its children in/out (~200ms) by mutating material state in
 * useFrame — no React re-renders during the ramp.
 *
 * A fully-hidden wall is hidden at the *material*, never with `visible = false`.
 * Three skips invisible objects when it renders the shadow map, so a wall
 * hidden that way stops casting — and the cutaway, which exists to open one
 * side of the room to the camera, was also opening it to the sun. The result
 * was daylight pouring in through walls that were still standing, pooling in
 * the corners and along the ceiling join. Writing neither colour nor depth
 * removes the wall from the picture and leaves it in the shadow map, which is
 * what the cutaway actually means.
 */
export function WallFade({ hidden, children }: { hidden: boolean; children: React.ReactNode }) {
  const group = useRef<THREE.Group>(null)
  const opacity = useRef(1)
  // Set while anything has been touched, so the fully-shown steady state costs
  // nothing at all — which is every wall whenever the cutaway is off.
  const touched = useRef(false)

  useFrame((_, dt) => {
    const g = group.current
    if (!g) return
    const target = hidden ? 0 : 1

    if (opacity.current !== target) {
      const step = dt / 0.2   // ~200 ms ramp
      opacity.current = target === 0
        ? Math.max(0, opacity.current - step)
        : Math.min(1, opacity.current + step)
      touched.current = true
    } else if (opacity.current === 1 && !touched.current) {
      return
    }

    // Re-walked every frame while hidden or ramping rather than cached: a wall
    // can have its covering or its openings changed while it is hidden, and a
    // material created after the ramp started would otherwise never be told.
    applyFade(g, opacity.current)
    if (opacity.current === 1) touched.current = false
  })

  return <group ref={group}>{children}</group>
}

function applyFade(g: THREE.Group, opacity: number) {
  g.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of list) {
      if (m.userData.__fadeOrig === undefined) {
        m.userData.__fadeOrig = {
          transparent: m.transparent,
          opacity: m.opacity,
          depthWrite: m.depthWrite,
          colorWrite: m.colorWrite,
        } satisfies FadeOriginal
      }
      const orig = m.userData.__fadeOrig as FadeOriginal
      if (opacity === 1) {
        m.transparent = orig.transparent
        m.opacity = orig.opacity
        m.depthWrite = orig.depthWrite
        m.colorWrite = orig.colorWrite
      } else if (opacity === 0) {
        // Gone from the picture, still standing in the shadow map.
        m.transparent = orig.transparent
        m.opacity = orig.opacity
        m.colorWrite = false
        m.depthWrite = false
      } else {
        m.transparent = true
        m.colorWrite = true
        m.depthWrite = opacity > 0.5
        m.opacity = opacity * orig.opacity
      }
    }
    // A wall you cannot see is a wall you cannot click through to what is
    // behind it. `visible = false` used to take care of this for free.
    mesh.raycast = opacity === 0 ? noRaycast : THREE.Mesh.prototype.raycast
  })
}

const noRaycast = () => {}

// ─── Solid wall body ──────────────────────────────────────────────────────────

interface WallBodyProps {
  length: number      // metres
  height: number
  thickness: number
  axis: 'X' | 'Z'
  cx: number
  cz: number
  elements: ResolvedElMm[]  // resolved positions in mm (same input as <Wall>)
}

/**
 * The structural wall volume: merged boxes around door/window openings so the
 * cut faces read as real 10–25cm wall sections from outside. Sits 2mm behind
 * the interior covering planes to avoid z-fighting.
 */
export function WallBody({ length, height, thickness, axis, cx, cz, elements }: WallBodyProps) {
  const geo = useMemo(() => {
    const s = 1 / 1000
    const t = thickness - 0.004
    // Shift the body 2mm away from the room interior
    const outDir = axis === 'X' ? (cz <= 0 ? -1 : 1) : (cx >= 0 ? 1 : -1)
    const boxes: THREE.BufferGeometry[] = []

    const push = (offAlong: number, cy: number, w: number, h: number) => {
      const b = new THREE.BoxGeometry(
        axis === 'X' ? w : t,
        h,
        axis === 'X' ? t : w,
      )
      const px = axis === 'X' ? cx + offAlong : cx + outDir * 0.002
      const pz = axis === 'X' ? cz + outDir * 0.002 : cz + offAlong
      b.translate(px, cy, pz)
      boxes.push(b)
    }

    const sorted = [...elements].sort((a, b) => a.position - b.position)
    let cursor = 0
    const totalMm = length * 1000
    for (const el of sorted) {
      const elLeft = el.position
      const elRight = el.position + el.width
      const elTop = el.sill_height + el.height
      if (elLeft > cursor) {
        push(((cursor + elLeft) / 2 - totalMm / 2) * s, height / 2, (elLeft - cursor) * s, height)
      }
      const elTopM = elTop * s
      if (elTopM < height) {
        push(((elLeft + elRight) / 2 - totalMm / 2) * s, elTopM + (height - elTopM) / 2, el.width * s, height - elTopM)
      }
      if (el.sill_height > 0) {
        push(((elLeft + elRight) / 2 - totalMm / 2) * s, (el.sill_height * s) / 2, el.width * s, el.sill_height * s)
      }
      cursor = elRight
    }
    if (cursor < totalMm) {
      push(((cursor + totalMm) / 2 - totalMm / 2) * s, height / 2, (totalMm - cursor) * s, height)
    }
    if (boxes.length === 0) return null
    const merged = mergeBufferGeometries(boxes)
    for (const b of boxes) b.dispose()
    return merged
  }, [length, height, thickness, axis, cx, cz, elements])

  if (!geo) return null
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial color={SHELL_PLASTER} roughness={0.9} metalness={0} />
    </mesh>
  )
}
