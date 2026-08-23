/**
 * The room's shadow-blocking shell.
 *
 * The room you see is made of planes. `WALL_T` is 0, so each wall is a single
 * zero-thickness quad and the ceiling is one more, all meeting exactly
 * edge-to-edge. That is fine to look at and hopeless as an occluder, for two
 * reasons that together are the sunlight running down the inside of every
 * corner and along the ceiling join:
 *
 *   • `shadow.normalBias` displaces every receiver sample along its own normal
 *     before it reads the shadow map. A point 2 cm from a corner is therefore
 *     tested 2 cm *through* the neighbouring wall, finds no occluder, and comes
 *     back lit. With zero thickness there is nothing for the displaced sample
 *     to land inside of.
 *   • The cutaway hides walls, and three skips invisible objects when it
 *     renders the shadow map — so hiding a wall also stopped it being a wall as
 *     far as the sun was concerned, and opened a hole in the side of the
 *     building. (`WallFade` no longer hides that way; see diorama.tsx.)
 *
 * So the sun is blocked by a separate solid: real slabs with thickness, sitting
 * outside the visible faces, lapping over each other at every corner and under
 * the roof, with the door and window openings cut out so daylight still comes
 * in where it should. It writes neither colour nor depth, which makes it
 * invisible from every angle and unable to change the cutaway; it exists only
 * in the shadow map. It is mounted outside `<WallFade>` on purpose — a wall
 * hidden by the cutaway must stop being drawn without stopping being a wall.
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeBufferGeometries } from 'three-stdlib'

/** Opening already resolved to millimetres from the wall's start. */
export type ResolvedElMm = {
  position: number
  width: number
  height: number
  sill_height: number
}

/**
 * Slab thickness, metres. Thick enough that `normalBias` cannot step a sample
 * through it (it is an order of magnitude larger), thin enough that the shadow
 * the room casts on the ground outside does not visibly grow.
 */
export const SHELL_T = 0.12

const noRaycast = () => {}

/**
 * The solid parts of one wall — everything the openings leave behind.
 *
 * `offAlong` is measured from the slab's centre, matching how the visible wall
 * segments are placed, so an opening lands in the same world position in both.
 */
function wallBoxes(
  lengthM: number,
  heightM: number,
  thickness: number,
  axis: 'X' | 'Z',
  cx: number,
  cz: number,
  elements: ResolvedElMm[],
): THREE.BufferGeometry[] {
  const s = 1 / 1000
  const boxes: THREE.BufferGeometry[] = []
  const totalMm = lengthM * 1000

  const push = (offAlong: number, cy: number, w: number, h: number) => {
    if (w <= 0 || h <= 0) return
    const b = new THREE.BoxGeometry(
      axis === 'X' ? w : thickness,
      h,
      axis === 'X' ? thickness : w,
    )
    b.translate(
      axis === 'X' ? cx + offAlong : cx,
      cy,
      axis === 'X' ? cz : cz + offAlong,
    )
    boxes.push(b)
  }

  const sorted = [...elements].sort((a, b) => a.position - b.position)
  let cursor = 0
  for (const el of sorted) {
    const left = el.position
    const right = el.position + el.width
    const headM = (el.sill_height + el.height) * s
    // Pier to the left of the opening
    if (left > cursor) {
      push(((cursor + left) / 2 - totalMm / 2) * s, heightM / 2, (left - cursor) * s, heightM)
    }
    // Lintel above it
    if (headM < heightM) {
      push(((left + right) / 2 - totalMm / 2) * s, headM + (heightM - headM) / 2, el.width * s, heightM - headM)
    }
    // Spandrel below a window
    if (el.sill_height > 0) {
      push(((left + right) / 2 - totalMm / 2) * s, (el.sill_height * s) / 2, el.width * s, el.sill_height * s)
    }
    cursor = right
  }
  if (cursor < totalMm) {
    push(((cursor + totalMm) / 2 - totalMm / 2) * s, heightM / 2, (totalMm - cursor) * s, heightM)
  }
  return boxes
}

export interface ShellSpec {
  /** Interior extents. Wall inner faces sit at ±W/2 and ±D/2, floor at y = 0. */
  W: number
  D: number
  H: number
  /** Openings resolved over the wall's own interior span, in mm. */
  elementsA: ResolvedElMm[]
  elementsB: ResolvedElMm[]
  elementsC: ResolvedElMm[]
  elementsD: ResolvedElMm[]
}

/**
 * The whole shell as one merged geometry. Pure, so it can be reasoned about
 * (and tested) without a renderer.
 */
export function buildShellGeometry({
  W, D, H, elementsA, elementsB, elementsC, elementsD,
}: ShellSpec): THREE.BufferGeometry | null {
  const t = SHELL_T
  const shiftMm = Math.round(t * 1000)
  // Every slab is `t` longer at each end than the span its openings were
  // measured over, so shifting the openings by the same amount keeps them where
  // they were while the slab reaches into the corners.
  const shift = (els: ResolvedElMm[]) => els.map((e) => ({ ...e, position: e.position + shiftMm }))
  // Walls run past the ceiling line so the roof laps over them rather than
  // meeting them along a line a shadow sample could slip through.
  const wallH = H + t

  const boxes = [
    // Back / front — full outer width, so they cover the corner squares
    ...wallBoxes(W + 2 * t, wallH, t, 'X', 0, -(D / 2 + t / 2), shift(elementsA)),
    ...wallBoxes(W + 2 * t, wallH, t, 'X', 0, D / 2 + t / 2, shift(elementsC)),
    // Right / left — full outer depth, so they cover the same corners again
    ...wallBoxes(D + 2 * t, wallH, t, 'Z', W / 2 + t / 2, 0, shift(elementsB)),
    ...wallBoxes(D + 2 * t, wallH, t, 'Z', -(W / 2 + t / 2), 0, shift(elementsD)),
  ]

  // Roof: sits in the top `t` of all four walls, overlapping every one.
  const roof = new THREE.BoxGeometry(W + 2 * t, t, D + 2 * t)
  roof.translate(0, H + t / 2, 0)
  boxes.push(roof)

  if (boxes.length === 0) return null
  const merged = mergeBufferGeometries(boxes)
  for (const b of boxes) b.dispose()
  return merged
}

export function ShadowShell({
  W, D, H, elementsA, elementsB, elementsC, elementsD,
}: ShellSpec) {
  // Merging geometries is not something to redo on every render, and the arrays
  // arrive with a fresh identity each time. Their contents are a few small
  // numbers, so comparing them as text is far cheaper than rebuilding.
  const openingsKey = JSON.stringify([elementsA, elementsB, elementsC, elementsD])

  const geo = useMemo(() => {
    const [eA, eB, eC, eD] = JSON.parse(openingsKey) as ResolvedElMm[][]
    return buildShellGeometry({ W, D, H, elementsA: eA, elementsB: eB, elementsC: eC, elementsD: eD })
  }, [W, D, H, openingsKey])

  if (!geo) return null
  return (
    <mesh geometry={geo} castShadow raycast={noRaycast}>
      {/*
        Invisible, but not `visible = false` — that would take it out of the
        shadow map too, which is the whole bug this exists to fix. Writing
        neither colour nor depth leaves it in every pass except the picture.

        DoubleSide is load-bearing here rather than decorative: three derives
        the depth pass's side from the material's, and a FrontSide box renders
        only its back faces into the shadow map, which would start each shadow
        12 cm behind the surface that actually blocks the light.
      */}
      <meshBasicMaterial colorWrite={false} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  )
}
