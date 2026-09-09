/**
 * Small schematic previews for the ceiling design picker.
 *
 * Each icon is a side cross-section — the room seen from the side, walls left
 * and right, structural slab on top — with the ceiling design's own profile
 * drawn below it. Not a 3D render, just enough of a silhouette that the six
 * options read as six different shapes before anyone reads a label.
 *
 * The frame (walls + slab) is identical across all six so only the profile
 * line changes, and that line is always the same stroke weight in the brand
 * colour so the set reads as one family.
 */

import type { ReactElement } from 'react'
import type { CeilingDesignId } from './ceilingDesigns'

const VB_W = 64
const VB_H = 44
const WALL_L = 6
const WALL_R = 58
const SLAB_Y = 4
const FLOOR_Y = 40

/** Structural slab + side walls, greyed out so the profile line owns the eye. */
function RoomFrame() {
  return (
    <g stroke="currentColor" className="text-gray-300" strokeWidth={1.5} fill="none">
      <line x1={WALL_L} y1={SLAB_Y} x2={WALL_R} y2={SLAB_Y} />
      <line x1={WALL_L} y1={SLAB_Y} x2={WALL_L} y2={FLOOR_Y} />
      <line x1={WALL_R} y1={SLAB_Y} x2={WALL_R} y2={FLOOR_Y} />
    </g>
  )
}

/** The one line every icon varies — the ceiling's own profile. */
function Profile({ d }: { d: string }) {
  return (
    <path
      d={d}
      className="stroke-brand"
      strokeWidth={2}
      fill="none"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  )
}

/** A short dashed run — used for the floating design's perimeter gap. */
function GapMark({ x, y1, y2 }: { x: number; y1: number; y2: number }) {
  return (
    <line
      x1={x}
      y1={y1}
      x2={x}
      y2={y2}
      className="stroke-brand/50"
      strokeWidth={1.25}
      strokeDasharray="1.5 1.5"
    />
  )
}

// ─── Per-design profiles ──────────────────────────────────────────────────────
// All share the same drop level (y=10) for a first layer where they have one,
// so the only thing that differs is where the line steps, and by how much.

const DROP_Y = 10
const DEEP_Y = 18
const STEP_IN = 14
const STEP_IN_R = VB_W - STEP_IN

function FlatProfile(): ReactElement {
  // Plain flush rectangle: the whole ceiling steps down once, edge to edge.
  return <Profile d={`M${WALL_L},${SLAB_Y} L${WALL_L},${DROP_Y} L${WALL_R},${DROP_Y} L${WALL_R},${SLAB_Y}`} />
}

function DoubleLayerProfile(): ReactElement {
  // Two nested steps: the full-width first layer, then a narrower, deeper
  // second box in the middle of it.
  return (
    <Profile
      d={`M${WALL_L},${SLAB_Y} L${WALL_L},${DROP_Y} L${STEP_IN},${DROP_Y} L${STEP_IN},${DEEP_Y} L${STEP_IN_R},${DEEP_Y} L${STEP_IN_R},${DROP_Y} L${WALL_R},${DROP_Y} L${WALL_R},${SLAB_Y}`}
    />
  )
}

function FloatingProfile(): ReactElement {
  // An island panel with clear air all round — drawn detached from both
  // walls, with a dashed gap line standing in for the reveal.
  const panelL = STEP_IN
  const panelR = STEP_IN_R
  return (
    <>
      <Profile d={`M${panelL},${DROP_Y} L${panelR},${DROP_Y}`} />
      <GapMark x={panelL - 3} y1={SLAB_Y} y2={DROP_Y} />
      <GapMark x={panelR + 3} y1={SLAB_Y} y2={DROP_Y} />
    </>
  )
}

function BorderProfile(): ReactElement {
  // A ring that steps down only at the perimeter; the middle stays flush
  // with the slab — the opposite emphasis from the double layer.
  return (
    <Profile
      d={`M${WALL_L},${SLAB_Y} L${WALL_L},${DROP_Y} L${STEP_IN},${DROP_Y} L${STEP_IN},${SLAB_Y} L${STEP_IN_R},${SLAB_Y} L${STEP_IN_R},${DROP_Y} L${WALL_R},${DROP_Y} L${WALL_R},${SLAB_Y}`}
    />
  )
}

function NonDropProfile(): ReactElement {
  // The "do nothing" option — a single flush line at slab level, no profile.
  return <Profile d={`M${WALL_L},${SLAB_Y} L${WALL_R},${SLAB_Y}`} />
}

function RecessedProfile(): ReactElement {
  // Mostly flat, but with a thin inset groove just inside each edge.
  const grooveW = 5
  const grooveDepth = 3
  const l1 = STEP_IN
  const l2 = l1 + grooveW
  const r2 = STEP_IN_R
  const r1 = r2 - grooveW
  return (
    <Profile
      d={
        `M${WALL_L},${SLAB_Y} L${WALL_L},${DROP_Y} L${l1},${DROP_Y} ` +
        `L${l1},${DROP_Y + grooveDepth} L${l2},${DROP_Y + grooveDepth} L${l2},${DROP_Y} ` +
        `L${r1},${DROP_Y} L${r1},${DROP_Y + grooveDepth} L${r2},${DROP_Y + grooveDepth} L${r2},${DROP_Y} ` +
        `L${WALL_R},${DROP_Y} L${WALL_R},${SLAB_Y}`
      }
    />
  )
}

const PROFILES: Record<CeilingDesignId, () => ReactElement> = {
  flat: FlatProfile,
  double_layer: DoubleLayerProfile,
  floating: FloatingProfile,
  border: BorderProfile,
  non_drop: NonDropProfile,
  recessed: RecessedProfile,
}

export function CeilingPreview({
  designId,
  className,
}: {
  designId: CeilingDesignId
  className?: string
}) {
  const ProfileFor = PROFILES[designId] ?? NonDropProfile
  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className={className ?? 'w-12 h-8'}
      aria-hidden="true"
    >
      <RoomFrame />
      <ProfileFor />
    </svg>
  )
}
