import * as THREE from 'three'

/**
 * Real-geometry floor laying patterns for the Pol phase — the FloorGenerator
 * idea: the floor is not a painted texture but thousands of individual plank
 * and tile solids, each a chamfered prism whose bevel catches light at grazing
 * angles, separated by real gaps through which a dark under-slab shows.
 *
 * Structure:
 *  - Pattern generators are pure 2D math. Each lays its planks over a cover
 *    rectangle and emits *pieces* grouped into *classes*: a class is one
 *    convex footprint polygon (metres, centred) shared by every piece in it,
 *    a piece is a (x, z, rotation, shade-jitter) placement. Most patterns are
 *    a single class; chevron has two (mirrored parallelograms); Versailles
 *    has six (frame trapezoid, node square, connector, diamond inset, and the
 *    half-piece triangles at the panel border).
 *  - buildFloorGroup() turns every class into ONE THREE.InstancedMesh of a
 *    chamfered prism built exactly for that class's polygon (so the bevel is
 *    true millimetres, not a scaled fraction), with per-instance matrices and
 *    per-instance colours (deterministic seeded jitter — a reload lays the
 *    identical floor).
 *  - The room boundary is enforced by four GPU clipping planes: planks may
 *    overhang the W×D rect and are sliced exactly at the walls (a saw-cut,
 *    bevel-less edge — which is what a real fitted floor has at the wall,
 *    and the baseboard covers the junction anyway).
 *
 * The module is renderer-agnostic up to computeFloorPieces(), which the design
 * panel also uses to draw its SVG thumbnails — the picker preview and the 3D
 * floor come from the same layout math by construction.
 */

// ─── Public state types (stored in DesignState) ──────────────────────────────

export type FloorPatternId =
  | 'herringbone'
  | 'double_herringbone'
  | 'chevron'
  | 'wood_strip'
  | 'brick_bond'
  | 'stake_bond'
  | 'checker_board'
  | 'mosaic'
  | 'chantilly'
  | 'basket_weave'
  | 'double_basket_weave'
  | 'versailles'

export interface FloorPatternSettings {
  /** Plank length, cm. Doubles as the panel/square size for the panel
   *  patterns (checker board, chantilly, versailles). */
  plankLengthCm?: number
  /** Plank width, cm. Doubles as the border-strip width for panel patterns. */
  plankWidthCm?: number
  /** Open joint between planks, mm (0–8). The dark slab shows through it. */
  gapMm?: number
  /** Top-edge chamfer, mm (0–3). */
  bevelMm?: number
  /** Wood tone — with `textureUrl` set it acts as a TINT multiplied over the
   *  image (undefined = white = the image's own colours). */
  baseColor?: string
  /** Image laid on the plank tops, one tile per plank. A library pick or an
   *  upload from the Pol panel (wallpapers `kind: 'pol'`). Lives inside the
   *  pattern, so pattern + texture coexist — unlike the legacy whole-floor
   *  DesignState.floorTexture, which still drives the flat no-pattern floor. */
  textureUrl?: string | null
  /** Quarter-turn of the image on each plank. 0 (default) runs the image's
   *  long side down the plank's length, which is how wood photos are shot. */
  textureRotation?: 0 | 90
  /** Amount of per-plank shade jitter, 0–1. */
  colorVariation?: number
  /** Whole-layout rotation on the floor plane. */
  rotationDeg?: 0 | 45 | 90
}

export interface FloorPatternState {
  id: FloorPatternId
  settings?: FloorPatternSettings
}

export interface FloorPatternDef {
  id: FloorPatternId
  /** Label kept verbatim from the user's reference sheet. */
  label: string
  /** False when plank length is forced by the pattern (basket weaves, mosaic
   *  blocks are squares built from the width) — the UI hides the length knob. */
  usesLength: boolean
  defaultLengthCm: number
  defaultWidthCm: number
  /** Side of the square region the picker thumbnail shows, metres. */
  thumbSpanM: number
}

export const FLOOR_PATTERN_DEFS: FloorPatternDef[] = [
  { id: 'herringbone',         label: 'Herringbone',         usesLength: true,  defaultLengthCm: 49,  defaultWidthCm: 7,  thumbSpanM: 1.35 },
  { id: 'double_herringbone',  label: 'Double Herringbone',  usesLength: true,  defaultLengthCm: 48,  defaultWidthCm: 8,  thumbSpanM: 1.6 },
  { id: 'chevron',             label: 'Chevron',             usesLength: true,  defaultLengthCm: 55,  defaultWidthCm: 9,  thumbSpanM: 1.4 },
  { id: 'wood_strip',          label: 'Wood Strip',          usesLength: true,  defaultLengthCm: 120, defaultWidthCm: 12, thumbSpanM: 1.6 },
  { id: 'brick_bond',          label: 'Brick Bond',          usesLength: true,  defaultLengthCm: 90,  defaultWidthCm: 15, thumbSpanM: 1.7 },
  { id: 'stake_bond',          label: 'Stake Bond',          usesLength: true,  defaultLengthCm: 60,  defaultWidthCm: 20, thumbSpanM: 1.7 },
  { id: 'checker_board',       label: 'Checker Board',       usesLength: true,  defaultLengthCm: 40,  defaultWidthCm: 10, thumbSpanM: 1.62 },
  { id: 'mosaic',              label: 'Mosaic',              usesLength: false, defaultLengthCm: 16,  defaultWidthCm: 4,  thumbSpanM: 0.98 },
  { id: 'chantilly',           label: 'Chantilly',           usesLength: true,  defaultLengthCm: 60,  defaultWidthCm: 10, thumbSpanM: 1.62 },
  { id: 'basket_weave',        label: 'Basket Weave',        usesLength: false, defaultLengthCm: 20,  defaultWidthCm: 10, thumbSpanM: 1.22 },
  { id: 'double_basket_weave', label: 'Double Basket Weave', usesLength: false, defaultLengthCm: 32,  defaultWidthCm: 8,  thumbSpanM: 1.3 },
  { id: 'versailles',          label: 'Versailles',          usesLength: true,  defaultLengthCm: 120, defaultWidthCm: 12, thumbSpanM: 1.28 },
]

const BY_ID = new Map(FLOOR_PATTERN_DEFS.map((d) => [d.id, d]))

export function floorPatternDef(id: string): FloorPatternDef | undefined {
  return BY_ID.get(id as FloorPatternId)
}

/** Plank body thickness above the slab, metres (task spec: 8–12 mm). */
export const PLANK_THICKNESS = 0.010

// ─── Small helpers ───────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const mod = (a: number, n: number) => ((a % n) + n) % n

/** Deterministic 0..1 hash (sin-based, same trick the canvas floors use) —
 *  the identical seed always lays the identical floor across reloads. */
function hash(x: number, y: number, z = 0): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
  return s - Math.floor(s)
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h, 16)
  if (!Number.isFinite(n)) return [180, 150, 110]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Mix a hex colour toward white (f>0) or black (f<0), f in -1..1.
 *  Returns a CSS rgb() string (usable both in SVG fills and THREE.Color). */
export function shadeColor(hex: string, f: number): string {
  const [r, g, b] = hexToRgb(hex)
  const t = f > 0 ? 255 : 0
  const a = Math.abs(clamp(f, -1, 1))
  const mix = (c: number) => Math.round(c + (t - c) * a)
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`
}

/** Colour of the slab seen through the gaps — near-black version of the tone. */
export function floorSlabColor(baseColor: string): string {
  return shadeColor(baseColor, -0.82)
}

/** Neutral dark screed, used under a textured floor: the tint there is white
 *  by default, and a near-white slab would fill the joints with light instead
 *  of the shadow that makes the planks read as separate boards. */
const TEXTURED_SLAB_COLOR = '#2A2521'

/** What to paint the under-slab for this pattern state. */
export function floorSlabColorFor(
  pattern: { settings?: FloorPatternSettings } | null | undefined,
  fallbackBaseColor: string,
): string {
  const s = pattern?.settings
  if (s?.textureUrl) return TEXTURED_SLAB_COLOR
  return floorSlabColor(s?.baseColor ?? fallbackBaseColor)
}

// ─── 2D polygon helpers ──────────────────────────────────────────────────────

export type Vec2 = [number, number]

function signedArea(poly: Vec2[]): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i]
    const [x2, z2] = poly[(i + 1) % poly.length]
    a += x1 * z2 - x2 * z1
  }
  return a / 2
}

function ensureCCW(poly: Vec2[]): Vec2[] {
  return signedArea(poly) < 0 ? [...poly].reverse() : poly
}

/** Rough inradius: min distance from centroid to an edge. Used to clamp the
 *  gap inset and the bevel so tiny pieces never invert. */
function polyInradius(poly: Vec2[]): number {
  let cx = 0, cz = 0
  for (const [x, z] of poly) { cx += x; cz += z }
  cx /= poly.length; cz /= poly.length
  let best = Infinity
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i]
    const [x2, z2] = poly[(i + 1) % poly.length]
    const dx = x2 - x1, dz = z2 - z1
    const len = Math.hypot(dx, dz)
    if (len < 1e-9) continue
    // distance from centroid to the edge line
    const d = Math.abs(dx * (cz - z1) - dz * (cx - x1)) / len
    best = Math.min(best, d)
  }
  return best === Infinity ? 0 : best
}

/** Offset every edge of a convex CCW polygon inward by d and re-intersect.
 *  d is clamped so the polygon cannot invert. */
export function insetConvexPoly(poly: Vec2[], d: number): Vec2[] {
  if (d <= 0) return poly
  const inr = polyInradius(poly)
  const dd = Math.min(d, inr * 0.6)
  const n = poly.length
  // Inward-offset edge lines: point + direction
  const lines: { px: number; pz: number; dx: number; dz: number }[] = []
  for (let i = 0; i < n; i++) {
    const [x1, z1] = poly[i]
    const [x2, z2] = poly[(i + 1) % n]
    const dx = x2 - x1, dz = z2 - z1
    const len = Math.hypot(dx, dz) || 1
    // CCW (positive shoelace in x,z): inward normal is edge dir rotated +90°
    // in math convention: (-dz, dx)/len
    const nx = -dz / len, nz = dx / len
    lines.push({ px: x1 + nx * dd, pz: z1 + nz * dd, dx, dz })
  }
  const out: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const a = lines[(i - 1 + n) % n]
    const b = lines[i]
    // Intersect line a and line b
    const det = a.dx * b.dz - a.dz * b.dx
    if (Math.abs(det) < 1e-12) { out.push([b.px, b.pz]); continue }
    const t = ((b.px - a.px) * b.dz - (b.pz - a.pz) * b.dx) / det
    out.push([a.px + a.dx * t, a.pz + a.dz * t])
  }
  return out
}

const rectPoly = (l: number, w: number): Vec2[] => [
  [-l / 2, -w / 2], [l / 2, -w / 2], [l / 2, w / 2], [-l / 2, w / 2],
]

// ─── Resolution ──────────────────────────────────────────────────────────────

export interface ResolvedFloorPattern {
  lM: number
  wM: number
  gapM: number
  bevelM: number
  /** Plank colour, or — with `textureUrl` — the tint over the image. */
  baseColor: string
  textureUrl: string | null
  textureRotation: 0 | 90
  variation: number
  rotationDeg: 0 | 45 | 90
}

/** Defaults strong enough that the pattern reads from a normal standing
 *  camera, not only at grazing angles (a 2 mm joint is subpixel from 4 m). */
export const DEFAULT_GAP_MM = 3.5
export const DEFAULT_BEVEL_MM = 2
/** Max per-plank shade swing at colorVariation = 1. */
export const SHADE_AMPLITUDE = 0.22

/** Shade offset of one piece: fixed pattern tone + seeded jitter. */
export function pieceShade(p: FloorPiece, r: ResolvedFloorPattern): number {
  return (p.tone ?? 0) + p.shade * SHADE_AMPLITUDE * r.variation
}

export function resolveFloorPattern(
  def: FloorPatternDef,
  settings: FloorPatternSettings | undefined,
  fallbackBaseColor: string,
): ResolvedFloorPattern {
  const s = settings ?? {}
  const textureUrl = s.textureUrl || null
  return {
    lM: clamp(s.plankLengthCm ?? def.defaultLengthCm, 10, 300) / 100,
    wM: clamp(s.plankWidthCm ?? def.defaultWidthCm, 3, 40) / 100,
    gapM: clamp(s.gapMm ?? DEFAULT_GAP_MM, 0, 8) / 1000,
    bevelM: clamp(s.bevelMm ?? DEFAULT_BEVEL_MM, 0, 3) / 1000,
    // Untextured: the wood colour itself. Textured: a tint multiplied over
    // the image, so an unset colour must be white and not the floor type's tan.
    baseColor: s.baseColor ?? (textureUrl ? '#ffffff' : fallbackBaseColor),
    textureUrl,
    textureRotation: s.textureRotation === 90 ? 90 : 0,
    variation: clamp(s.colorVariation ?? 0.5, 0, 1),
    rotationDeg: s.rotationDeg === 45 || s.rotationDeg === 90 ? s.rotationDeg : 0,
  }
}

// ─── Piece sheet (generator output) ──────────────────────────────────────────

export interface FloorPiece {
  x: number
  z: number
  /** CCW rotation in the (x, z) plane, radians. */
  rot: number
  /** Raw shade jitter in -1..1 (scaled by colorVariation later). */
  shade: number
  /** Absolute tone offset applied regardless of variation (checker board). */
  tone?: number
}

export interface FloorPieceClass {
  key: string
  /** Convex CCW footprint, metres, centred on the piece origin. Nominal —
   *  the gap inset is applied by the consumer (builder / thumbnail). */
  poly: Vec2[]
  pieces: FloorPiece[]
}

class Sheet {
  classes = new Map<string, FloorPieceClass>()
  count = 0
  add(key: string, poly: Vec2[], x: number, z: number, rot: number, s1: number, s2: number, tone?: number) {
    let c = this.classes.get(key)
    if (!c) {
      c = { key, poly: ensureCCW(poly), pieces: [] }
      this.classes.set(key, c)
    }
    c.pieces.push({ x, z, rot, shade: hash(s1, s2, 0.5) * 2 - 1, tone })
    this.count++
  }
}

type Generator = (r: ResolvedFloorPattern, cw: number, ch: number, S: Sheet) => void

// ─── Pattern generators ──────────────────────────────────────────────────────
// All lay pieces over a cover rect cw×ch centred at the origin of "pattern
// space"; computeFloorPieces() rotates/culls afterwards.

const genWoodStrip: Generator = (r, cw, ch, S) => {
  const W = r.wM, L = r.lM
  const poly = rectPoly(W, L) // strips run along z
  const nc = Math.ceil(cw / W / 2) + 1
  for (let c = -nc; c <= nc; c++) {
    const x = (c + 0.5) * W
    const off = hash(c, 7.7) * L // staggered butt joints per column
    const kMin = Math.floor((-ch / 2 - off) / L) - 1
    const kMax = Math.ceil((ch / 2 - off) / L) + 1
    for (let k = kMin; k <= kMax; k++) {
      S.add('strip', poly, x, off + (k + 0.5) * L, 0, c, k)
    }
  }
}

function genBond(offsetHalf: boolean): Generator {
  return (r, cw, ch, S) => {
    const W = r.wM, L = r.lM
    const poly = rectPoly(L, W)
    const nr = Math.ceil(ch / W / 2) + 1
    for (let j = -nr; j <= nr; j++) {
      const z = (j + 0.5) * W
      const off = offsetHalf && mod(j, 2) === 1 ? L / 2 : 0
      const iMin = Math.floor((-cw / 2 - off) / L) - 1
      const iMax = Math.ceil((cw / 2 - off) / L) + 1
      for (let i = iMin; i <= iMax; i++) {
        S.add('b', poly, off + (i + 0.5) * L, z, 0, i, j)
      }
    }
  }
}

/** Squares of parallel boards, direction alternating 90° checker-wise, with a
 *  light/dark tone alternation so it reads as the sheet's checkerboard. */
const genCheckerBoard: Generator = (r, cw, ch, S) => {
  const s = r.lM
  const n = clamp(Math.round(s / r.wM), 1, 10)
  const bw = s / n
  const polyH = rectPoly(s, bw)
  const ni = Math.ceil(cw / s / 2) + 1
  const nj = Math.ceil(ch / s / 2) + 1
  for (let i = -ni; i <= ni; i++) {
    for (let j = -nj; j <= nj; j++) {
      const cx = (i + 0.5) * s, cz = (j + 0.5) * s
      const horiz = mod(i + j, 2) === 0
      const tone = horiz ? 0.06 : -0.1
      for (let k = 0; k < n; k++) {
        const o = (k - (n - 1) / 2) * bw
        if (horiz) S.add('sq', polyH, cx, cz + o, 0, i * 3 + k, j * 5, tone)
        else S.add('sq', polyH, cx + o, cz, Math.PI / 2, i * 3 + k, j * 5 + 1, tone)
      }
    }
  }
}

/** Finger-block mosaic: squares of nF fingers, direction alternating. */
const genMosaic: Generator = (r, cw, ch, S) => {
  const fw = r.wM
  const nF = clamp(Math.round(r.lM / r.wM), 3, 6)
  const block = nF * fw
  const poly = rectPoly(fw, block) // finger along z
  const ni = Math.ceil(cw / block / 2) + 1
  const nj = Math.ceil(ch / block / 2) + 1
  for (let i = -ni; i <= ni; i++) {
    for (let j = -nj; j <= nj; j++) {
      const cx = (i + 0.5) * block, cz = (j + 0.5) * block
      const vertical = mod(i + j, 2) === 0
      for (let k = 0; k < nF; k++) {
        const o = (k - (nF - 1) / 2) * fw
        if (vertical) S.add('f', poly, cx + o, cz, 0, i * 7 + k, j * 3)
        else S.add('f', poly, cx, cz + o, Math.PI / 2, i * 7 + k, j * 3 + 1)
      }
    }
  }
}

/**
 * Herringbone lattice (shared by single and double): cells of size `cell`;
 * the H+V pair (H = ratio×1 cells at p, V = 1×ratio at p+(ratio,0)) tiles the
 * plane on the lattice m·(1,−1) + n·(ratio,ratio) — the same construction the
 * earlier canvas prototype verified. `drawPair` receives the pair's corner.
 */
function herringboneLattice(
  cw: number, ch: number, ratio: number, cell: number,
  drawPair: (px: number, pz: number, m: number, n: number) => void,
) {
  const L = ratio * cell
  const S = (cw + ch) / 2 + 2 * L
  const nMax = Math.ceil(S / (2 * ratio * cell))
  const mMax = Math.ceil(S / (2 * cell))
  for (let n = -nMax; n <= nMax; n++) {
    for (let m = -mMax; m <= mMax; m++) {
      drawPair((m + n * ratio) * cell, (-m + n * ratio) * cell, m, n)
    }
  }
}

const genHerringbone: Generator = (r, cw, ch, S) => {
  const w = r.wM
  const ratio = clamp(Math.round(r.lM / w), 2, 8)
  const L = ratio * w
  const poly = rectPoly(L, w)
  herringboneLattice(cw, ch, ratio, w, (px, pz, m, n) => {
    S.add('h', poly, px + L / 2, pz + w / 2, 0, m, n * 2)          // H plank
    S.add('h', poly, px + L + w / 2, pz + L / 2, Math.PI / 2, m, n * 2 + 1) // V plank
  })
}

const genDoubleHerringbone: Generator = (r, cw, ch, S) => {
  const w = r.wM
  const cell = 2 * w // one block = two planks side by side
  const ratio = clamp(Math.round(r.lM / cell), 2, 6)
  const L = ratio * cell
  const poly = rectPoly(L, w)
  herringboneLattice(cw, ch, ratio, cell, (px, pz, m, n) => {
    for (let k = 0; k < 2; k++) {
      S.add('h', poly, px + L / 2, pz + w / 2 + k * w, 0, m * 2 + k, n * 2)
      S.add('h', poly, px + L + w / 2 + k * w, pz + L / 2, Math.PI / 2, m * 2 + k, n * 2 + 1)
    }
  })
}

/** Mitred 45°-cut planks in mirrored columns — the zigzag rows all land on the
 *  same z, which is exactly what distinguishes chevron from herringbone. */
const genChevron: Generator = (r, cw, ch, S) => {
  const colW = r.lM * Math.SQRT1_2       // horizontal span of one plank
  const bandH = r.wM * Math.SQRT2        // z step between planks in a column
  const dx = colW / 2, h2 = bandH / 2
  const polyUp: Vec2[] = [[-dx, -dx - h2], [dx, dx - h2], [dx, dx + h2], [-dx, -dx + h2]]
  const polyDn: Vec2[] = [[-dx, dx - h2], [dx, -dx - h2], [dx, -dx + h2], [-dx, dx + h2]]
  const nc = Math.ceil(cw / colW / 2) + 1
  const nk = Math.ceil((ch / 2 + colW) / bandH) + 1
  for (let c = -nc; c <= nc; c++) {
    const up = mod(c, 2) === 0
    const x = (c + 0.5) * colW
    for (let k = -nk; k <= nk; k++) {
      S.add(up ? 'up' : 'dn', up ? polyUp : polyDn, x, k * bandH, 0, c, k)
    }
  }
}

function genBasket(planks: number): Generator {
  return (r, cw, ch, S) => {
    const w = r.wM
    const L = planks * w // blocks must be square for the weave to tile
    const poly = rectPoly(L, w)
    const ni = Math.ceil(cw / L / 2) + 1
    const nj = Math.ceil(ch / L / 2) + 1
    for (let i = -ni; i <= ni; i++) {
      for (let j = -nj; j <= nj; j++) {
        const cx = (i + 0.5) * L, cz = (j + 0.5) * L
        const horiz = mod(i + j, 2) === 0
        for (let k = 0; k < planks; k++) {
          const o = (k - (planks - 1) / 2) * w
          if (horiz) S.add('bk', poly, cx, cz + o, 0, i * 5 + k, j * 3)
          else S.add('bk', poly, cx + o, cz, Math.PI / 2, i * 5 + k, j * 3 + 1)
        }
      }
    }
  }
}

// ── Diagonal lattice shared by Chantilly and Versailles ──────────────────────
//
// A 45°-rotated grid inside a square region of side `side` centred at (cx,cz).
// Lattice coords (u,v) run along the region's diagonals; the region maps to
// the diamond |u|+|v| ≤ side/√2. The lattice pitch is chosen as
// sp = side/(√2·k), so the region boundary passes exactly through lattice
// nodes — every boundary cell is then cut precisely in half along its
// diagonal, and the cut pieces are all the same right-isosceles triangle.
// With sw > 0 the strips weave a Versailles trellis (node squares +
// connectors + diamond openings); with sw = 0 it degenerates to Chantilly's
// solid field of squares laid on point.
function emitDiagLattice(
  S: Sheet, prefix: string, cx: number, cz: number,
  side: number, k: number, sw: number, seed: number,
) {
  const sp = side / (Math.SQRT2 * k)
  const SQ = Math.SQRT1_2
  const uvToWorld = (u: number, v: number): Vec2 => [cx + (u - v) * SQ, cz + (u + v) * SQ]
  const R45 = Math.PI / 4
  // Boundary-half triangle: legs along -u/-v from the cell corner, hypotenuse
  // facing +u+v; canonical poly has the right angle at (-h,-h).
  const triPoly = (leg: number): Vec2[] => [[-leg / 2, -leg / 2], [leg / 2, -leg / 2], [-leg / 2, leg / 2]]
  // Extra rotation putting the hypotenuse toward the outside, per uv quadrant.
  const quadRot = (u: number, v: number) =>
    u >= 0 && v >= 0 ? 0 : u < 0 && v >= 0 ? Math.PI / 2 : u < 0 && v < 0 ? Math.PI : -Math.PI / 2

  // Node squares + connectors (Versailles trellis only)
  if (sw > 0) {
    const nodePoly = rectPoly(sw, sw)
    const connPoly = rectPoly(sp - sw, sw)
    for (let i = -k; i <= k; i++) {
      for (let j = -k; j <= k; j++) {
        const a = Math.abs(i) + Math.abs(j)
        const [x, z] = uvToWorld(i * sp, j * sp)
        if (a < k) {
          S.add(`${prefix}n`, nodePoly, x, z, R45, seed + i, j * 3)
        } else if (a === k && i !== 0 && j !== 0) {
          // Node halved by the boundary (axis nodes are the region corners —
          // quarter-pieces a few mm across, skipped).
          S.add(`${prefix}nt`, triPoly(sw), x, z, R45 + quadRot(i, j), seed + i, j * 3 + 1)
        }
        // u-direction connector toward node (i+1, j)
        if (i < k) {
          const uc = (i + 0.5) * sp, vc = j * sp
          // fully inside iff the farthest corner stays within the diamond
          const maxSum = Math.max(
            Math.abs(uc + (sp - sw) / 2) + Math.abs(vc) + sw / 2,
            Math.abs(uc - (sp - sw) / 2) + Math.abs(vc) + sw / 2,
          )
          if (maxSum <= k * sp + 1e-9) {
            const [x2, z2] = uvToWorld(uc, vc)
            S.add(`${prefix}c`, connPoly, x2, z2, R45, seed + i * 7, j * 5)
          }
        }
        // v-direction connector toward node (i, j+1)
        if (j < k) {
          const uc = i * sp, vc = (j + 0.5) * sp
          const maxSum = Math.max(
            Math.abs(vc + (sp - sw) / 2) + Math.abs(uc) + sw / 2,
            Math.abs(vc - (sp - sw) / 2) + Math.abs(uc) + sw / 2,
          )
          if (maxSum <= k * sp + 1e-9) {
            const [x2, z2] = uvToWorld(uc, vc)
            S.add(`${prefix}c`, connPoly, x2, z2, R45 + Math.PI / 2, seed + i * 7, j * 5 + 1)
          }
        }
      }
    }
  }

  // Diamond insets (the openings; with sw = 0, the whole field)
  const d = sp - sw
  const insetPoly = rectPoly(d, d)
  for (let i = -k; i < k; i++) {
    for (let j = -k; j < k; j++) {
      const uc = (i + 0.5) * sp, vc = (j + 0.5) * sp
      const a = Math.abs(i + 0.5) + Math.abs(j + 0.5)
      const [x, z] = uvToWorld(uc, vc)
      if (a <= k - 1 + sw / sp + 1e-9) {
        S.add(`${prefix}d`, insetPoly, x, z, R45, seed + i * 11, j * 13)
      } else if (Math.abs(a - k) < 1e-9) {
        S.add(`${prefix}dt`, triPoly(d), x, z, R45 + quadRot(uc, vc), seed + i * 11, j * 13 + 1)
      }
    }
  }
}

/** Mitred border frame of a square panel: four trapezoids with true 45°
 *  corner joints. Canonical poly's outer edge faces −z. */
function emitPanelFrame(S: Sheet, key: string, x0: number, z0: number, P: number, bw: number, seed: number) {
  const poly: Vec2[] = [[-P / 2, -bw / 2], [P / 2, -bw / 2], [P / 2 - bw, bw / 2], [-P / 2 + bw, bw / 2]]
  const c = P / 2
  S.add(key, poly, x0 + c, z0 + bw / 2, 0, seed, 1)                // bottom (outer −z)
  S.add(key, poly, x0 + P - bw / 2, z0 + c, Math.PI / 2, seed, 2)  // right  (outer +x)
  S.add(key, poly, x0 + c, z0 + P - bw / 2, Math.PI, seed, 3)      // top    (outer +z)
  S.add(key, poly, x0 + bw / 2, z0 + c, -Math.PI / 2, seed, 4)     // left   (outer −x)
}

/** Chantilly: pinwheel border strips around square fields of diamonds laid on
 *  point — the classic Parquet de Chantilly reading of the sheet. */
const genChantilly: Generator = (r, cw, ch, S) => {
  const s = r.lM          // interior square side
  const bw = r.wM         // border strip width
  const u = s + 2 * bw    // pinwheel unit pitch (exact tiling: s² + 4·bw(s+bw) = u²)
  const stripPolyH = rectPoly(s + bw, bw)
  const ni = Math.ceil(cw / u / 2) + 1
  const nj = Math.ceil(ch / u / 2) + 1
  for (let i = -ni; i <= ni; i++) {
    for (let j = -nj; j <= nj; j++) {
      const x0 = i * u - u / 2, z0 = j * u - u / 2
      const seed = i * 31 + j * 17
      // Pinwheel strips (single strip between neighbouring squares)
      S.add('st', stripPolyH, x0 + (s + bw) / 2, z0 + u - bw / 2, 0, seed, 1)
      S.add('st', stripPolyH, x0 + u - bw / 2, z0 + bw + (s + bw) / 2, Math.PI / 2, seed, 2)
      S.add('st', stripPolyH, x0 + bw + (s + bw) / 2, z0 + bw / 2, 0, seed, 3)
      S.add('st', stripPolyH, x0 + bw / 2, z0 + (s + bw) / 2, Math.PI / 2, seed, 4)
      // Field of diamonds
      emitDiagLattice(S, 'ch', x0 + bw + s / 2, z0 + bw + s / 2, s, 2, 0, seed)
    }
  }
}

/** Versailles: square panels, each a mitred frame around a 45° woven trellis
 *  (node squares + connecting strips) with diamond openings. */
const genVersailles: Generator = (r, cw, ch, S) => {
  const P = Math.max(r.lM, 0.6) // panel side
  const bw = Math.min(r.wM, P / 6)
  const inner = P - 2 * bw
  const k = 3
  const sp = inner / (Math.SQRT2 * k)
  const sw = 0.3 * sp
  const ni = Math.ceil(cw / P / 2) + 1
  const nj = Math.ceil(ch / P / 2) + 1
  for (let i = -ni; i <= ni; i++) {
    for (let j = -nj; j <= nj; j++) {
      const x0 = i * P - P / 2, z0 = j * P - P / 2
      const seed = i * 29 + j * 41
      emitPanelFrame(S, 'fr', x0, z0, P, bw, seed)
      emitDiagLattice(S, 'vs', x0 + P / 2, z0 + P / 2, inner, k, sw, seed)
    }
  }
}

const GENERATORS: Record<FloorPatternId, Generator> = {
  herringbone: genHerringbone,
  double_herringbone: genDoubleHerringbone,
  chevron: genChevron,
  wood_strip: genWoodStrip,
  brick_bond: genBond(true),
  stake_bond: genBond(false),
  checker_board: genCheckerBoard,
  mosaic: genMosaic,
  chantilly: genChantilly,
  basket_weave: genBasket(2),
  double_basket_weave: genBasket(4),
  versailles: genVersailles,
}

// ─── Layout: generate → rotate → cull ────────────────────────────────────────

export interface FloorPieces {
  classes: FloorPieceClass[]
  count: number
  resolved: ResolvedFloorPattern
}

/** Instance-count ceiling — a 6×5 m mosaic lands near 5k; this guards absurd
 *  inputs (tiny planks × huge room) by coarsening the planks instead of
 *  freezing the tab. */
const MAX_PIECES = 24000

export function computeFloorPieces(
  state: FloorPatternState,
  W: number,
  D: number,
  fallbackBaseColor: string,
): FloorPieces {
  const def = floorPatternDef(state.id) ?? FLOOR_PATTERN_DEFS[0]
  let resolved = resolveFloorPattern(def, state.settings, fallbackBaseColor)

  for (let attempt = 0; attempt < 3; attempt++) {
    const angle = (resolved.rotationDeg * Math.PI) / 180
    const ca = Math.abs(Math.cos(angle)), sa = Math.abs(Math.sin(angle))
    const cw = W * ca + D * sa + 0.3
    const ch = W * sa + D * ca + 0.3

    const sheet = new Sheet()
    GENERATORS[def.id](resolved, cw, ch, sheet)

    // Rotate into world space and cull to the room rect (+ margin — pieces
    // that overhang are trimmed by the clipping planes at render time).
    const cos = Math.cos(angle), sin = Math.sin(angle)
    const classes: FloorPieceClass[] = []
    let count = 0
    for (const cls of sheet.classes.values()) {
      const rad = cls.poly.reduce((m, [x, z]) => Math.max(m, Math.hypot(x, z)), 0)
      const limX = W / 2 + rad + 0.03
      const limZ = D / 2 + rad + 0.03
      const pieces: FloorPiece[] = []
      for (const p of cls.pieces) {
        const x = angle ? p.x * cos - p.z * sin : p.x
        const z = angle ? p.x * sin + p.z * cos : p.z
        if (Math.abs(x) > limX || Math.abs(z) > limZ) continue
        pieces.push(angle ? { ...p, x, z, rot: p.rot + angle } : p)
      }
      if (pieces.length) {
        classes.push({ key: cls.key, poly: cls.poly, pieces })
        count += pieces.length
      }
    }

    if (count <= MAX_PIECES || attempt === 2) {
      return { classes, count, resolved }
    }
    const scale = Math.sqrt(count / MAX_PIECES) * 1.05
    resolved = { ...resolved, lM: resolved.lM * scale, wM: resolved.wM * scale }
  }
  // Unreachable, but the compiler wants a tail.
  return { classes: [], count: 0, resolved }
}

// ─── THREE geometry: chamfered prism per class, InstancedMesh per class ──────

/**
 * A plank solid: convex footprint extruded up `thickness`, with the top edge
 * chamfered inward by `bevel` — real 45° faces with their own normals, so
 * every plank edge catches light at grazing angles (the FloorGenerator look).
 * The bottom face is never visible and is omitted.
 *
 * Faces also carry a baked vertex-colour "AO rim": full brightness on top,
 * darker on the chamfer, darkest on the side walls facing into the joints.
 * three multiplies it with the per-instance colour, so every plank edge reads
 * as a darker outline at any camera distance — without it, a millimetre gap
 * goes subpixel from a few metres away and the whole floor flattens out.
 */
const SHADE_TOP = 1.0
const SHADE_CHAMFER = 0.78
const SHADE_SIDE = 0.5

interface PrismArrays { positions: number[]; normals: number[]; colors: number[]; uvs: number[] }

/**
 * How a plank's texture is laid on its own footprint: one tile per plank
 * ("uvw map size is according to per floor panel size"). `o` is the footprint
 * corner that maps to (0,0), `u` the unit vector along the plank's length,
 * and `su`/`sv` the plank's length/width — so u runs along the plank and v
 * across it, and the grain rotates WITH the plank (herringbone's
 * perpendicular neighbours get perpendicular grain for free, because a
 * class's UVs live in its local frame and the instance matrix turns them).
 *
 * A boundary plank cut at a wall keeps the frame of its ORIGINAL uncut
 * footprint, so it shows the matching PART of the texture instead of a
 * squeezed full copy.
 */
export interface UvFrame { ox: number; oz: number; ux: number; uz: number; su: number; sv: number }

/**
 * The uv frame of a class footprint in its own local coordinates: the
 * minimum-area box that encloses the piece, with u along its LONG axis.
 *
 * It has to be the piece's own box, not an axis-aligned one: the generators
 * disagree about which local axis a plank's length runs along (herringbone
 * and the bonds lay it on x, wood strip and mosaic on z), and chevron's
 * planks are mitred parallelograms whose length runs at 45° to both. Taking
 * the oriented box means the image's long side always follows the board's
 * length — wood grain runs down the plank, never across it — and a mitred
 * chevron board shows the slanted crop a real one cut from that plank would.
 *
 * Ties (a square, or a right triangle whose legs and hypotenuse box equally)
 * go to the direction carrying the most edge length, which keeps a cut
 * half-piece aligned with the whole pieces beside it.
 */
function localUvFrame(poly: Vec2[]): UvFrame {
  const n = poly.length
  let best: { dx: number; dz: number; minU: number; minV: number; eu: number; ev: number } | null = null
  let bestArea = Infinity
  let bestAligned = -1
  for (let i = 0; i < n; i++) {
    const [ax, az] = poly[i]
    const [bx, bz] = poly[(i + 1) % n]
    const len = Math.hypot(bx - ax, bz - az)
    if (len < 1e-9) continue
    const dx = (bx - ax) / len, dz = (bz - az) / len
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
    for (const [x, z] of poly) {
      const u = x * dx + z * dz
      const v = -x * dz + z * dx
      minU = Math.min(minU, u); maxU = Math.max(maxU, u)
      minV = Math.min(minV, v); maxV = Math.max(maxV, v)
    }
    const eu = maxU - minU, ev = maxV - minV
    const area = eu * ev
    // Total edge length parallel to this direction — the tie-break.
    let aligned = 0
    for (let k = 0; k < n; k++) {
      const [px, pz] = poly[k]
      const [qx, qz] = poly[(k + 1) % n]
      const l = Math.hypot(qx - px, qz - pz)
      if (l < 1e-9) continue
      if (Math.abs((qx - px) / l * dz - (qz - pz) / l * dx) < 1e-3) aligned += l
    }
    if (area < bestArea * (1 - 1e-3) || (area < bestArea * (1 + 1e-3) && aligned > bestAligned)) {
      bestArea = Math.min(bestArea, area)
      bestAligned = aligned
      best = { dx, dz, minU, minV, eu, ev }
    }
  }
  if (!best) return { ox: 0, oz: 0, ux: 1, uz: 0, su: 1, sv: 1 }
  const { dx, dz, minU, minV, eu, ev } = best
  // Box corner (minU, minV) back in local coordinates.
  const ox = dx * minU - dz * minV
  const oz = dz * minU + dx * minV
  // u along the LONG side of the box.
  return eu >= ev
    ? { ox, oz, ux: dx, uz: dz, su: Math.max(eu, 1e-6), sv: Math.max(ev, 1e-6) }
    : { ox, oz, ux: -dz, uz: dx, su: Math.max(ev, 1e-6), sv: Math.max(eu, 1e-6) }
}

/** Turn a tile a quarter turn on its plank: (u, v) → (v, 1 − u). Lets a
 *  portrait-shot image be flipped to run along the board without re-cropping. */
function rotateUvFrame90(f: UvFrame): UvFrame {
  return {
    ox: f.ox + f.ux * f.su,
    oz: f.oz + f.uz * f.su,
    ux: -f.uz,
    uz: f.ux,
    su: f.sv,
    sv: f.su,
  }
}

/** The same frame carried into world space for a placed piece. */
function placeUvFrame(f: UvFrame, x: number, z: number, rot: number): UvFrame {
  const cos = Math.cos(rot), sin = Math.sin(rot)
  return {
    ox: x + f.ox * cos - f.oz * sin,
    oz: z + f.ox * sin + f.oz * cos,
    ux: f.ux * cos - f.uz * sin,
    uz: f.ux * sin + f.uz * cos,
    su: f.su,
    sv: f.sv,
  }
}

/** Append one chamfered prism to shared arrays. `tint` multiplies the AO rim
 *  shades — [1,1,1] for instanced geometry (instanceColor carries the tone),
 *  the piece's actual RGB for merged boundary pieces. */
/** Drop duplicate and collinear vertices — a wall cut that passes through an
 *  existing corner leaves a straight-angle vertex, and offsetting its two
 *  near-parallel edges for the chamfer inset would put the intersection
 *  anywhere (including outside the room). */
function cleanPoly(poly: Vec2[]): Vec2[] {
  const dedup: Vec2[] = []
  for (const p of poly) {
    const q = dedup[dedup.length - 1]
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 2e-4) dedup.push(p)
  }
  if (dedup.length > 1) {
    const f = dedup[0], l = dedup[dedup.length - 1]
    if (Math.hypot(f[0] - l[0], f[1] - l[1]) <= 2e-4) dedup.pop()
  }
  const out: Vec2[] = []
  for (let i = 0; i < dedup.length; i++) {
    const p = dedup[(i - 1 + dedup.length) % dedup.length], v = dedup[i], q = dedup[(i + 1) % dedup.length]
    const ax = v[0] - p[0], az = v[1] - p[1], bx = q[0] - v[0], bz = q[1] - v[1]
    const cross = ax * bz - az * bx
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz)
    if (la > 0 && lb > 0 && Math.abs(cross) / (la * lb) < 1e-3) continue // straight angle
    out.push(v)
  }
  return out
}

function appendChamferedPrism(
  out: PrismArrays, rawPoly: Vec2[], thickness: number, bevel: number,
  tint: [number, number, number], uv: UvFrame,
) {
  const poly = cleanPoly(rawPoly)
  if (poly.length < 3) return
  const inr = polyInradius(poly)
  // A sliver (wall-cut remnant) gets no chamfer: offsetting near-parallel
  // edges inward can throw the inset ring outside the footprint.
  const b = inr < bevel * 4 ? 0 : Math.min(bevel, thickness * 0.45, inr * 0.5)
  const top = insetConvexPoly(poly, b)
  const y1 = thickness - b
  const n = poly.length
  const { positions, normals, colors, uvs } = out

  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3()
  const AB = new THREE.Vector3(), AC = new THREE.Vector3(), N = new THREE.Vector3()

  // Perpendicular of the u axis, so v runs across the plank.
  const vx = -uv.uz, vz = uv.ux
  /** A vertex's (u, v) from its xz — the top face gets the plank's own tile,
   *  and the chamfer band continues it (its verts sit within a bevel of the
   *  edge, so the map runs over the chamfer without a seam). The side walls
   *  reuse their top edge's coordinates; they are a ~10 mm strip inside the
   *  joint, drawn at SHADE_SIDE, and never read as a surface. */
  const pushUv = (p: THREE.Vector3) => {
    const dx = p.x - uv.ox, dz = p.z - uv.oz
    uvs.push((dx * uv.ux + dz * uv.uz) / uv.su, (dx * vx + dz * vz) / uv.sv)
  }

  /** Push a triangle wound so its face normal agrees with `ref`. */
  function tri(a: number[], bb: number[], c: number[], ref: THREE.Vector3, shade: number) {
    A.fromArray(a); B.fromArray(bb); C.fromArray(c)
    AB.subVectors(B, A); AC.subVectors(C, A)
    N.crossVectors(AB, AC)
    if (N.dot(ref) < 0) { const t = B.clone(); B.copy(C); C.copy(t); N.negate() }
    N.normalize()
    positions.push(A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z)
    pushUv(A); pushUv(B); pushUv(C)
    for (let i = 0; i < 3; i++) {
      normals.push(N.x, N.y, N.z)
      colors.push(shade * tint[0], shade * tint[1], shade * tint[2])
    }
  }

  let cx = 0, cz = 0
  for (const [x, z] of poly) { cx += x; cz += z }
  cx /= n; cz /= n
  const outV = new THREE.Vector3()

  for (let i = 0; i < n; i++) {
    const [x1, z1] = poly[i]
    const [x2, z2] = poly[(i + 1) % n]
    const [tx1, tz1] = top[i]
    const [tx2, tz2] = top[(i + 1) % n]
    const mx = (x1 + x2) / 2 - cx, mz = (z1 + z2) / 2 - cz
    // Side wall (0 → y1), outward
    outV.set(mx, 0, mz)
    tri([x1, 0, z1], [x2, 0, z2], [x2, y1, z2], outV, SHADE_SIDE)
    tri([x1, 0, z1], [x2, y1, z2], [x1, y1, z1], outV, SHADE_SIDE)
    // Chamfer band (y1 outline → top inset), outward + up
    outV.set(mx, Math.hypot(mx, mz), mz)
    tri([x1, y1, z1], [x2, y1, z2], [tx2, thickness, tz2], outV, SHADE_CHAMFER)
    tri([x1, y1, z1], [tx2, thickness, tz2], [tx1, thickness, tz1], outV, SHADE_CHAMFER)
  }
  // Top face (fan)
  const UP = new THREE.Vector3(0, 1, 0)
  for (let i = 1; i < n - 1; i++) {
    tri(
      [top[0][0], thickness, top[0][1]],
      [top[i][0], thickness, top[i][1]],
      [top[i + 1][0], thickness, top[i + 1][1]],
      UP,
      SHADE_TOP,
    )
  }
}

function emptyPrismArrays(): PrismArrays {
  return { positions: [], normals: [], colors: [], uvs: [] }
}

function arraysToGeometry(a: PrismArrays): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(a.positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(a.normals, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(a.colors, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(a.uvs, 2))
  return geo
}

export function chamferedPrismGeometry(
  poly: Vec2[], thickness: number, bevel: number, uv?: UvFrame,
): THREE.BufferGeometry {
  const arrays = emptyPrismArrays()
  appendChamferedPrism(arrays, poly, thickness, bevel, [1, 1, 1], uv ?? localUvFrame(poly))
  return arraysToGeometry(arrays)
}

// ─── Polygon clipping (non-rectangular rooms: RoomPlan scans, drawn rooms) ───
//
// Clipping planes only express convex boundaries, so an L-shaped room can't
// use them. Instead, pieces are clipped analytically: fully-inside pieces stay
// instanced, boundary-crossing pieces are cut against the near wall edges and
// merged into one static mesh, outside pieces are dropped. At a reflex (inner)
// corner the two half-plane cuts remove a wedge of at most one plank — a small
// dark notch under the baseboard, invisible in practice.

/** Even-odd point-in-polygon (handles concave outlines). */
function pointInPoly(px: number, pz: number, poly: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]
    const [xj, zj] = poly[j]
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az
  const len2 = dx * dx + dz * dz
  const t = len2 > 0 ? clamp(((px - ax) * dx + (pz - az) * dz) / len2, 0, 1) : 0
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t))
}

/** Sutherland–Hodgman: keep the part of `poly` left of the line a→b
 *  (right of it when `right` is set). */
function clipByLine(poly: Vec2[], ax: number, az: number, bx: number, bz: number, right = false): Vec2[] {
  const dx = bx - ax, dz = bz - az
  const sgn = right ? -1 : 1
  const side = (p: Vec2) => sgn * (dx * (p[1] - az) - dz * (p[0] - ax)) // >0 = kept side
  const out: Vec2[] = []
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i]
    const nxt = poly[(i + 1) % poly.length]
    const sc = side(cur), sn = side(nxt)
    if (sc >= 0) out.push(cur)
    if ((sc > 0 && sn < 0) || (sc < 0 && sn > 0)) {
      const t = sc / (sc - sn)
      out.push([cur[0] + (nxt[0] - cur[0]) * t, cur[1] + (nxt[1] - cur[1]) * t])
    }
  }
  return out
}

function segsCross(p: Vec2, p2: Vec2, q: Vec2, q2: Vec2): boolean {
  const d = (a: Vec2, b: Vec2, c: Vec2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const d1 = d(q, q2, p), d2 = d(q, q2, p2), d3 = d(p, p2, q), d4 = d(p, p2, q2)
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))
}

/** Does wall segment a→b actually touch the (convex) piece polygon? */
function segTouchesPoly(a: Vec2, b: Vec2, poly: Vec2[]): boolean {
  if (pointInPoly(a[0], a[1], poly) || pointInPoly(b[0], b[1], poly)) return true
  for (let i = 0; i < poly.length; i++) {
    if (segsCross(a, b, poly[i], poly[(i + 1) % poly.length])) return true
  }
  return false
}

/**
 * Cut one plank footprint (world coords, convex) to a CCW room outline.
 * Returns the convex parts to keep (0 = drop). Only edges the piece really
 * touches are used: a piece is clipped by an edge's half-plane where the
 * boundary is locally convex, while at a reflex (inner) corner whose BOTH
 * edges touch the piece the interior is the union of the two half-planes,
 * so the piece is split into P∩H1 and P∩H2∖H1 — exact, with one seam inside
 * that plank instead of a bite out of the floor.
 */
function clipPieceToOutline(piece: Vec2[], outline: Vec2[], reflex: boolean[]): Vec2[][] {
  const n = outline.length
  const hits: boolean[] = new Array(n).fill(false)
  let any = false
  for (let i = 0; i < n; i++) {
    hits[i] = segTouchesPoly(outline[i], outline[(i + 1) % n], piece)
    any ||= hits[i]
  }
  if (!any) {
    const [cx, cz] = piece.reduce<[number, number]>((s, p) => [s[0] + p[0] / piece.length, s[1] + p[1] / piece.length], [0, 0])
    return pointInPoly(cx, cz, outline) ? [piece] : []
  }
  let parts: Vec2[][] = [piece]
  const used: boolean[] = new Array(n).fill(false)
  // Reflex vertices touched by both adjacent edges: split, don't intersect.
  for (let v = 0; v < n; v++) {
    const e1 = (v - 1 + n) % n, e2 = v
    if (!reflex[v] || !hits[e1] || !hits[e2] || used[e1] || used[e2]) continue
    const a1 = outline[e1], b1 = outline[v], a2 = outline[v], b2 = outline[(v + 1) % n]
    const next: Vec2[][] = []
    for (const P of parts) {
      const inH1 = clipByLine(P, a1[0], a1[1], b1[0], b1[1])
      const notH1 = clipByLine(P, a1[0], a1[1], b1[0], b1[1], true)
      const inH2only = notH1.length >= 3 ? clipByLine(notH1, a2[0], a2[1], b2[0], b2[1]) : []
      if (inH1.length >= 3) next.push(inH1)
      if (inH2only.length >= 3) next.push(inH2only)
    }
    parts = next
    used[e1] = used[e2] = true
  }
  // Everything else: ordinary half-plane cuts.
  for (let e = 0; e < n; e++) {
    if (!hits[e] || used[e]) continue
    const a = outline[e], b = outline[(e + 1) % n]
    parts = parts.map((P) => clipByLine(P, a[0], a[1], b[0], b[1])).filter((P) => P.length >= 3)
  }
  return parts.filter((P) => Math.abs(signedArea(P)) > 2e-4) // drop < 2 cm² slivers
}

export interface BuiltFloor {
  group: THREE.Group
  /** Total plank/tile instances actually placed. */
  count: number
  /** Distinct InstancedMeshes (one per piece class). */
  classCount: number
  /** Shared by every mesh — the caller hangs the plank texture on `.map`
   *  once it has loaded, without rebuilding any geometry. */
  material: THREE.MeshStandardMaterial
  dispose(): void
}

const noRaycast = () => { /* planks never intercept picks — the slab does */ }

/**
 * Build the whole patterned floor as a THREE.Group of InstancedMeshes.
 * Plank bottoms sit at the group's y=0; position the group so the slab shows
 * through the gaps.
 *
 * Rectangular rooms (no `clipPoly`): planks overhang the W×D rect and are
 * sliced at the walls by four material clipping planes, tucked 2 cm outward
 * so the cut edge hides under the baseboard. Requires
 * `renderer.localClippingEnabled = true` (the caller sets it).
 *
 * Polygon rooms (`clipPoly`: the room outline, metres, same centred frame as
 * the group): pieces are clipped analytically against the outline instead —
 * see the polygon-clipping section above. W/D are the outline's bounding
 * extents around the origin.
 */
export function buildFloorGroup(
  state: FloorPatternState,
  W: number,
  D: number,
  fallbackBaseColor: string,
  clipPoly?: Vec2[],
): BuiltFloor {
  const { classes, count, resolved } = computeFloorPieces(state, W, D, fallbackBaseColor)

  const clip = 0.02
  const clippingPlanes = clipPoly ? undefined : [
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), W / 2 + clip),
    new THREE.Plane(new THREE.Vector3(1, 0, 0), W / 2 + clip),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), D / 2 + clip),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), D / 2 + clip),
  ]

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff, // real tone lives in the per-instance colours
    roughness: 0.5,
    metalness: 0.04,
    envMapIntensity: 0.4,
    clippingPlanes,
    vertexColors: true, // the baked AO rim on chamfer + sides
  })

  // The room outline, forced CCW so "left of each edge" is the interior. No
  // outward expansion: the polygon shell's wall boxes sit centred on these
  // edges, so a cut exactly at the edge line already hides under the wall.
  const outline = clipPoly ? ensureCCW(clipPoly) : null
  // Reflex (inner) corners of the outline: cross product of adjacent edges < 0 for CCW.
  const reflex = outline
    ? outline.map((v, i) => {
      const p = outline[(i - 1 + outline.length) % outline.length]
      const q = outline[(i + 1) % outline.length]
      return (v[0] - p[0]) * (q[1] - v[1]) - (v[1] - p[1]) * (q[0] - v[0]) < 0
    })
    : null

  const group = new THREE.Group()
  const geometries: THREE.BufferGeometry[] = []
  const gap = resolved.gapM
  const m4 = new THREE.Matrix4()
  const quat = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const yAxis = new THREE.Vector3(0, 1, 0)
  const color = new THREE.Color()
  const merged = emptyPrismArrays()
  let placed = 0

  for (const cls of classes) {
    const footprint = insetConvexPoly(cls.poly, gap / 2)
    const radius = footprint.reduce((m, [x, z]) => Math.max(m, Math.hypot(x, z)), 0)
    // One texture tile per plank, measured on the NOMINAL footprint (before
    // the gap inset) so every piece of a class — whole or cut at a wall —
    // samples the same tile at the same scale.
    const uvLocal = resolved.textureRotation === 90
      ? rotateUvFrame90(localUvFrame(cls.poly))
      : localUvFrame(cls.poly)

    let pieces = cls.pieces
    if (outline && reflex) {
      const kept: FloorPiece[] = []
      const n = outline.length
      for (const p of pieces) {
        // Cheap prefilter: a piece whose bounding circle clears every wall
        // edge is wholly in or wholly out — decided by its centre.
        let nearAny = false
        for (let i = 0; i < n && !nearAny; i++) {
          const a = outline[i], b = outline[(i + 1) % n]
          nearAny = distToSegment(p.x, p.z, a[0], a[1], b[0], b[1]) < radius + 0.005
        }
        if (!nearAny) {
          if (pointInPoly(p.x, p.z, outline)) kept.push(p)
          continue
        }
        // Boundary piece: exact cut of its world footprint against the outline.
        const cos = Math.cos(p.rot), sin = Math.sin(p.rot)
        const world: Vec2[] = footprint.map(([x, z]) => [p.x + x * cos - z * sin, p.z + x * sin + z * cos])
        const parts = clipPieceToOutline(ensureCCW(world), outline, reflex)
        if (parts.length === 0) continue
        const c = new THREE.Color(shadeColor(resolved.baseColor, pieceShade(p, resolved)))
        // The cut parts keep the UNCUT plank's uv frame, so a sawn plank
        // shows the matching part of the tile, not a squeezed whole one.
        const uvWorld = placeUvFrame(uvLocal, p.x, p.z, p.rot)
        for (const part of parts) {
          appendChamferedPrism(merged, ensureCCW(part), PLANK_THICKNESS, resolved.bevelM, [c.r, c.g, c.b], uvWorld)
        }
        placed++
      }
      pieces = kept
    }

    if (pieces.length > 0) {
      const geo = chamferedPrismGeometry(footprint, PLANK_THICKNESS, resolved.bevelM, uvLocal)
      geometries.push(geo)
      const mesh = new THREE.InstancedMesh(geo, material, pieces.length)
      pieces.forEach((p, i) => {
        pos.set(p.x, 0, p.z)
        // Generator rotations are CCW in (x,z) math coords; THREE's rotation
        // about +Y is the mirror of that, hence the sign flip.
        quat.setFromAxisAngle(yAxis, -p.rot)
        m4.compose(pos, quat, one)
        mesh.setMatrixAt(i, m4)
        color.setStyle(shadeColor(resolved.baseColor, pieceShade(p, resolved)))
        mesh.setColorAt(i, color)
      })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.castShadow = false
      mesh.receiveShadow = true
      // Bounds would be computed from the base plank alone — planks span the
      // whole room, so culling by that sphere blanks the floor mid-orbit.
      mesh.frustumCulled = false
      mesh.raycast = noRaycast
      group.add(mesh)
      placed += pieces.length
    }
  }

  if (merged.positions.length > 0) {
    const geo = arraysToGeometry(merged)
    geometries.push(geo)
    const mesh = new THREE.Mesh(geo, material)
    mesh.castShadow = false
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    mesh.raycast = noRaycast
    group.add(mesh)
  }

  return {
    group,
    count: outline ? placed : count,
    classCount: classes.length,
    material,
    dispose() {
      for (const g of geometries) g.dispose()
      material.dispose()
    },
  }
}
