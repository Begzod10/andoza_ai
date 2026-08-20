/**
 * Ceiling designs — the six drop-ceiling profiles, and the numbers behind them.
 *
 * These are not materials. A plasterboard ceiling is the same plasterboard
 * whichever of these you build; what changes is where it sits and where the
 * light hides. That is a geometry question, so every design here is a recipe
 * for boxes below the slab plus, in most of them, a cove for a strip that
 * washes the surface above it and is never seen directly.
 *
 * The numbers are settings rather than constants because they are exactly what
 * gets argued about on site — how far to drop, how wide to run the border, how
 * much reveal to leave. Each design declares which of them it actually uses, so
 * the panel offers the three sliders that matter to it instead of seven that
 * mostly do nothing.
 *
 * Everything is stored in millimetres, the unit the rest of the app measures
 * openings and furniture in, and converted once at the point geometry is built.
 */

import type { LightTypeId } from './lightCatalog'

export type CeilingDesignId =
  | 'flat'
  | 'double_layer'
  | 'floating'
  | 'border'
  | 'non_drop'
  | 'recessed'

export interface CeilingSettings {
  /** How far the ceiling drops below the structural slab, mm. */
  drop: number
  /** Width of the perimeter band, mm. */
  border: number
  /** Extra drop of the second layer below the first, mm. */
  innerDrop: number
  /** Open reveal the hidden LED sits in, mm. */
  gap: number
  /** Whether that reveal is lit. */
  strip: boolean
  /** Colour temperature of the strip, K. */
  stripK: number
  /** Plaster finish colour. */
  color: string
}

export type CeilingSettingKey = keyof CeilingSettings

export interface CeilingDesign {
  id: CeilingDesignId
  /** Uzbek label for the picker. */
  label: string
  /** What it does to a room, in one line. */
  hint: string
  /** Fixtures that belong with it — the pairing is half the design. */
  lighting: LightTypeId[]
  /** Which settings this design responds to; the rest are inert for it. */
  uses: CeilingSettingKey[]
  defaults: Partial<CeilingSettings>
}

export const CEILING_SETTING_DEFAULTS: CeilingSettings = {
  drop: 100,
  border: 420,
  innerDrop: 90,
  gap: 70,
  strip: true,
  stripK: 3000,
  color: '#F4F1EA',
}

export const CEILING_DESIGNS: CeilingDesign[] = [
  {
    id: 'flat',
    label: 'Tekis shift',
    hint: "Butun shiftni bir tekis pasaytiradi — sodda va toza yuza.",
    lighting: ['spotlight', 'track', 'led_linear'],
    uses: ['drop', 'gap', 'strip', 'stripK', 'color'],
    // 10 cm — the drop the trade actually specifies for a flat plasterboard
    // ceiling, and enough to bury a downlight can.
    defaults: { drop: 100, gap: 70 },
  },
  {
    id: 'double_layer',
    label: 'Ikki qavatli shift',
    hint: "Chuqurlik va hajm qo'shadi — ikki bosqichli yuza.",
    lighting: ['downlight', 'spotlight', 'led_linear'],
    uses: ['drop', 'innerDrop', 'border', 'strip', 'stripK', 'color'],
    defaults: { drop: 80, innerDrop: 90, border: 450 },
  },
  {
    id: 'floating',
    label: 'Suzuvchi shift',
    hint: "Suzib turgandek yengil ko'rinish — chekkasi bo'ylab yoritiladi.",
    lighting: ['track', 'spotlight', 'led_linear'],
    uses: ['drop', 'border', 'gap', 'strip', 'stripK', 'color'],
    defaults: { drop: 120, border: 500, gap: 90 },
  },
  {
    id: 'border',
    label: 'Hoshiyali shift',
    hint: 'Xona chegarasini aniq belgilaydigan toza hoshiya.',
    lighting: ['downlight', 'spotlight', 'led_linear'],
    uses: ['drop', 'border', 'strip', 'stripK', 'color'],
    defaults: { drop: 110, border: 420 },
  },
  {
    id: 'non_drop',
    label: 'Tushirilmagan shift',
    hint: "Oddiy, minimal va zamonaviy — balandlik butunlay saqlanadi.",
    lighting: ['downlight', 'spotlight', 'track', 'led_track'],
    uses: ['color'],
    defaults: { drop: 0, strip: false },
  },
  {
    id: 'recessed',
    label: 'Nishli shift',
    hint: "Yashirin nish — yumshoq va hashamatli yorug'lik beradi.",
    lighting: ['downlight', 'spotlight', 'led_linear'],
    uses: ['drop', 'border', 'gap', 'strip', 'stripK', 'color'],
    defaults: { drop: 130, border: 380, gap: 70 },
  },
]

export const DEFAULT_CEILING_DESIGN: CeilingDesignId = 'non_drop'

export function ceilingDesign(id: string | undefined): CeilingDesign {
  return CEILING_DESIGNS.find((d) => d.id === id) ?? CEILING_DESIGNS[4]
}

/** Global defaults, then the design's own, then whatever the user changed. */
export function resolveCeilingSettings(
  design: CeilingDesign,
  saved?: Partial<CeilingSettings>,
): CeilingSettings {
  return { ...CEILING_SETTING_DEFAULTS, ...design.defaults, ...saved }
}

/** Slider bounds for the panel, in mm. `strip` and `color` are not sliders. */
export const CEILING_SETTING_RANGE: Record<
  Exclude<CeilingSettingKey, 'strip' | 'color'>,
  { label: string; min: number; max: number; step: number; unit: string }
> = {
  drop: { label: 'Pasaytirish', min: 40, max: 400, step: 10, unit: 'mm' },
  border: { label: 'Hoshiya kengligi', min: 150, max: 1200, step: 10, unit: 'mm' },
  innerDrop: { label: "Ikkinchi qavat", min: 30, max: 300, step: 10, unit: 'mm' },
  gap: { label: 'Nish kengligi', min: 30, max: 200, step: 5, unit: 'mm' },
  stripK: { label: 'Lenta harorati', min: 2200, max: 6500, step: 100, unit: 'K' },
}

// ─── Geometry ─────────────────────────────────────────────────────────────────

export interface CeilingPart {
  /** Centre in room space, metres. Y is measured up from the floor. */
  position: [number, number, number]
  size: [number, number, number]
  /** `strip` parts are emissive; the rest take the plaster finish. */
  kind: 'panel' | 'strip'
}

/** Plasterboard on a frame, near enough. */
const SHEET = 0.03

/** How thick a hidden LED reads once it is in its channel. */
const STRIP_T = 0.035

/**
 * Four boxes forming a rectangular ring.
 *
 * The two that run along X take the full width and the two along Z are cut
 * short by the band width, so the corners butt instead of overlapping — z-fighting
 * in a corner is the kind of flicker that only shows up on someone else's GPU.
 */
function ring(
  halfW: number,
  halfD: number,
  band: number,
  y: number,
  height: number,
  kind: CeilingPart['kind'] = 'panel',
): CeilingPart[] {
  const innerD = Math.max(0, halfD * 2 - band * 2)
  return [
    { position: [0, y, -(halfD - band / 2)], size: [halfW * 2, height, band], kind },
    { position: [0, y, halfD - band / 2], size: [halfW * 2, height, band], kind },
    { position: [-(halfW - band / 2), y, 0], size: [band, height, innerD], kind },
    { position: [halfW - band / 2, y, 0], size: [band, height, innerD], kind },
  ]
}

/**
 * The boxes that make up one ceiling design.
 *
 * The room's structural slab is not included — `RoomScene` already draws it,
 * and it is what these parts hang below. A design that returns nothing (the
 * non-drop) is therefore not an empty ceiling, it is the slab itself.
 *
 * @param W/D/H interior width, depth and height in metres.
 */
export function buildCeilingParts(
  design: CeilingDesign,
  settings: CeilingSettings,
  W: number,
  D: number,
  H: number,
): CeilingPart[] {
  const drop = settings.drop / 1000
  const innerDrop = settings.innerDrop / 1000
  const gap = settings.gap / 1000
  const lit = settings.strip && design.uses.includes('strip')

  // A border wider than half the room is not a border, it is the ceiling, and
  // the ring's inner dimension goes negative. Leave a metre of clear span.
  const border = Math.min(settings.border / 1000, Math.max(0.1, Math.min(W, D) / 2 - 0.5))

  const halfW = W / 2
  const halfD = D / 2
  const parts: CeilingPart[] = []

  switch (design.id) {
    case 'non_drop':
      break

    case 'flat': {
      // Inset by the reveal when it is lit, so the light has somewhere to
      // escape upward — a cove with no gap is just a lower ceiling.
      const inset = lit ? gap : 0
      const y = H - drop - SHEET / 2
      parts.push({
        position: [0, y, 0],
        size: [W - inset * 2, SHEET, D - inset * 2],
        kind: 'panel',
      })
      if (lit) {
        parts.push(...ring(halfW, halfD, gap, H - drop + STRIP_T, STRIP_T, 'strip'))
      }
      break
    }

    case 'border': {
      parts.push(...ring(halfW, halfD, border, H - drop / 2, drop))
      if (lit) {
        // On the inner lip, pointing up the open centre.
        parts.push(
          ...ring(halfW - border + gap, halfD - border + gap, gap, H - drop + STRIP_T, STRIP_T, 'strip'),
        )
      }
      break
    }

    case 'floating': {
      // An island panel with clear air all round: nothing visibly holds it up,
      // which is the whole effect.
      const y = H - drop - SHEET / 2
      parts.push({
        position: [0, y, 0],
        size: [W - border * 2, SHEET, D - border * 2],
        kind: 'panel',
      })
      if (lit) {
        parts.push(
          ...ring(halfW - border + gap, halfD - border + gap, gap, H - drop + STRIP_T, STRIP_T, 'strip'),
        )
      }
      break
    }

    case 'double_layer': {
      const first = H - drop - SHEET / 2
      parts.push({ position: [0, first, 0], size: [W, SHEET, D], kind: 'panel' })
      // Second layer: a band under the first, dropping again at the perimeter.
      parts.push(...ring(halfW, halfD, border, H - drop - SHEET - innerDrop / 2, innerDrop))
      if (lit) {
        parts.push(
          ...ring(
            halfW - border + gap,
            halfD - border + gap,
            gap,
            H - drop - SHEET - innerDrop + STRIP_T,
            STRIP_T,
            'strip',
          ),
        )
      }
      break
    }

    case 'recessed': {
      parts.push(...ring(halfW, halfD, border, H - drop / 2, drop))
      // The trough: a shallower step just inside the band, so the LED sits
      // behind a lip and only its wash on the slab above is ever seen.
      const troughY = H - drop * 0.45
      parts.push(...ring(halfW - border + gap, halfD - border + gap, gap, troughY, drop * 0.35))
      if (lit) {
        parts.push(
          ...ring(
            halfW - border + gap,
            halfD - border + gap,
            gap * 0.6,
            troughY + drop * 0.2,
            STRIP_T,
            'strip',
          ),
        )
      }
      break
    }
  }

  return parts
}
