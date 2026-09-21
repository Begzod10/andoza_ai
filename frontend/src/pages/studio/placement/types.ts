import type { Room } from '@/lib/api'

export interface StudioContext { room: Room }
export type TabId = 'elektr' | 'chiroq' | 'olchamlar'
export type WallId = 'A' | 'B' | 'C' | 'D'

export type WireConfig = { color: string; cw: boolean }

export interface WallHover {
  wallId: string
  positionMm: number
  sx: number
  sy: number
  /** Polygon walls only — the rectangle sides derive these from the id. */
  rotDeg?: number
  angleDeg?: number
}

/**
 * Every wall gets a local frame so one set of symbols serves all four.
 *
 *   u — distance along the wall from its start, in px
 *   v — distance in from the wall centreline, in px; +v is into the room
 *
 * Drawing each opening in (u, v) and mapping at the end is what lets the door
 * swing, the hinge side and the mullion spacing come out identical on a side
 * wall and a back wall. Doing it per-orientation is how the two used to drift.
 */
export type WallFrame = { id: string; wallLenMm: number; toSvg: (u: number, v: number) => [number, number] }

export type InnerTab = 'olchamlar' | 'simlar'
