import * as THREE from 'three'
import { toCreasedNormals } from 'three-stdlib'

/**
 * Milled trim profiles — the cross-sections behind the floor skirting
 * (plintus) and, on the same machinery, the ceiling cornice (galtel).
 *
 * A profile is a closed 2D outline drawn in a NORMALISED 1×1 box:
 *   x — projection away from the wall: 0 = flat against the wall face,
 *       1 = the full configured width (thickness) out into the room
 *   y — run up the wall face: 0 = at the junction (floor for a skirting),
 *       1 = the full configured height
 * The outline is scaled to the user's millimetres at build time, so one
 * catalogue entry serves every size. A profile drawn with circular beads
 * therefore stretches into ellipses when height and width are dialled to an
 * unusual ratio — the same liberty a real catalogue takes when it sells one
 * silhouette in several sizes.
 *
 * Outlines run COUNTER-CLOCKWISE (bottom edge left→right, up the milled face,
 * back along the top, down the wall side) so the extruded solid comes out with
 * its faces pointing outward.
 */

// ─── Path building ────────────────────────────────────────────────────────────

/** One step of a profile outline: a straight line, or a cubic Bézier when the
 *  moulding curves. Cubics are how these shapes are drawn on a millwork sheet,
 *  and they sample to any smoothness we ask for. */
type Step =
  | { to: [number, number] }
  | { to: [number, number]; c1: [number, number]; c2: [number, number] }

interface ProfilePath {
  start: [number, number]
  steps: Step[]
}

function cubic(
  p0: [number, number], c1: [number, number], c2: [number, number], p1: [number, number], t: number,
): [number, number] {
  const u = 1 - t
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t
  return [
    a * p0[0] + b * c1[0] + c * c2[0] + d * p1[0],
    a * p0[1] + b * c1[1] + c * c2[1] + d * p1[1],
  ]
}

/** Flatten a path to a point list. Curves are sampled `curveSegs` times; the
 *  end point of each step is emitted exactly once so the outline stays closed
 *  and free of duplicate vertices. */
function samplePath(path: ProfilePath, curveSegs: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [path.start]
  let cur = path.start
  for (const step of path.steps) {
    if ('c1' in step) {
      for (let i = 1; i <= curveSegs; i++) pts.push(cubic(cur, step.c1, step.c2, step.to, i / curveSegs))
    } else {
      pts.push(step.to)
    }
    cur = step.to
  }
  return pts
}

// ─── Catalogue ────────────────────────────────────────────────────────────────

export type TrimKind = 'skirting' | 'cornice'

export interface TrimProfileDef {
  id: string
  /** Shown under the thumbnail — the millwork catalogue's own code, so the
   *  user can match what they picked against the printed sheet. */
  label: string
  kind: TrimKind
  path: ProfilePath
  /** Metric sizes rounded from the sheet's imperial dimensions. */
  defaultHeightMm: number
  defaultWidthMm: number
}

/**
 * Floor skirting, after the B525 millwork sheet: a tall flat back with the
 * milled detail worked into the top third — ogees, beads and coves over a
 * plain face. `tekis` is the plain square-edge board the studio drew before
 * this picker existed, kept first and default so existing rooms are untouched.
 */
const SKIRTING_PROFILES: TrimProfileDef[] = [
  {
    id: 'tekis',
    label: 'Tekis',
    kind: 'skirting',
    defaultHeightMm: 100,
    defaultWidthMm: 20,
    path: { start: [0, 0], steps: [{ to: [1, 0] }, { to: [1, 1] }, { to: [0, 1] }] },
  },
  {
    id: 'b052',
    label: 'B525-052',
    kind: 'skirting',
    defaultHeightMm: 40,
    defaultWidthMm: 18,
    path: {
      start: [0, 0],
      steps: [
        { to: [1, 0] },
        { to: [1, 0.50] },                                           // plain face
        { to: [0.82, 0.56] },                                        // step back
        { to: [0.80, 0.74], c1: [1.06, 0.58], c2: [1.06, 0.72] },    // bead
        { to: [0.72, 0.76] },
        { to: [0.18, 1], c1: [0.80, 0.92], c2: [0.10, 0.86] },       // ogee
        { to: [0, 1] },
      ],
    },
  },
  {
    id: 'b054',
    label: 'B525-054',
    kind: 'skirting',
    defaultHeightMm: 45,
    defaultWidthMm: 18,
    path: {
      start: [0, 0],
      steps: [
        { to: [1, 0] },
        { to: [1, 0.42] },
        { to: [0.84, 0.48] },
        { to: [0.66, 0.70], c1: [0.98, 0.56], c2: [0.60, 0.58] },    // lower ogee
        { to: [0.62, 0.72] },
        { to: [0.14, 1], c1: [0.86, 0.90], c2: [0.06, 0.84] },       // upper ogee
        { to: [0, 1] },
      ],
    },
  },
  {
    id: 'b055',
    label: 'B525-055',
    kind: 'skirting',
    defaultHeightMm: 50,
    defaultWidthMm: 16,
    path: {
      start: [0, 0],
      steps: [
        { to: [1, 0] },
        { to: [1, 0.46] },
        { to: [0.82, 0.52] },
        { to: [0.80, 0.68], c1: [1.05, 0.54], c2: [1.05, 0.66] },    // bead
        { to: [0.70, 0.72] },
        { to: [0.16, 1], c1: [0.82, 0.90], c2: [0.08, 0.85] },       // ogee
        { to: [0, 1] },
      ],
    },
  },
  {
    id: 'b056',
    label: 'B525-056',
    kind: 'skirting',
    defaultHeightMm: 50,
    defaultWidthMm: 19,
    path: {
      start: [0, 0],
      steps: [
        { to: [1, 0] },
        { to: [1, 0.34] },
        { to: [0.22, 1], c1: [0.95, 0.70], c2: [0.70, 1.0] },        // one long cove
        { to: [0, 1] },
      ],
    },
  },
  {
    id: 'b053',
    label: 'B525-053',
    kind: 'skirting',
    defaultHeightMm: 75,
    defaultWidthMm: 18,
    path: {
      start: [0, 0],
      steps: [
        { to: [1, 0] },
        { to: [1, 0.38] },
        { to: [0.80, 0.42] },
        { to: [0.80, 0.56], c1: [1.04, 0.44], c2: [1.04, 0.54] },    // lower bead
        { to: [0.78, 0.58] },
        { to: [0.78, 0.72], c1: [1.02, 0.60], c2: [1.02, 0.70] },    // upper bead
        { to: [0.72, 0.76] },
        { to: [0.16, 1], c1: [0.84, 0.92], c2: [0.08, 0.86] },       // ogee
        { to: [0, 1] },
      ],
    },
  },
]

export const TRIM_PROFILES: TrimProfileDef[] = [...SKIRTING_PROFILES]

export function trimProfilesOf(kind: TrimKind): TrimProfileDef[] {
  return TRIM_PROFILES.filter((p) => p.kind === kind)
}

export function trimProfileDef(id: string | undefined, kind: TrimKind): TrimProfileDef {
  const list = trimProfilesOf(kind)
  return list.find((p) => p.id === id) ?? list[0]
}

// ─── Stored state ─────────────────────────────────────────────────────────────

/**
 * What the design stores for one trim run. `undefined` means "never touched" —
 * for the skirting that reads as ON with the default profile, so rooms drawn
 * before this picker existed keep the board they always had. `null` means the
 * user deliberately took it off.
 */
export interface TrimState {
  id: string
  /** How far up the wall, in mm. Falls back to the profile's own default. */
  heightMm?: number
  /** How far off the wall, in mm. Falls back to the profile's own default. */
  widthMm?: number
}

export interface ResolvedTrim {
  def: TrimProfileDef
  heightM: number
  widthM: number
}

/** Fill a stored choice out to real metres, applying per-profile defaults. */
export function resolveTrim(state: TrimState | null | undefined, kind: TrimKind): ResolvedTrim {
  const def = trimProfileDef(state?.id, kind)
  return {
    def,
    heightM: (state?.heightMm ?? def.defaultHeightMm) / 1000,
    widthM: (state?.widthMm ?? def.defaultWidthMm) / 1000,
  }
}

export const TRIM_HEIGHT_RANGE_MM = { skirting: { min: 30, max: 200 }, cornice: { min: 30, max: 160 } } as const
export const TRIM_WIDTH_RANGE_MM = { skirting: { min: 10, max: 40 }, cornice: { min: 20, max: 140 } } as const

// ─── Geometry ─────────────────────────────────────────────────────────────────

/** Sampling density along each curve. Twelve is enough that an ogee's
 *  highlight reads as a sweep rather than a set of steps, while keeping a
 *  whole room's trim to a few thousand triangles. */
const CURVE_SEGS = 12

/** Above this angle an edge stays sharp; below it the shading is smoothed, so
 *  the milled curves catch light continuously while the arrises stay crisp. */
const CREASE_ANGLE = Math.PI / 5   // 36°

/** Cache: the same profile at the same size and length recurs on every wall of
 *  a room, and rebuilding an extrusion per segment per frame is wasteful. */
const geoCache = new Map<string, THREE.BufferGeometry>()

export interface TrimGeometryOpts {
  def: TrimProfileDef
  heightM: number
  widthM: number
  /** Length of this run along the wall. */
  lengthM: number
  /** Cut the end back at 45° so it meets the neighbouring wall's run in a
   *  mitre. False leaves a square end — what a run stopped by a doorway wants. */
  mitreStart: boolean
  mitreEnd: boolean
  /** Hang the profile DOWNWARD from y = 0 instead of standing it up: what a
   *  ceiling cornice needs, measuring its height down from the ceiling. */
  flipY?: boolean
}

/**
 * One run of trim as a solid, in the canonical wall frame this file shares
 * with the opening reveals in WallComponents:
 *   local +X — along the wall, the run centred on the origin
 *   local +Y — up (or, with `flipY`, the profile hangs below the origin)
 *   local +Z — out of the wall into the room, the profile's projection
 *
 * The mitre is cut by shifting only the vertices at each end: the extrusion's
 * side walls span the whole run, so moving an end's ring slants those faces
 * into a true 45° plane rather than just angling the cap.
 */
export function buildTrimGeometry(opts: TrimGeometryOpts): THREE.BufferGeometry {
  const { def, heightM, widthM, lengthM, mitreStart, mitreEnd, flipY = false } = opts
  const key = [def.id, heightM, widthM, lengthM, mitreStart, mitreEnd, flipY].join('|')
  const hit = geoCache.get(key)
  if (hit) return hit

  let pts = samplePath(def.path, CURVE_SEGS)
    .map(([x, y]) => [x * widthM, (flipY ? -y : y) * heightM] as [number, number])
  // Mirroring about y reverses the winding; put it back so the solid's faces
  // still point outward.
  if (flipY) pts = pts.slice().reverse()

  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))
  const geo = new THREE.ExtrudeGeometry(shape, { depth: lengthM, bevelEnabled: false, curveSegments: CURVE_SEGS })

  // Extrusion comes out as x = projection, y = height, z = length. Turn it
  // into the canonical frame: length along X (centred), projection along +Z.
  geo.rotateY(-Math.PI / 2)
  geo.translate(lengthM / 2, 0, 0)

  const half = lengthM / 2
  const EPS = 1e-6
  if (mitreStart || mitreEnd) {
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)               // 0 at the wall, widthM at the face
      if (mitreEnd && x > half - EPS) pos.setX(i, x - z)
      else if (mitreStart && x < -half + EPS) pos.setX(i, x + z)
    }
    pos.needsUpdate = true
  }

  // Bite 1 mm into the wall so the back face can never poke through a wall
  // plane it would otherwise be exactly coplanar with.
  geo.translate(0, 0, -0.001)

  const out = toCreasedNormals(geo, CREASE_ANGLE)
  geo.dispose()
  geoCache.set(key, out)
  return out
}

/**
 * The same outline as an SVG path, for the picker thumbnails — drawn from the
 * profile itself so the swatch is the real cross-section, not a drawing of
 * one. Rendered in a `viewBox="0 0 100 100"` with the wall on the left and the
 * floor at the bottom.
 */
export function trimProfileSvgPath(def: TrimProfileDef, flipY = false): string {
  const pts = samplePath(def.path, CURVE_SEGS)
  const d = pts
    .map(([x, y], i) => {
      const sx = x * 100
      const sy = flipY ? y * 100 : 100 - y * 100
      return `${i === 0 ? 'M' : 'L'}${sx.toFixed(1)},${sy.toFixed(1)}`
    })
    .join(' ')
  return `${d} Z`
}
