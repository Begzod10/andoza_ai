/**
 * Opening another room of the flat by tapping it, without the view moving.
 *
 * The user's choice (option 1, "seamless switch"): tapping a wall, floor or
 * door of a neighbouring room makes that room the open one, the camera keeps
 * its place, and the menu for what was tapped opens where it was tapped.
 *
 * The flat is drawn around the OPEN room — it sits at the origin and every
 * other room at its offset — so opening a room 3.85 m east moves the whole
 * picture 3.85 m west. The camera is moved by the same amount at the same
 * moment (`shiftedPose`), and the two effects that would otherwise re-frame
 * the view on a room change stand down for the room being switched to
 * (`switchCovers`). Then the tap is replayed on the room now open.
 *
 * One switch at a time, so this is a module-level slot rather than state.
 */
export interface RoomSwitch {
  toId: string
  /** Where the room switched to sat, relative to the room open before. */
  offsetXM: number
  offsetZM: number
  /** Where the tap was, in client pixels, to replay it once the room is open. */
  tap: { x: number; y: number } | null
}

let current: RoomSwitch | null = null
let arrived = false

export function beginRoomSwitch(s: RoomSwitch): void {
  current = s
  arrived = false
}

/** True while a switch to `roomId` is under way, arrival included. */
export function switchCovers(roomId: string | null | undefined): boolean {
  return !!current && current.toId === roomId
}

/** Whether any switch is under way — for re-framing that does not know which
 *  room it is framing (the camera animator follows the open room's size). */
export function roomSwitchUnderWay(): boolean {
  return current !== null
}

/** The switch, once, when `roomId` is the room it was going to. */
export function arriveRoomSwitch(roomId: string | null | undefined): RoomSwitch | null {
  if (!current || arrived || current.toId !== roomId) return null
  arrived = true
  return current
}

export function endRoomSwitch(): void {
  current = null
  arrived = false
}

/** A camera position or orbit target moved with the flat. */
export function shiftedPose(
  s: Pick<RoomSwitch, 'offsetXM' | 'offsetZM'>,
  p: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  return { x: p.x - s.offsetXM, y: p.y, z: p.z - s.offsetZM }
}
