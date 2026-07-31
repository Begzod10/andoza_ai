/**
 * Light fixture catalog — the types a room can be lit with.
 *
 * A fixture is described once here and everything else reads from it: the
 * palette chips, the 3D geometry, the photometric defaults and the limits the
 * settings sliders clamp to. Adding a fixture means adding one entry.
 *
 * Sizes are the fixture envelope in metres. Photometry is given the way a
 * lamp is actually sold — lumens and a colour temperature in kelvin — rather
 * than as three.js intensities, so the numbers in the UI mean something to
 * whoever is furnishing the room. `lumensToIntensity` does the conversion.
 */

export type LightMount =
  /** Hangs from the ceiling on a cord/rod. */
  | 'ceiling'
  /** Sunk into the ceiling — flush, no visible body. */
  | 'recessed'
  /** Fixed to a wall. */
  | 'wall'
  /** Stands on the floor. */
  | 'floor'
  /** Rides a rail that is itself mounted to the ceiling. */
  | 'track'

export type LightTypeId =
  | 'pendant'
  | 'spotlight'
  | 'ies'
  | 'chandelier'
  | 'floor_lamp'
  | 'bra'
  | 'bath'
  | 'downlight'
  | 'ceiling'
  | 'led_linear'
  | 'track'
  | 'led_panel'
  | 'led_track'

export interface LightType {
  id: LightTypeId
  /** Uzbek label shown in the palette. */
  name: string
  emoji: string
  mount: LightMount
  /** Fixture envelope in metres. */
  sizeM: { w: number; d: number; h: number }
  /** How far a hanging fixture drops below the ceiling, in metres. */
  dropM?: number
  /** Mounting height above the floor for wall fixtures, in metres. */
  wallHM?: number
  /** Nominal output of one fixture. */
  lumens: number
  /** Correlated colour temperature in kelvin. */
  colorK: number
  /** Full beam angle in degrees. Omitted = spreads in every direction. */
  beamDeg?: number
  /** Whether the beam can be aimed by the user. */
  aimable?: boolean
  /** One-line note shown under the fixture in the palette. */
  hint?: string
}

export const LIGHT_TYPES: LightType[] = [
  {
    id: 'pendant',
    name: 'Osma chiroq',
    emoji: '💡',
    mount: 'ceiling',
    sizeM: { w: 0.3, d: 0.3, h: 0.28 },
    dropM: 0.9,
    lumens: 800,
    colorK: 2700,
    hint: 'Stol ustiga osiladi',
  },
  {
    id: 'chandelier',
    name: 'Qandil',
    emoji: '🕯️',
    mount: 'ceiling',
    sizeM: { w: 0.7, d: 0.7, h: 0.55 },
    dropM: 0.6,
    lumens: 2400,
    colorK: 2700,
    hint: 'Mehmonxona uchun markaziy chiroq',
  },
  {
    id: 'ceiling',
    name: "Shift chirog'i",
    emoji: '⚪',
    mount: 'ceiling',
    sizeM: { w: 0.42, d: 0.42, h: 0.1 },
    dropM: 0,
    lumens: 1800,
    colorK: 4000,
    hint: 'Shiftga yopishgan',
  },
  {
    id: 'downlight',
    name: 'Downlight',
    emoji: '🔆',
    mount: 'recessed',
    sizeM: { w: 0.09, d: 0.09, h: 0.05 },
    lumens: 700,
    colorK: 4000,
    beamDeg: 60,
    hint: "Shiftga o'rnatiladi",
  },
  {
    id: 'spotlight',
    name: 'Spot chiroq',
    emoji: '🔦',
    mount: 'ceiling',
    sizeM: { w: 0.1, d: 0.1, h: 0.14 },
    dropM: 0,
    lumens: 600,
    colorK: 3000,
    beamDeg: 30,
    aimable: true,
    hint: "Yo'naltirsa bo'ladi",
  },
  {
    id: 'ies',
    name: 'IES spot',
    emoji: '🎯',
    mount: 'ceiling',
    sizeM: { w: 0.11, d: 0.11, h: 0.15 },
    dropM: 0,
    lumens: 900,
    colorK: 3000,
    beamDeg: 24,
    aimable: true,
    hint: "O'lchangan nur profili (tor, aniq dog')",
  },
  {
    id: 'led_panel',
    name: 'LED panel',
    emoji: '🟦',
    mount: 'recessed',
    sizeM: { w: 0.6, d: 0.6, h: 0.03 },
    lumens: 3600,
    colorK: 4000,
    beamDeg: 110,
    hint: 'Ofis/oshxona uchun keng yorug‘lik',
  },
  {
    id: 'led_linear',
    name: 'LED chiziqli',
    emoji: '➖',
    mount: 'ceiling',
    sizeM: { w: 1.2, d: 0.06, h: 0.06 },
    dropM: 0,
    lumens: 2800,
    colorK: 4000,
    beamDeg: 110,
    aimable: true,
    hint: 'Uzun chiziq — burchagini burang',
  },
  {
    id: 'track',
    name: 'Trek (shina)',
    emoji: '🛤️',
    mount: 'track',
    sizeM: { w: 1.5, d: 0.05, h: 0.05 },
    dropM: 0,
    lumens: 1800,
    colorK: 3000,
    beamDeg: 34,
    aimable: true,
    hint: 'Shina + bir nechta boshcha',
  },
  {
    id: 'led_track',
    name: "LED trek chirog'i",
    emoji: '🔳',
    mount: 'track',
    sizeM: { w: 1.2, d: 0.05, h: 0.09 },
    dropM: 0,
    lumens: 2200,
    colorK: 3500,
    beamDeg: 26,
    aimable: true,
    hint: "Trekka o'rnatilgan LED boshchalar",
  },
  {
    id: 'bra',
    name: 'Bra',
    emoji: '🕯',
    mount: 'wall',
    sizeM: { w: 0.16, d: 0.14, h: 0.26 },
    wallHM: 1.8,
    lumens: 400,
    colorK: 2700,
    hint: 'Devorga — karavot yoni, koridor',
  },
  {
    id: 'bath',
    name: "Vanna chirog'i",
    emoji: '🛁',
    mount: 'wall',
    sizeM: { w: 0.5, d: 0.08, h: 0.08 },
    wallHM: 1.9,
    lumens: 900,
    colorK: 4000,
    beamDeg: 120,
    hint: "Ko'zgu ustiga, nam-himoyalangan",
  },
  {
    id: 'floor_lamp',
    name: 'Torsher',
    emoji: '🛋',
    mount: 'floor',
    sizeM: { w: 0.4, d: 0.4, h: 1.65 },
    lumens: 1100,
    colorK: 2700,
    hint: 'Polda turadi — divan yoni',
  },
]

export const LIGHT_TYPE_BY_ID: Record<string, LightType> = Object.fromEntries(
  LIGHT_TYPES.map((t) => [t.id, t]),
)

/** Anything saved before fixture types existed was a plain ceiling light. */
export const DEFAULT_LIGHT_TYPE: LightTypeId = 'ceiling'

export function lightType(id?: string): LightType {
  return LIGHT_TYPE_BY_ID[id ?? ''] ?? LIGHT_TYPE_BY_ID[DEFAULT_LIGHT_TYPE]
}

/** Settings ranges — the sliders clamp to these, and so does the 3D. */
export const LIGHT_LIMITS = {
  brightnessPct: { min: 10, max: 200, step: 5 },
  colorK: { min: 2200, max: 6500, step: 100 },
  beamDeg: { min: 8, max: 120, step: 2 },
  dropM: { min: 0, max: 2.2, step: 0.05 },
  wallHM: { min: 0.3, max: 2.6, step: 0.05 },
} as const

/**
 * Lumens → a three.js point/spot intensity that looks right in a room.
 *
 * Physical units are off the table here: the scene is lit with a tone-mapped
 * HDRI and an artistic sun, so a photometric conversion would blow out. This
 * is a calibrated ratio — 800 lm (a normal bulb) lands at 1.0 — which keeps
 * the *relative* brightness of fixtures honest, which is what a user compares.
 */
export function lumensToIntensity(lumens: number, brightnessPct = 100): number {
  return (lumens / 800) * (brightnessPct / 100)
}

/** Colour temperature in kelvin → an approximate sRGB hex for the emitter. */
export function kelvinToHex(k: number): string {
  // Piecewise fit to the blackbody locus over the range lamps actually ship in.
  const t = Math.min(6500, Math.max(2200, k)) / 100
  let r: number
  let g: number
  let b: number
  if (t <= 66) {
    r = 255
    g = 99.47 * Math.log(t) - 161.12
  } else {
    r = 329.7 * Math.pow(t - 60, -0.1332)
    g = 288.12 * Math.pow(t - 60, -0.0755)
  }
  if (t >= 66) b = 255
  else if (t <= 19) b = 0
  else b = 138.52 * Math.log(t - 10) - 305.04

  const ch = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
  return `#${ch(r)}${ch(g)}${ch(b)}`
}
