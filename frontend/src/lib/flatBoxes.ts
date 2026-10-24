/**
 * A room's footprint in the flat (lib/slideRoom's RoomBox): its outer
 * rectangle, and for a room that is not a rectangle the rectangles it is
 * made of.
 *
 * A legacy A-B-C-D rectangle is drawn centred on where it stands. A polygon
 * room — drawn, scanned, or cut into an L when a neighbour grew into it
 * (lib/clipRoom) — is drawn centred on its VERTEX MEAN, like NWallRoomShell
 * and lib/wallDefsFromVertices do, which for an L is not the middle of its
 * outer rectangle. Its parts come from the outline's own grid: every cell
 * whose middle is inside it.
 */
import { roomExtents } from '@/lib/roomDims'
import type { RoomBox } from '@/lib/slideRoom'
import type { RoomGeometry } from '@/store/types'

const isAbcd = (g: RoomGeometry) => g.walls.length === 4 && g.walls.map((w) => w.id).sort().join('') === 'ABCD'

export function flatBoxOf(id: string, geometry: RoomGeometry, offsetXM: number, offsetZM: number): RoomBox {
  const v = geometry.vertices
  if (isAbcd(geometry) || !v || v.length < 3) {
    const e = roomExtents(geometry)
    return { id, cx: offsetXM, cz: offsetZM, w: e.W, d: e.D }
  }
  const mx = v.reduce((s, p) => s + p[0], 0) / v.length / 1000
  const mz = v.reduce((s, p) => s + p[1], 0) / v.length / 1000
  const world = v.map(([x, z]) => [offsetXM + x / 1000 - mx, offsetZM + z / 1000 - mz] as [number, number])
  const xs = [...new Set(world.map((p) => p[0]))].sort((a, b) => a - b)
  const zs = [...new Set(world.map((p) => p[1]))].sort((a, b) => a - b)
  const parts: RoomBox[] = []
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
    const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2
    if (inside(cx, cz, world)) parts.push({ id, cx, cz, w: xs[i + 1] - xs[i], d: zs[j + 1] - zs[j] })
  }
  const x0 = xs[0], x1 = xs[xs.length - 1], z0 = zs[0], z1 = zs[zs.length - 1]
  return { id, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, parts }
}

/** Even-odd point in polygon. */
function inside(x: number, z: number, poly: [number, number][]): boolean {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j]
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit
  }
  return hit
}

/**
 * The box round every room of the flat — what the zoom-out limit fits when
 * nothing is focused, since that is what the camera then orbits (the flat's
 * centre, lib/focusFraming). It used to fit twice the furthest reach from the
 * OPEN room, right when the camera orbited that room and nearly double the
 * flat once it did not: "max zoom is very far".
 */
export function flatBounds(boxes: readonly RoomBox[]): { W: number; D: number } {
  if (!boxes.length) return { W: 1, D: 1 }
  const x0 = Math.min(...boxes.map((b) => b.cx - b.w / 2)), x1 = Math.max(...boxes.map((b) => b.cx + b.w / 2))
  const z0 = Math.min(...boxes.map((b) => b.cz - b.d / 2)), z1 = Math.max(...boxes.map((b) => b.cz + b.d / 2))
  return { W: x1 - x0, D: z1 - z0 }
}
