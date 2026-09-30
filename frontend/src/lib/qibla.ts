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

const POINTS = ['Shimol', 'Shimoli-sharq', 'Sharq', 'Janubi-sharq', 'Janub', 'Janubi-g\'arb', 'G\'arb', 'Shimoli-g\'arb']

/** Eight-point compass name in Uzbek, for the label beside the arrow. */
export function compassPoint(bearing: number): string {
  return POINTS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8]
}
