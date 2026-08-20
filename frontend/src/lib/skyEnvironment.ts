/**
 * The studio's own sky — drawn, not downloaded.
 *
 * A photographic HDRI is a single frozen moment: its sun is wherever the
 * photographer stood, at whatever hour they were there, and no slider moves it.
 * Once the room is lit by a real solar position that mismatch is the first
 * thing you see — a noon key light under a dusk sky, or midnight outside a
 * window that is still bright.
 *
 * So the sky is generated instead, as an equirectangular canvas keyed to the
 * same `SunState` that drives the directional light. The sun sits where the
 * astronomy puts it, the palette walks night → dawn → day → dusk with it, the
 * city comes on after dark, and the whole thing is ours to tune: every colour
 * below is a brand knob, not a property of somebody's photograph.
 *
 * The layout is three.js's own equirect convention, so the texture can be
 * assigned straight to `scene.background` and `scene.environment`:
 *
 *   u = atan2(d.z, d.x) / 2π + 0.5      x across the canvas
 *   v = asin(d.y) / π + 0.5             y up the canvas (CanvasTexture flips)
 *
 * which puts the zenith on the top row, the nadir on the bottom, and the
 * horizon exactly halfway down.
 */
import * as THREE from 'three'
import type { SunState } from './sunPosition'
import { daylight } from './sunPosition'

// ─── Brand palette ────────────────────────────────────────────────────────────
// Three keyframes the sky is mixed from. Dusk is the warm one, and it carries
// the brand's own accent rather than a generic sunset orange.

interface SkyPalette {
  zenith: string
  horizon: string
  ground: string
  /** Tint of the broad glow that sits around the sun. */
  glow: string
}

const NIGHT: SkyPalette = {
  zenith: '#05070F',
  horizon: '#141A2E',
  ground: '#090B12',
  glow: '#2A3A6B',
}

const DUSK: SkyPalette = {
  zenith: '#2B3566',
  horizon: '#E08A4C',
  ground: '#2A2119',
  glow: '#FF9A4A',
}

const DAY: SkyPalette = {
  zenith: '#3B63DE', // brand-light — the sky is where the brand blue lives
  horizon: '#CFE0F2',
  ground: '#6E6A61',
  glow: '#FFF0D4',
}

/** Lit windows after dark. */
const WINDOW_LIT = '#FFD9A0'

const WIDTH = 1024
const HEIGHT = 512

// ─── Colour helpers ───────────────────────────────────────────────────────────

type RGB = [number, number, number]

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToCss([r, g, b]: RGB, alpha = 1): string {
  return alpha >= 1
    ? `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`
    : `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha})`
}

function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/**
 * Mix the three keyframes.
 *
 * Dusk sits at the *middle* of the daylight range rather than at a particular
 * clock time, which is what keeps the warm band tied to the sun crossing the
 * horizon instead of to a fixed hour that drifts with the season.
 */
function paletteAt(day: number): { zenith: RGB; horizon: RGB; ground: RGB; glow: RGB } {
  const pick = (k: keyof SkyPalette): RGB => {
    const night = hexToRgb(NIGHT[k])
    const dusk = hexToRgb(DUSK[k])
    const noon = hexToRgb(DAY[k])
    return day < 0.5
      ? mixRgb(night, dusk, day * 2)
      : mixRgb(dusk, noon, (day - 0.5) * 2)
  }
  return { zenith: pick('zenith'), horizon: pick('horizon'), ground: pick('ground'), glow: pick('glow') }
}

/**
 * Deterministic hash noise. `Math.random` would reshuffle the stars and the
 * skyline on every redraw, so the city would rebuild itself each time the
 * slider moved a notch.
 */
function hash(n: number): number {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return v - Math.floor(v)
}

// ─── Projection ───────────────────────────────────────────────────────────────

/** Canvas pixel for a scene-space direction, in three's equirect layout. */
function project(direction: readonly [number, number, number]): [number, number] {
  const [x, y, z] = direction
  const u = Math.atan2(z, x) / (Math.PI * 2) + 0.5
  const v = Math.asin(y < -1 ? -1 : y > 1 ? 1 : y) / Math.PI + 0.5
  // v runs up; the canvas runs down, and CanvasTexture's flipY undoes exactly
  // one of those — so the row is (1 - v).
  return [u * WIDTH, (1 - v) * HEIGHT]
}

// ─── Drawing ──────────────────────────────────────────────────────────────────

function drawSkyAndGround(
  ctx: CanvasRenderingContext2D,
  pal: ReturnType<typeof paletteAt>,
) {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT / 2)
  sky.addColorStop(0, rgbToCss(pal.zenith))
  sky.addColorStop(0.62, rgbToCss(mixRgb(pal.zenith, pal.horizon, 0.55)))
  sky.addColorStop(1, rgbToCss(pal.horizon))
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, WIDTH, HEIGHT / 2)

  // The ground half is never seen through a window, but it is half the IBL —
  // a black lower hemisphere is what makes rooms look bottom-lit and grey.
  const ground = ctx.createLinearGradient(0, HEIGHT / 2, 0, HEIGHT)
  ground.addColorStop(0, rgbToCss(mixRgb(pal.ground, pal.horizon, 0.35)))
  ground.addColorStop(1, rgbToCss(pal.ground))
  ctx.fillStyle = ground
  ctx.fillRect(0, HEIGHT / 2, WIDTH, HEIGHT / 2)
}

/** Stars fade in as the sky darkens, and only above the horizon. */
function drawStars(ctx: CanvasRenderingContext2D, day: number) {
  const visibility = clamp01(1 - day * 2.2)
  if (visibility <= 0) return
  ctx.save()
  for (let i = 0; i < 420; i++) {
    const x = hash(i * 3 + 1) * WIDTH
    // Squared, so stars thin out toward the horizon the way haze does it.
    const t = hash(i * 3 + 2)
    const y = (1 - t * t) * (HEIGHT / 2) * 0.98
    const mag = hash(i * 3 + 3)
    ctx.globalAlpha = visibility * (0.25 + mag * 0.75)
    ctx.fillStyle = mag > 0.93 ? '#CFE0FF' : '#FFFFFF'
    ctx.beginPath()
    ctx.arc(x, y, 0.5 + mag * 1.1, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/**
 * A skyline at the horizon — the thing you actually look at through a window.
 *
 * Widths are normalised to sum to exactly the canvas width, so the strip wraps
 * without a seam splitting a tower down the middle.
 */
function drawSkyline(ctx: CanvasRenderingContext2D, pal: ReturnType<typeof paletteAt>, day: number) {
  const base = HEIGHT / 2
  const silhouette = rgbToCss(mixRgb(pal.ground, [0, 0, 0], 0.45))
  const lit = clamp01(1 - day * 1.6)

  const COUNT = 46
  const widths = Array.from({ length: COUNT }, (_, i) => 0.5 + hash(i * 7 + 11))
  const total = widths.reduce((s, w) => s + w, 0)

  let x = 0
  for (let i = 0; i < COUNT; i++) {
    const w = (widths[i] / total) * WIDTH
    const h = (6 + hash(i * 7 + 13) * 40) * (0.6 + hash(i * 7 + 17) * 0.9)
    ctx.fillStyle = silhouette
    ctx.fillRect(x, base - h, w + 0.5, h)

    if (lit > 0.02) {
      // Window grid. Buildings keep their own lit/dark pattern between redraws
      // because the hash is seeded from the building and cell index.
      const cols = Math.max(1, Math.floor(w / 5))
      const rows = Math.max(1, Math.floor(h / 6))
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          if (hash(i * 991 + c * 37 + r * 5) > 0.62) continue
          ctx.globalAlpha = lit * (0.35 + hash(i * 13 + c * 3 + r) * 0.65)
          ctx.fillStyle = WINDOW_LIT
          ctx.fillRect(x + c * 5 + 1.4, base - h + r * 6 + 1.6, 2, 2.6)
        }
      }
      ctx.globalAlpha = 1
    }
    x += w
  }
}

/**
 * The sun: a broad atmospheric glow, a warm band spilling along the horizon
 * beneath it, and the disc itself.
 *
 * Drawn with additive compositing so the glow brightens the sky rather than
 * painting a flat disc over it — the difference between a sun and a sticker.
 */
function drawSun(ctx: CanvasRenderingContext2D, sun: SunState, pal: ReturnType<typeof paletteAt>) {
  const [sx, sy] = project(sun.direction)
  const glowRgb = pal.glow

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'

  // Horizon spill: an ellipse wide along the horizon, shallow across it. This
  // is what sells a low sun — the whole sky near it warms up, not just the disc.
  const spillStrength = clamp01(1 - Math.abs(sun.altitude) / 25)
  if (spillStrength > 0) {
    ctx.save()
    ctx.translate(sx, HEIGHT / 2)
    ctx.scale(1, 0.16)
    const spill = ctx.createRadialGradient(0, 0, 0, 0, 0, WIDTH * 0.34)
    spill.addColorStop(0, rgbToCss(glowRgb, 0.55 * spillStrength))
    spill.addColorStop(0.45, rgbToCss(glowRgb, 0.16 * spillStrength))
    spill.addColorStop(1, rgbToCss(glowRgb, 0))
    ctx.fillStyle = spill
    ctx.fillRect(-WIDTH, -WIDTH * 0.34, WIDTH * 2, WIDTH * 0.68)
    ctx.restore()
  }

  if (sun.isUp) {
    const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, HEIGHT * 0.34)
    halo.addColorStop(0, rgbToCss(hexToRgb(sun.color), 0.75))
    halo.addColorStop(0.12, rgbToCss(glowRgb, 0.3))
    halo.addColorStop(1, rgbToCss(glowRgb, 0))
    ctx.fillStyle = halo
    ctx.fillRect(sx - HEIGHT * 0.34, sy - HEIGHT * 0.34, HEIGHT * 0.68, HEIGHT * 0.68)

    // The disc. Small — the real one is half a degree, and an oversized sun is
    // the surest way to make a sky read as fake.
    const r = HEIGHT * 0.018
    const disc = ctx.createRadialGradient(sx, sy, 0, sx, sy, r)
    disc.addColorStop(0, '#FFFFFF')
    disc.addColorStop(0.55, sun.color)
    disc.addColorStop(1, rgbToCss(hexToRgb(sun.color), 0))
    ctx.fillStyle = disc
    ctx.beginPath()
    ctx.arc(sx, sy, r, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * An equirectangular sky for this sun, ready for `scene.background` and
 * `scene.environment`.
 *
 * The caller owns the result and must `dispose()` it — one is built per
 * distinct time of day, and a session scrubbing the clock makes plenty.
 */
export function createSkyTexture(sun: SunState): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')!

  const day = daylight(sun.altitude)
  const pal = paletteAt(day)

  drawSkyAndGround(ctx, pal)
  drawStars(ctx, day)

  // Draw the sun three times, a full turn apart, so a glow straddling the
  // u = 0 seam arrives whole instead of clipped in half.
  for (const shift of [-WIDTH, 0, WIDTH]) {
    ctx.save()
    ctx.translate(shift, 0)
    drawSun(ctx, sun, pal)
    ctx.restore()
  }

  drawSkyline(ctx, pal, day)

  const tex = new THREE.CanvasTexture(canvas)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

/**
 * The horizon colour at this hour — what the scene fog should be.
 *
 * Fog that stays a fixed daytime beige while the sky goes dark reads as a grey
 * veil hanging in a night room; matching it to the horizon is what makes
 * distance fade into the sky instead of over it.
 */
export function skyFogColor(sun: SunState): string {
  const [r, g, b] = paletteAt(daylight(sun.altitude)).horizon
  const hex = (v: number) => Math.round(clamp01(v / 255) * 255).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

/**
 * How strongly the sky should light the room, given where the sun is.
 *
 * Separate from the sun's own intensity because they answer different
 * questions: the beam is gone the moment the sun sets, while the sky above the
 * room stays bright for another half hour and then keeps a floor of moonlight
 * and city glow that never quite reaches zero.
 */
export function skyIntensity(sun: SunState): number {
  return 0.08 + 0.62 * daylight(sun.altitude)
}
