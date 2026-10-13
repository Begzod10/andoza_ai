/**
 * Where the 3D view orbits, and how far back it stands, in a flat of rooms.
 *
 * The user: "when there are several rooms and one is focused, camera and
 * dragging should focus on that room, when unfocused, it should focus on the
 * pivot of whole geometry in scene". The framing the studio computes is for
 * the OPEN room, centred on the origin. This moves it:
 *
 *  - a room is focused → onto that room's centre, sized for that room;
 *  - nothing is focused → onto the centre of the whole flat's footprint, and
 *    far enough back to take all of it in.
 *
 * The camera keeps looking from the same side at the same angle; only the
 * pivot moves and the distance scales with the size of what is framed. A
 * one-room project, and the open room focused, come back exactly as they went
 * in.
 */
export interface FlatRoomBox {
  id: string
  /** Centre, metres, in the open room's frame (the open room is at 0, 0). */
  cx: number
  cz: number
  /** Footprint, metres. */
  w: number
  d: number
}

type Vec3 = [number, number, number]

export function focusFraming(
  cam: { position: Vec3; target: Vec3 },
  rooms: readonly FlatRoomBox[],
  focusedId: string | null,
): { position: Vec3; target: Vec3 } {
  // The open room comes first: it is what `cam` was computed for.
  const open = rooms[0]
  if (!open) return cam
  const framed = focusedId === null ? rooms : rooms.filter((r) => r.id === focusedId)
  if (framed.length === 0) return cam

  const minX = Math.min(...framed.map((r) => r.cx - r.w / 2))
  const maxX = Math.max(...framed.map((r) => r.cx + r.w / 2))
  const minZ = Math.min(...framed.map((r) => r.cz - r.d / 2))
  const maxZ = Math.max(...framed.map((r) => r.cz + r.d / 2))
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const k = Math.max(maxX - minX, maxZ - minZ) / Math.max(open.w, open.d)

  // Nothing to move: the framing already is this one.
  if (Math.abs(cx) < 1e-9 && Math.abs(cz) < 1e-9 && Math.abs(k - 1) < 1e-9) return cam

  const [tx, ty, tz] = cam.target
  const [px, py, pz] = cam.position
  const target: Vec3 = [cx + tx, ty, cz + tz]
  return {
    target,
    position: [target[0] + (px - tx) * k, ty + (py - ty) * k, target[2] + (pz - tz) * k],
  }
}
