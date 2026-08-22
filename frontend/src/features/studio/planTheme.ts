/**
 * darkArchitecturalPlanTheme — the presentation look of the 2D plans.
 *
 * One place for every colour, line weight and type size the plan draws with.
 * The furniture plan previously carried its own literals scattered through
 * eight hundred lines of geometry, which made a change of look a hunt for hex
 * codes rather than an edit.
 *
 * Only the furniture plan (MebelPlanView) reads this so far. The lighting plan
 * (ChiroqPlanView) still has its own colours and has not been migrated — until
 * it is, the two will drift, which is the exact problem this file exists to
 * stop.
 *
 * Two things are worth understanding before editing these numbers.
 *
 * The plan is drawn in *millimetres* — the SVG viewBox is the room's real
 * dimensions — so every width here is a real-world width, not a pixel width.
 * A 16 mm stroke is about one and a half pixels on a 4 m room in a 450 px
 * panel. That is also what makes the hierarchy survive zooming and exporting:
 * strokes scale with the drawing rather than staying a fixed screen size.
 *
 * And the drawing is cut dark-on-light inverted: the floor is the ground and
 * the walls are the light poché cut through it. On a light plan the walls have
 * to be the darkest thing on the sheet to read at all, which makes them shout
 * over the furniture they exist to contain. Cut the other way, the wall band
 * separates by brightness alone and the furniture keeps the eye.
 */

export interface PlanPalette {
  /** The sheet the plan is drawn on. */
  canvas: string
  /**
   * Floor tones, in order of use. More than one so rooms of different kinds
   * can sit at slightly different values, as an architect's plan does; a plan
   * with a single room simply uses the first.
   */
  floors: [string, string, string]
  wallExterior: string
  wallInterior: string
  /** A tonal seam inside the wall band, reading as its core. */
  wallCore: string
  /** Ambient occlusion where a wall meets the floor. */
  wallShadow: string
  /** The lit upper edge of a wall. */
  wallHighlight: string
  /** Cast by the whole building footprint, so the plan sits above the sheet. */
  footprintShadow: string
  doorStroke: string
  windowStroke: string
  furnitureStroke: string
  furnitureDetail: string
  furnitureFill: string
  /** Restrained, per the brief: a cool grey-blue, never a bright box. */
  selection: string
  selectionFill: string
  label: string
  dimension: string
  grid: string
  hatch: string
}

/** Line weights in millimetres of plan, strongest first. */
export interface PlanWeights {
  wallExterior: number
  wallInterior: number
  wallCore: number
  wallShadow: number
  wallHighlight: number
  opening: number
  doorLeaf: number
  doorSwing: number
  furniture: number
  furnitureDetail: number
  grid: number
  hatch: number
  selection: number
}

export interface PlanType {
  family: string
  /** Room names, in millimetres of plan. */
  labelSize: number
  labelTracking: number
  labelWeight: number
  dimensionSize: number
  wallLetterSize: number
}

export interface PlanTheme {
  palette: PlanPalette
  weights: PlanWeights
  type: PlanType
  /** Spacing of the corridor hatch, mm. */
  hatchGap: number
  /** Multiplier applied when rendering to a bitmap. */
  exportScale: number
}

/**
 * The default: a monochrome charcoal presentation drawing.
 *
 * Nothing here is fully black. A true black floor leaves no room below it for
 * the shadows to read, and the drawing loses its depth at exactly the point it
 * needs it most — under the walls.
 */
const charcoal: PlanPalette = {
  canvas: '#17191B',
  floors: ['#212327', '#25272B', '#292B2E'],
  wallExterior: '#E5E5E3',
  wallInterior: '#D6D7D4',
  wallCore: '#B6B8B6',
  wallShadow: 'rgba(0,0,0,0.55)',
  wallHighlight: 'rgba(255,255,255,0.55)',
  footprintShadow: 'rgba(0,0,0,0.7)',
  doorStroke: 'rgba(205,210,212,0.72)',
  windowStroke: 'rgba(205,210,212,0.8)',
  furnitureStroke: 'rgba(205,210,212,0.68)',
  furnitureDetail: 'rgba(205,210,212,0.42)',
  furnitureFill: 'rgba(255,255,255,0.035)',
  selection: '#8FA6C4',
  selectionFill: 'rgba(143,166,196,0.16)',
  label: 'rgba(232,236,238,0.82)',
  dimension: 'rgba(205,210,212,0.55)',
  grid: 'rgba(255,255,255,0.05)',
  hatch: 'rgba(205,210,212,0.14)',
}

/**
 * The cyan blueprint alternative.
 *
 * Same drawing, same weights — only the values move, which is the point of
 * keeping them in one object. Swap `PALETTE` below to use it.
 */
const blueprint: PlanPalette = {
  canvas: '#0A1E2C',
  floors: ['#0E2839', '#113044', '#14374E'],
  wallExterior: '#2FE6E0',
  wallInterior: '#25BFBC',
  wallCore: '#1B8C8E',
  wallShadow: 'rgba(0,0,0,0.5)',
  wallHighlight: 'rgba(180,255,252,0.65)',
  footprintShadow: 'rgba(0,0,0,0.65)',
  doorStroke: 'rgba(140,235,235,0.7)',
  windowStroke: 'rgba(160,240,240,0.85)',
  furnitureStroke: 'rgba(150,231,232,0.7)',
  furnitureDetail: 'rgba(150,231,232,0.4)',
  furnitureFill: 'rgba(47,230,224,0.05)',
  selection: '#7FD4FF',
  selectionFill: 'rgba(127,212,255,0.16)',
  label: 'rgba(198,247,247,0.85)',
  dimension: 'rgba(150,231,232,0.55)',
  grid: 'rgba(47,230,224,0.07)',
  hatch: 'rgba(150,231,232,0.16)',
}

export const PLAN_PALETTES = { charcoal, blueprint } as const
export type PlanPaletteName = keyof typeof PLAN_PALETTES

/** Switch this one line to change every plan in the app. */
const PALETTE: PlanPaletteName = 'charcoal'

export const darkArchitecturalPlanTheme: PlanTheme = {
  palette: PLAN_PALETTES[PALETTE],
  weights: {
    wallExterior: 36,
    wallInterior: 26,
    wallCore: 10,
    wallShadow: 46,
    wallHighlight: 12,
    opening: 22,
    doorLeaf: 26,
    doorSwing: 16,
    furniture: 16,
    furnitureDetail: 9,
    grid: 10,
    hatch: 8,
    selection: 28,
  },
  type: {
    family: 'ui-sans-serif, system-ui, sans-serif',
    labelSize: 190,
    labelTracking: 42,
    labelWeight: 600,
    dimensionSize: 170,
    wallLetterSize: 230,
  },
  hatchGap: 90,
  exportScale: 2,
}

export const planTheme = darkArchitecturalPlanTheme
