/**
 * Suvoq finishes — concrete and plaster wall surfaces.
 *
 * Each finish is generated as a self-contained SVG data URL rather than
 * shipped as a photo. Three reasons that matters here: it is a couple of
 * kilobytes instead of a megabyte, it tiles seamlessly by construction, and —
 * the point of the exercise — it is plain text, so a wall wearing it survives
 * being written to storage and read back without needing a file to still be
 * on a server somewhere.
 *
 * The look comes from `feTurbulence`: fractal noise, which is what concrete
 * mottling actually is. `baseFrequency` sets the grain and `seed` keeps a
 * given finish identical every time it is generated.
 */

export interface PlasterFinish {
  id: string
  /** Uzbek label shown on the button. */
  name: string
  /** Base surface colour. */
  color: string
  /** Noise grain — higher is finer. */
  frequency: number
  /** Contrast of the mottling, 0…1. */
  strength: number
  seed: number
  /** Physical size of one tile in metres — sets the default repeat. */
  tileM: number
  hint: string
}

export const PLASTER_FINISHES: PlasterFinish[] = [
  {
    id: 'beton',
    name: 'Beton',
    color: '#B8B5AE',
    frequency: 0.9,
    strength: 0.55,
    seed: 7,
    tileM: 2.4,
    hint: "Tabiiy beton — dog'li, o'rtacha donador",
  },
  {
    id: 'beton_silliq',
    name: 'Silliq beton',
    color: '#C6C4BE',
    frequency: 0.45,
    strength: 0.32,
    seed: 12,
    tileM: 3.2,
    hint: 'Sayqallangan beton — yumshoq dog‘lar',
  },
  {
    id: 'beton_qopol',
    name: "Qo'pol beton",
    color: '#A8A49C',
    frequency: 1.6,
    strength: 0.8,
    seed: 21,
    tileM: 1.8,
    hint: "Qoliplangan, dag'al yuza",
  },
  {
    id: 'suvoq',
    name: 'Gips suvoq',
    color: '#DDD8CE',
    frequency: 2.2,
    strength: 0.28,
    seed: 33,
    tileM: 2.0,
    hint: 'Oq gips suvoq — mayin don',
  },
]

export const PLASTER_BY_ID: Record<string, PlasterFinish> = Object.fromEntries(
  PLASTER_FINISHES.map((f) => [f.id, f]),
)

/** Tile resolution in SVG user units. Only affects noise detail, not file size. */
const TILE = 512

/**
 * Build the finish as an `image/svg+xml` data URL.
 *
 * Encoded with `encodeURIComponent` rather than base64: it keeps the string
 * readable, avoids a btoa round-trip, and is comfortably smaller.
 */
export function plasterTextureUrl(finish: PlasterFinish): string {
  const { color, frequency, strength, seed } = finish
  // Two octaves of noise lit through a lighting-free colour matrix: the alpha
  // channel of the turbulence modulates a dark overlay, so the base colour
  // still reads as the surface colour rather than being washed to grey.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}" viewBox="0 0 ${TILE} ${TILE}">` +
    `<defs>` +
    `<filter id="n" x="0" y="0" width="100%" height="100%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${(frequency / 100).toFixed(4)}" ` +
    `numOctaves="4" seed="${seed}" stitchTiles="stitch" result="t"/>` +
    `<feColorMatrix in="t" type="saturate" values="0" result="g"/>` +
    `<feComponentTransfer in="g" result="c">` +
    `<feFuncA type="linear" slope="${strength.toFixed(2)}" intercept="0"/>` +
    `</feComponentTransfer>` +
    `</filter>` +
    `</defs>` +
    `<rect width="${TILE}" height="${TILE}" fill="${color}"/>` +
    `<rect width="${TILE}" height="${TILE}" filter="url(#n)" opacity="0.85"/>` +
    `</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/** Texture repeat for a wall of the given size, so the grain stays physical. */
export function plasterRepeat(finish: PlasterFinish, wallWidthM: number, wallHeightM: number) {
  return {
    repeatX: Math.max(0.25, wallWidthM / finish.tileM),
    repeatY: Math.max(0.25, wallHeightM / finish.tileM),
  }
}
