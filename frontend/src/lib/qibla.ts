/**
 * Which way Mecca lies from the room, and where that points in the studio.
 *
 * The bearing is the great-circle initial course from the site to the Kaaba —
 * the same number AlAdhan's Qibla API returns — worked out here rather than
 * fetched, so the marker works offline and never waits on a network call to
 * draw an arrow on the floor.
 *
 * It speaks the same two frames as `sunPosition.ts`: a **compass bearing** is
 * degrees clockwise from true north, and the **scene frame** has −Z as north
 * and +X as east when `facing` is 0 (wall A's outward face pointing north).
 */
import i18n, { type TKey } from '@/i18n'
import { DEFAULT_SITE, CARDINAL_BEARING, type Cardinal } from './sunPosition'

/** The Kaaba, Mecca. */
export const KAABA = { latitude: 21.4225, longitude: 39.8262 }

const DEG = Math.PI / 180

/** Compass bearing to the Kaaba, in [0, 360), degrees clockwise from north. */
export function qiblaBearing(
  latitude: number = DEFAULT_SITE.latitude,
  longitude: number = DEFAULT_SITE.longitude,
): number {
  const phi1 = latitude * DEG
  const phi2 = KAABA.latitude * DEG
  const dLon = (KAABA.longitude - longitude) * DEG
  const y = Math.sin(dLon) * Math.cos(phi2)
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon)
  return ((Math.atan2(y, x) / DEG) % 360 + 360) % 360
}

/**
 * Unit vector on the floor plane, `[x, z]`, pointing along a compass bearing,
 * for a room whose wall A's outward face points at `facing`.
 */
export function bearingToScene(bearing: number, facing: number | Cardinal = 0): [number, number] {
  const face = typeof facing === 'number' ? facing : CARDINAL_BEARING[facing]
  const rel = (bearing - face) * DEG
  return [Math.sin(rel), -Math.cos(rel)]
}

/** Locale keys of the eight compass points, clockwise from north. */
const POINT_KEYS = [
  'studio.lib.compass.n', 'studio.lib.compass.ne', 'studio.lib.compass.e', 'studio.lib.compass.se',
  'studio.lib.compass.s', 'studio.lib.compass.sw', 'studio.lib.compass.w', 'studio.lib.compass.nw',
] as const

/** Choices for which way wall A's outward face points. */
export const FACING_OPTIONS: readonly { bearing: number; labelKey: (typeof POINT_KEYS)[number] }[] =
  POINT_KEYS.map((labelKey, i) => ({ bearing: i * 45, labelKey }))

/** Eight-point compass name in the interface language, for the label beside the arrow. */
export function compassPoint(bearing: number): string {
  return i18n.t(POINT_KEYS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8])
}

export interface RoomLocation { latitude: number; longitude: number; label?: string }

/** Uzbekistan's regional centres, for the location picker. `label` is what a room saves (keep it as is); `labelKey` is what the picker shows. */
export const CITY_PRESETS: readonly (RoomLocation & { label: string; labelKey: TKey })[] = [
  { labelKey: 'studio.lib.city.toshkent', label: 'Toshkent', latitude: 41.31, longitude: 69.24 },
  { labelKey: 'studio.lib.city.samarqand', label: 'Samarqand', latitude: 39.65, longitude: 66.96 },
  { labelKey: 'studio.lib.city.buxoro', label: 'Buxoro', latitude: 39.77, longitude: 64.42 },
  { labelKey: 'studio.lib.city.andijon', label: 'Andijon', latitude: 40.78, longitude: 72.34 },
  { labelKey: 'studio.lib.city.namangan', label: 'Namangan', latitude: 41.0, longitude: 71.67 },
  { labelKey: 'studio.lib.city.fargona', label: "Farg'ona", latitude: 40.38, longitude: 71.79 },
  { labelKey: 'studio.lib.city.nukus', label: 'Nukus', latitude: 42.46, longitude: 59.61 },
  { labelKey: 'studio.lib.city.urganch', label: 'Urganch', latitude: 41.55, longitude: 60.63 },
  { labelKey: 'studio.lib.city.qarshi', label: 'Qarshi', latitude: 38.86, longitude: 65.79 },
  { labelKey: 'studio.lib.city.termiz', label: 'Termiz', latitude: 37.22, longitude: 67.28 },
  { labelKey: 'studio.lib.city.jizzax', label: 'Jizzax', latitude: 40.12, longitude: 67.83 },
  { labelKey: 'studio.lib.city.guliston', label: 'Guliston', latitude: 40.49, longitude: 68.78 },
  { labelKey: 'studio.lib.city.navoiy', label: 'Navoiy', latitude: 40.1, longitude: 65.37 },
]

/** Whether a pair of numbers is a place on Earth. */
export function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) && Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
  )
}
