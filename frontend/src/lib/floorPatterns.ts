/**
 * Procedural floor laying patterns for the Pol phase.
 *
 * Each pattern draws ONE seamlessly tiling unit onto a 2D canvas; WoodFloor
 * turns it into a repeating THREE.CanvasTexture with the repeat count derived
 * from the unit's real-world size, so a 4×3 m room shows planks at realistic
 * scale. The drawing style (flat base colour + per-plank tone jitter + light
 * grain strokes + grout outlines) deliberately mirrors the existing
 * parquet/laminate canvases in FloorCeiling.tsx so the patterns look native.
 *
 * The module is standalone: the caller passes the fallback base colour
 * (normally FLOOR_COLORS[floorType]) so the floor type keeps deciding the
 * material palette unless the user overrides it in the pattern settings.
 */

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

/** User-tweakable knobs. All optional — absent means the pattern default. */
export interface FloorPatternSettings {
  /** Plank/tile base colour (hex). Default: the floor type's palette colour. */
  baseColor?: string
  /** Second colour where the pattern uses one (checker board, mosaic accents,
   *  chantilly/versailles insets). Default: a darker shade of baseColor. */
  accentColor?: string
  plankWidthCm?: number
  plankLengthCm?: number
  /** Grout / joint line intensity, 0..1. */
  grout?: number
  /** Whole-pattern rotation on the floor plane. */
  rotationDeg?: 0 | 45 | 90
  /** Overall scale multiplier on the physical pattern size. */
  scale?: number
}

/** What DesignState stores. */
export interface FloorPatternState {
  id: FloorPatternId
  settings?: FloorPatternSettings
}

export interface ResolvedFloorPattern {
  baseColor: string
  accentColor: string
  /** Plank width, metres, scale applied. */
  wM: number
  /** Plank length, metres, scale applied. */
  lM: number
  grout: number
  rotationDeg: number
  scale: number
}

export interface FloorPatternDef {
  id: FloorPatternId
  /** Label kept verbatim from the reference sheet. */
  label: string
  usesAccent: boolean
  usesLength: boolean
  defaultWidthCm: number
  defaultLengthCm: number
  /** Physical size of one tiling unit, metres. */
  unit(r: ResolvedFloorPattern): { wM: number; hM: number }
  draw(ctx: CanvasRenderingContext2D, cw: number, ch: number, r: ResolvedFloorPattern): void
}

// ─── Small helpers ────────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

const mod = (a: number, n: number) => ((a % n) + n) % n

/** Deterministic 0..1 hash — same trick the existing canvases use (sin-based),
 *  so reloads and re-renders always produce the identical floor. */
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

/** Mix a hex colour toward white (f>0) or black (f<0), f in -1..1. */
export function shadeColor(hex: string, f: number): string {
  const [r, g, b] = hexToRgb(hex)
  const t = f > 0 ? 255 : 0
  const a = Math.abs(clamp(f, -1, 1))
  const mix = (c: number) => Math.round(c + (t - c) * a)
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`
}

/** Per-draw context bundle so every element strokes/joints consistently. */
interface P {
  ctx: CanvasRenderingContext2D
  r: ResolvedFloorPattern
  /** Grout line width, px. */
  lw: number
  /** Grout stroke style. */
  stroke: string
  grainAlpha: number
}

function makeP(ctx: CanvasRenderingContext2D, cw: number, unitWm: number, r: ResolvedFloorPattern): P {
  const pxPerM = cw / unitWm
  return {
    ctx,
    r,
    lw: clamp(pxPerM * 0.002 * (0.5 + 1.8 * r.grout), 1, 7),
    stroke: `rgba(32,20,10,${(0.14 + 0.42 * r.grout).toFixed(3)})`,
    grainAlpha: 0.05,
  }
}

/** Light grain strokes along the plank's long axis (same spirit as the
 *  existing parquet drawing). Seed-deterministic so a plank drawn twice
 *  across a canvas edge gets identical grain — that's what keeps it seamless. */
function grain(p: P, x: number, y: number, w: number, h: number, seed: number) {
  const { ctx } = p
  ctx.strokeStyle = `rgba(0,0,0,${p.grainAlpha})`
  ctx.lineWidth = Math.max(0.6, p.lw * 0.3)
  const along = w >= h
  const n = 2 + Math.floor(hash(seed, 3.7) * 2)
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1)
    ctx.beginPath()
    if (along) {
      const gy = y + h * t + (hash(seed, i) - 0.5) * h * 0.18
      ctx.moveTo(x + 2, gy)
      ctx.quadraticCurveTo(
        x + w * 0.5, gy + (hash(seed, i + 9.1) - 0.5) * h * 0.3,
        x + w - 2, gy + (hash(seed, i + 5.3) - 0.5) * h * 0.15,
      )
    } else {
      const gx = x + w * t + (hash(seed, i) - 0.5) * w * 0.18
      ctx.moveTo(gx, y + 2)
      ctx.quadraticCurveTo(
        gx + (hash(seed, i + 9.1) - 0.5) * w * 0.3, y + h * 0.5,
        gx + (hash(seed, i + 5.3) - 0.5) * w * 0.15, y + h - 2,
      )
    }
    ctx.stroke()
  }
}

/** One rectangular plank: tone-jittered fill, grain, grout outline.
 *  (id1,id2) must already be wrapped to the pattern's period. */
function plank(
  p: P, x: number, y: number, w: number, h: number,
  id1: number, id2: number, color?: string, withGrain = true,
) {
  const tone = hash(id1, id2, 0.5) * 2 - 1
  p.ctx.fillStyle = shadeColor(color ?? p.r.baseColor, tone * 0.09)
  p.ctx.fillRect(x, y, w, h)
  if (withGrain) grain(p, x, y, w, h, id1 * 57.31 + id2 * 3.7)
  p.ctx.strokeStyle = p.stroke
  p.ctx.lineWidth = p.lw
  p.ctx.strokeRect(x, y, w, h)
}

type Pt = [number, number]
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

/** Quad plank (chevron parallelograms): fill + grain parallel to the
 *  p0→p1 / p3→p2 edges + grout outline. */
function quadPlank(p: P, pts: [Pt, Pt, Pt, Pt], id1: number, id2: number, color?: string) {
  const { ctx } = p
  const tone = hash(id1, id2, 0.5) * 2 - 1
  ctx.fillStyle = shadeColor(color ?? p.r.baseColor, tone * 0.09)
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1])
  ctx.closePath()
  ctx.fill()
  // grain: lines between the two long edges
  ctx.strokeStyle = `rgba(0,0,0,${p.grainAlpha})`
  ctx.lineWidth = Math.max(0.6, p.lw * 0.3)
  const seed = id1 * 57.31 + id2 * 3.7
  for (let i = 1; i <= 2; i++) {
    const t = i / 3 + (hash(seed, i) - 0.5) * 0.12
    const a = lerp(pts[0], pts[3], t)
    const b = lerp(pts[1], pts[2], t)
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke()
  }
  ctx.strokeStyle = p.stroke
  ctx.lineWidth = p.lw
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1])
  ctx.closePath()
  ctx.stroke()
}

const offCanvas = (x: number, y: number, w: number, h: number, cw: number, ch: number, pad = 4) =>
  x + w < -pad || y + h < -pad || x > cw + pad || y > ch + pad

// ─── Herringbone lattice (shared by single + double) ─────────────────────────
//
// Cells of size `cell`; the H+V pair (H = ratio×1 cells at p, V = 1×ratio at
// p+(ratio,0)) tiles the plane on the lattice m·(1,−1) + n·(ratio,ratio).
// The pattern is square-periodic with period 2·ratio cells, which is exactly
// what one canvas holds — tone ids are wrapped to (m mod 2·ratio, n mod 2) so
// planks that straddle a canvas edge repeat with identical shade and grain.
function drawHerringbone(
  p: P, cw: number, ch: number, ratio: number, cell: number,
  drawH: (p: P, x: number, y: number, mw: number, nw: number) => void,
  drawV: (p: P, x: number, y: number, mw: number, nw: number) => void,
) {
  const C = 2 * ratio
  for (let n = -2; n <= Math.ceil(C / ratio) + 2; n++) {
    for (let m = -C - ratio; m <= C + ratio; m++) {
      const px = (m + n * ratio) * cell
      const py = (-m + n * ratio) * cell
      const mw = mod(m, 2 * ratio)
      const nw = mod(n, 2)
      if (!offCanvas(px, py, ratio * cell, cell, cw, ch)) drawH(p, px, py, mw, nw)
      if (!offCanvas(px + ratio * cell, py, cell, ratio * cell, cw, ch)) drawV(p, px + ratio * cell, py, mw, nw)
    }
  }
}

// ─── Pattern definitions ──────────────────────────────────────────────────────

const herringbone: FloorPatternDef = {
  id: 'herringbone', label: 'Herringbone', usesAccent: false, usesLength: true,
  defaultWidthCm: 10, defaultLengthCm: 50,
  unit(r) {
    const ratio = clamp(Math.round(r.lM / r.wM), 2, 8)
    const s = 2 * ratio * r.wM
    return { wM: s, hM: s }
  },
  draw(ctx, cw, ch, r) {
    const ratio = clamp(Math.round(r.lM / r.wM), 2, 8)
    const cell = cw / (2 * ratio)
    const p = makeP(ctx, cw, 2 * ratio * r.wM, r)
    drawHerringbone(p, cw, ch, ratio, cell,
      (pp, x, y, mw, nw) => plank(pp, x, y, ratio * cell, cell, mw, nw * 31 + 1),
      (pp, x, y, mw, nw) => plank(pp, x, y, cell, ratio * cell, mw, nw * 31 + 17),
    )
  },
}

const doubleHerringbone: FloorPatternDef = {
  id: 'double_herringbone', label: 'Double Herringbone', usesAccent: false, usesLength: true,
  defaultWidthCm: 8, defaultLengthCm: 48,
  unit(r) {
    const block = 2 * r.wM
    const ratio = clamp(Math.round(r.lM / block), 2, 6)
    const s = 2 * ratio * block
    return { wM: s, hM: s }
  },
  draw(ctx, cw, ch, r) {
    const blockM = 2 * r.wM
    const ratio = clamp(Math.round(r.lM / blockM), 2, 6)
    const cell = cw / (2 * ratio) // one BLOCK in px
    const half = cell / 2         // one plank width in px
    const p = makeP(ctx, cw, 2 * ratio * blockM, r)
    drawHerringbone(p, cw, ch, ratio, cell,
      (pp, x, y, mw, nw) => {
        plank(pp, x, y, ratio * cell, half, mw, nw * 31 + 1)
        plank(pp, x, y + half, ratio * cell, half, mw, nw * 31 + 7)
      },
      (pp, x, y, mw, nw) => {
        plank(pp, x, y, half, ratio * cell, mw, nw * 31 + 17)
        plank(pp, x + half, y, half, ratio * cell, mw, nw * 31 + 23)
      },
    )
  },
}

const chevron: FloorPatternDef = {
  id: 'chevron', label: 'Chevron', usesAccent: false, usesLength: true,
  defaultWidthCm: 10, defaultLengthCm: 55,
  unit(r) {
    const colW = r.lM * Math.SQRT1_2
    const bandH = r.wM * Math.SQRT2
    const nb = Math.max(2, Math.round((2 * colW) / bandH))
    return { wM: 2 * colW, hM: nb * bandH }
  },
  draw(ctx, cw, ch, r) {
    const colW = r.lM * Math.SQRT1_2
    const bandH = r.wM * Math.SQRT2
    const nb = Math.max(2, Math.round((2 * colW) / bandH))
    const cpx = cw / 2
    const bpx = ch / nb
    // 45° in metres → pixel rise over one column
    const rise = colW * (ch / (nb * bandH))
    const p = makeP(ctx, cw, 2 * colW, r)
    for (let col = -1; col <= 2; col++) {
      const x0 = col * cpx
      const x1 = x0 + cpx
      const even = mod(col, 2) === 0
      for (let b = -2; b <= nb + 1; b++) {
        const yb = b * bpx
        const yl = even ? yb : yb - rise
        const yr = even ? yb - rise : yb
        const pts: [Pt, Pt, Pt, Pt] = [[x0, yl], [x1, yr], [x1, yr + bpx], [x0, yl + bpx]]
        const ys = Math.min(yl, yr)
        if (offCanvas(x0, ys, cpx, bpx + rise, cw, ch)) continue
        quadPlank(p, pts, mod(b, nb), even ? 1 : 2)
      }
    }
  },
}

const woodStrip: FloorPatternDef = {
  id: 'wood_strip', label: 'Wood Strip', usesAccent: false, usesLength: true,
  defaultWidthCm: 12, defaultLengthCm: 120,
  unit(r) {
    const ncols = clamp(Math.round((2 * r.lM) / r.wM), 4, 20)
    return { wM: ncols * r.wM, hM: 2 * r.lM }
  },
  draw(ctx, cw, ch, r) {
    const ncols = clamp(Math.round((2 * r.lM) / r.wM), 4, 20)
    const colPx = cw / ncols
    const Lpx = ch / 2
    const p = makeP(ctx, cw, ncols * r.wM, r)
    for (let col = 0; col < ncols; col++) {
      // Two staggered butt joints per vertical period → varied plank lengths
      // that still wrap exactly every 2·L.
      const o = hash(col, 11.3) * Lpx
      const j2 = o + Lpx * (0.6 + 0.8 * hash(col, 23.7))
      const joints: number[] = []
      for (let k = -2; k <= 2; k++) { joints.push(o + k * 2 * Lpx, j2 + k * 2 * Lpx) }
      joints.sort((a, b) => a - b)
      for (let i = 0; i < joints.length - 1; i++) {
        const y0 = joints[i]
        const hpx = joints[i + 1] - y0
        if (offCanvas(col * colPx, y0, colPx, hpx, cw, ch)) continue
        plank(p, col * colPx, y0, colPx, hpx, col, mod(i, 2) * 13 + 5)
      }
    }
  },
}

function drawBond(ctx: CanvasRenderingContext2D, cw: number, ch: number, r: ResolvedFloorPattern, offsetHalf: boolean) {
  let nr = clamp(Math.round((2 * r.lM) / r.wM), 4, 24)
  if (nr % 2) nr += 1
  const bx = cw / 2
  const by = ch / nr
  const p = makeP(ctx, cw, 2 * r.lM, r)
  for (let i = -1; i <= nr; i++) {
    const off = offsetHalf && mod(i, 2) === 1 ? bx / 2 : 0
    for (let j = -1; j <= 2; j++) {
      const x = j * bx + off
      const y = i * by
      if (offCanvas(x, y, bx, by, cw, ch)) continue
      plank(p, x, y, bx, by, mod(j, 2) * 7 + 3, mod(i, nr))
    }
  }
}

const brickBond: FloorPatternDef = {
  id: 'brick_bond', label: 'Brick Bond', usesAccent: false, usesLength: true,
  defaultWidthCm: 15, defaultLengthCm: 90,
  unit(r) {
    let nr = clamp(Math.round((2 * r.lM) / r.wM), 4, 24)
    if (nr % 2) nr += 1
    return { wM: 2 * r.lM, hM: nr * r.wM }
  },
  draw(ctx, cw, ch, r) { drawBond(ctx, cw, ch, r, true) },
}

const stakeBond: FloorPatternDef = {
  id: 'stake_bond', label: 'Stake Bond', usesAccent: false, usesLength: true,
  defaultWidthCm: 20, defaultLengthCm: 60,
  unit(r) {
    let nr = clamp(Math.round((2 * r.lM) / r.wM), 4, 24)
    if (nr % 2) nr += 1
    return { wM: 2 * r.lM, hM: nr * r.wM }
  },
  draw(ctx, cw, ch, r) { drawBond(ctx, cw, ch, r, false) },
}

const checkerBoard: FloorPatternDef = {
  id: 'checker_board', label: 'Checker Board', usesAccent: true, usesLength: true,
  defaultWidthCm: 10, defaultLengthCm: 40,
  unit(r) { return { wM: 2 * r.lM, hM: 2 * r.lM } },
  draw(ctx, cw, ch, r) {
    const s = cw / 2
    const p = makeP(ctx, cw, 2 * r.lM, r)
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const accent = (i + j) % 2 === 1
        const x = i * s
        const y = j * s
        const tone = hash(i, j, 0.5) * 2 - 1
        ctx.fillStyle = shadeColor(accent ? r.accentColor : r.baseColor, tone * 0.06)
        ctx.fillRect(x, y, s, s)
        // grain direction alternates with the colour — reads as parquet, not lino
        ctx.strokeStyle = 'rgba(0,0,0,0.06)'
        ctx.lineWidth = Math.max(0.6, p.lw * 0.3)
        const nLines = 5
        for (let g = 1; g < nLines; g++) {
          const t = (g / nLines) * s
          ctx.beginPath()
          if (accent) { ctx.moveTo(x + t, y + 2); ctx.lineTo(x + t, y + s - 2) }
          else { ctx.moveTo(x + 2, y + t); ctx.lineTo(x + s - 2, y + t) }
          ctx.stroke()
        }
        ctx.strokeStyle = p.stroke
        ctx.lineWidth = p.lw
        ctx.strokeRect(x, y, s, s)
      }
    }
  },
}

const mosaic: FloorPatternDef = {
  id: 'mosaic', label: 'Mosaic', usesAccent: false, usesLength: false,
  defaultWidthCm: 4, defaultLengthCm: 16,
  unit(r) { return { wM: 8 * r.wM, hM: 8 * r.wM } },
  draw(ctx, cw, ch, r) {
    // 4-finger squares, adjacent squares alternate finger direction.
    const s = cw / 2      // one square
    const f = s / 4       // one finger
    const p = makeP(ctx, cw, 8 * r.wM, r)
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const vertical = (i + j) % 2 === 0
        for (let k = 0; k < 4; k++) {
          const id1 = i * 2 + j
          if (vertical) plank(p, i * s + k * f, j * s, f, s, id1, k, undefined, false)
          else plank(p, i * s, j * s + k * f, s, f, id1, k + 11, undefined, false)
        }
      }
    }
  },
}

const chantilly: FloorPatternDef = {
  id: 'chantilly', label: 'Chantilly', usesAccent: true, usesLength: true,
  defaultWidthCm: 9, defaultLengthCm: 36,
  unit(r) { const u = r.lM + 2 * r.wM; return { wM: u, hM: u } },
  draw(ctx, cw, ch, r) {
    // Pinwheel: centre square + four border strips that each run past one
    // corner. Unit side = s + 2w; the strips are w × (s + w).
    const u = r.lM + 2 * r.wM
    const k = cw / u
    const s = r.lM * k
    const w = r.wM * k
    const p = makeP(ctx, cw, u, r)
    plank(p, 0, ch - w, s + w, w, 1, 1)          // bottom strip (canvas y down)
    plank(p, s + w, w, w, s + w, 2, 2)           // right strip
    plank(p, w, 0, s + w, w, 3, 3)               // top strip
    plank(p, 0, 0, w, s + w, 4, 4)               // left strip
    plank(p, w, w, s, s, 5, 5, r.accentColor)    // centre square
  },
}

const basketWeave: FloorPatternDef = {
  id: 'basket_weave', label: 'Basket Weave', usesAccent: false, usesLength: false,
  defaultWidthCm: 10, defaultLengthCm: 20,
  unit(r) { return { wM: 4 * r.wM, hM: 4 * r.wM } },
  draw(ctx, cw, ch, r) {
    const b = cw / 2      // block = 2 planks = square
    const half = b / 2
    const p = makeP(ctx, cw, 4 * r.wM, r)
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const horiz = (i + j) % 2 === 0
        const x = i * b
        const y = j * b
        if (horiz) {
          plank(p, x, y, b, half, i * 2 + j, 1)
          plank(p, x, y + half, b, half, i * 2 + j, 2)
        } else {
          plank(p, x, y, half, b, i * 2 + j, 3)
          plank(p, x + half, y, half, b, i * 2 + j, 4)
        }
      }
    }
  },
}

const doubleBasketWeave: FloorPatternDef = {
  id: 'double_basket_weave', label: 'Double Basket Weave', usesAccent: false, usesLength: false,
  defaultWidthCm: 8, defaultLengthCm: 32,
  unit(r) { return { wM: 8 * r.wM, hM: 8 * r.wM } },
  draw(ctx, cw, ch, r) {
    const b = cw / 2      // block = 4 planks = square
    const q = b / 4
    const p = makeP(ctx, cw, 8 * r.wM, r)
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const horiz = (i + j) % 2 === 0
        const x = i * b
        const y = j * b
        for (let k = 0; k < 4; k++) {
          if (horiz) plank(p, x, y + k * q, b, q, i * 2 + j, k)
          else plank(p, x + k * q, y, q, b, i * 2 + j, k + 7)
        }
      }
    }
  },
}

const versailles: FloorPatternDef = {
  id: 'versailles', label: 'Versailles', usesAccent: true, usesLength: true,
  defaultWidthCm: 11, defaultLengthCm: 120,
  unit(r) { return { wM: r.lM, hM: r.lM } },
  draw(ctx, cw, ch, r) {
    // Classic panel: mitred outer frame + interior diagonal woven lattice
    // with square insets. One canvas = one full panel, so tiling is seamless
    // by construction (panels repeat, as real Versailles parquet does).
    const p = makeP(ctx, cw, r.lM, r)
    const bw = clamp((r.wM / r.lM) * cw, cw * 0.04, cw * 0.16)
    const sw = bw * 0.82                     // lattice strip width
    const sp = sw * 2.6                      // lattice period
    const inner = cw - 2 * bw

    // interior — rotated 45°
    ctx.save()
    ctx.beginPath()
    ctx.rect(bw, bw, inner, inner)
    ctx.clip()
    ctx.translate(cw / 2, ch / 2)
    ctx.rotate(Math.PI / 4)
    const R = cw * 0.75
    const n = Math.ceil(R / sp) + 1
    // insets in the openings first (they sit "under" the lattice)
    for (let i = -n; i <= n; i++) {
      for (let j = -n; j <= n; j++) {
        const cxp = i * sp + sp / 2
        const cyp = j * sp + sp / 2
        const hole = sp - sw
        const tone = hash(i, j, 9.1) * 2 - 1
        ctx.fillStyle = shadeColor(r.accentColor, tone * 0.08)
        ctx.fillRect(cxp - hole / 2, cyp - hole / 2, hole, hole)
      }
    }
    // horizontal strips
    for (let j = -n; j <= n; j++) {
      plank(p, -R, j * sp - sw / 2, 2 * R, sw, mod(j, 7), 1, undefined, false)
    }
    // vertical strips
    for (let i = -n; i <= n; i++) {
      plank(p, i * sp - sw / 2, -R, sw, 2 * R, mod(i, 7), 2, undefined, false)
    }
    // weave: at alternating crossings, re-lay the horizontal strip on top
    for (let i = -n; i <= n; i++) {
      for (let j = -n; j <= n; j++) {
        if (mod(i + j, 2) !== 0) continue
        const x = i * sp - sw / 2
        const y = j * sp - sw / 2
        const tone = hash(mod(j, 7), 1, 0.5) * 2 - 1
        ctx.fillStyle = shadeColor(r.baseColor, tone * 0.09)
        ctx.fillRect(x - p.lw / 2, y + p.lw / 2, sw + p.lw, sw - p.lw)
        ctx.strokeStyle = p.stroke
        ctx.lineWidth = p.lw
        ctx.beginPath()
        ctx.moveTo(x - p.lw, y); ctx.lineTo(x + sw + p.lw, y)
        ctx.moveTo(x - p.lw, y + sw); ctx.lineTo(x + sw + p.lw, y + sw)
        ctx.stroke()
      }
    }
    ctx.restore()

    // frame — four mitred border planks
    plank(p, 0, 0, cw, bw, 21, 1)                    // top
    plank(p, 0, ch - bw, cw, bw, 21, 2)              // bottom
    plank(p, 0, 0, bw, ch, 21, 3)                    // left
    plank(p, cw - bw, 0, bw, ch, 21, 4)              // right
    // mitre joints
    ctx.strokeStyle = p.stroke
    ctx.lineWidth = p.lw
    ctx.beginPath()
    ctx.moveTo(0, 0); ctx.lineTo(bw, bw)
    ctx.moveTo(cw, 0); ctx.lineTo(cw - bw, bw)
    ctx.moveTo(0, ch); ctx.lineTo(bw, ch - bw)
    ctx.moveTo(cw, ch); ctx.lineTo(cw - bw, ch - bw)
    ctx.stroke()
    // heavier panel joint at the outer edge
    ctx.strokeStyle = `rgba(32,20,10,${(0.22 + 0.4 * r.grout).toFixed(3)})`
    ctx.lineWidth = p.lw * 1.4
    ctx.strokeRect(0, 0, cw, ch)
  },
}

export const FLOOR_PATTERNS: FloorPatternDef[] = [
  herringbone, doubleHerringbone, chevron, woodStrip,
  brickBond, stakeBond, checkerBoard, mosaic,
  chantilly, basketWeave, doubleBasketWeave, versailles,
]

const BY_ID = new Map(FLOOR_PATTERNS.map((d) => [d.id, d]))

export function floorPatternDef(id: string): FloorPatternDef | undefined {
  return BY_ID.get(id as FloorPatternId)
}

// ─── Resolution + rendering ───────────────────────────────────────────────────

export function resolveFloorPattern(
  def: FloorPatternDef,
  settings: FloorPatternSettings | undefined,
  fallbackBaseColor: string,
): ResolvedFloorPattern {
  const s = settings ?? {}
  const scale = clamp(s.scale ?? 1, 0.4, 2.5)
  const baseColor = s.baseColor ?? fallbackBaseColor
  return {
    baseColor,
    accentColor: s.accentColor ?? shadeColor(baseColor, -0.28),
    wM: (clamp(s.plankWidthCm ?? def.defaultWidthCm, 3, 40) / 100) * scale,
    lM: (clamp(s.plankLengthCm ?? def.defaultLengthCm, 10, 300) / 100) * scale,
    grout: clamp(s.grout ?? 0.35, 0, 1),
    rotationDeg: s.rotationDeg === 45 || s.rotationDeg === 90 ? s.rotationDeg : 0,
    scale,
  }
}

/** Draw one tiling unit of `state`'s pattern. Returns the canvas plus the
 *  unit's physical size (metres) — WoodFloor derives repeat counts from it. */
export function renderFloorPattern(
  state: FloorPatternState,
  fallbackBaseColor: string,
  px = 1024,
): { canvas: HTMLCanvasElement; unitWm: number; unitHm: number; rotationDeg: number } | null {
  const def = floorPatternDef(state.id)
  if (!def) return null
  const r = resolveFloorPattern(def, state.settings, fallbackBaseColor)
  const u = def.unit(r)
  const canvas = document.createElement('canvas')
  canvas.width = px
  canvas.height = clamp(Math.round(px * (u.hM / u.wM)), 64, 2048)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = r.baseColor
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  def.draw(ctx, canvas.width, canvas.height, r)
  return { canvas, unitWm: u.wM, unitHm: u.hM, rotationDeg: r.rotationDeg }
}
