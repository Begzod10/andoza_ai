/**
 * The four fixed cameras a room is rendered from, and the two shapes of
 * picture they produce.
 *
 * The 360 camera answers "what is it like to stand in here"; these answer
 * "what does it look like". A panorama is unusable as a picture — it is 2:1,
 * it bends every straight line, and no one puts one in a quote or a post. So
 * these are ordinary perspective shots: stand in a corner, look across the
 * room, take the picture portrait for a phone or landscape for a screen.
 *
 * Four, at the diagonals rather than the axes. A camera against the middle of
 * a wall looks straight at the wall opposite and sees two slivers of the side
 * walls; one in a corner sees two whole walls, the floor between them and the
 * ceiling above — the view an estate agent photographs a room from, and for
 * the same reason.
 */
import type { RoomGeometry } from '@/store/roomStore'
import { planToWorld, roomBoundsFromGeometry, type RoomBounds } from '@/lib/furnitureBounds'
import { pointInPolygon } from '@/lib/planPolygon'
import { roomCentrePlan } from '@/lib/roomCentre'

/** How many stations the room offers. */
export const ROOM_CAMERA_COUNT = 4

/**
 * Eye height for every fixed camera, metres.
 *
 * The same height the 360 camera stands at, deliberately: two cameras in one
 * room at two heights make a set of pictures that do not sit together, and the
 * user set this one number for both.
 */
export const RENDER_EYE_HEIGHT = 1.35

/**
 * How far in front of the wall a camera stands, metres.
 *
 * Not zero. A camera ON the wall has the wall's own surface, its skirting and
 * anything hung on it inside the near plane, and the room would be rendered
 * through a smear of plaster. 400 mm is enough to clear a skirting board, a
 * cornice return and a radiator, and close enough that the camera still reads
 * as being in the corner.
 */
export const CAMERA_WALL_OFFSET = 0.4

/**
 * Horizontal field of view, degrees.
 *
 * Horizontal, not vertical, and that is the whole reason this constant exists
 * rather than three's own `fov`: three takes a VERTICAL angle, so a camera set
 * to one angle shows a different width of room in portrait than in landscape.
 * Switching 16:9 to 9:16 would not turn the picture, it would crop the room
 * out of the sides and add ceiling and floor. Fixing the horizontal angle and
 * deriving the vertical one per aspect makes the two shapes two framings of
 * the same view.
 *
 * 65 degrees is about a 28 mm lens on full frame — the wide end of what
 * interiors are shot on, before the barrel distortion that makes a room look
 * like a fish tank.
 */
export const RENDER_HFOV_DEG = 65

export interface RenderAspect {
  /** As the user picks it. */
  label: '9:16' | '16:9'
  width: number
  height: number
}

/**
 * The two shapes, at the resolution each is actually used at: 1080 x 1920 for
 * a phone screen or a story, 1920 x 1080 for a monitor or a slide.
 */
export const RENDER_ASPECTS: RenderAspect[] = [
  { label: '9:16', width: 1080, height: 1920 },
  { label: '16:9', width: 1920, height: 1080 },
]

/** Where a camera stands and what it looks at, world metres. */
export interface CameraPose {
  /** 1-based, as the user sees it. */
  index: number
  position: { x: number; y: number; z: number }
  target: { x: number; y: number; z: number }
}

/**
 * three's `PerspectiveCamera.fov` for one of these aspects.
 *
 * `fov` is the vertical angle; this is the vertical angle that keeps the
 * horizontal one at `RENDER_HFOV_DEG`. Portrait therefore gets a much larger
 * number than landscape — the same room, taller.
 */
export function verticalFovFor(aspect: number, hFovDeg = RENDER_HFOV_DEG): number {
  const h = (hFovDeg * Math.PI) / 180
  return (2 * Math.atan(Math.tan(h / 2) / aspect) * 180) / Math.PI
}

/**
 * The largest picture of this shape the GPU will render.
 *
 * A render target bigger than `maxTextureSize` fails outright, and some phones
 * are at 4096 while a 1920 x 1080 needs only the long edge to fit. Scaled down
 * whole rather than cropped, so the framing never changes with the device.
 */
export function renderSizeFor(
  aspect: RenderAspect,
  maxTexture: number,
): { width: number; height: number } {
  const longest = Math.max(aspect.width, aspect.height)
  if (maxTexture >= longest) return { width: aspect.width, height: aspect.height }
  const scale = Math.max(0.1, maxTexture / longest)
  return {
    width: Math.max(1, Math.round(aspect.width * scale)),
    height: Math.max(1, Math.round(aspect.height * scale)),
  }
}

/**
 * How far from `from` the outline is, along `dir`, in plan millimetres.
 *
 * Walks out in steps and stops at the first point outside, then halves the
 * last step to land on the wall. A ray/segment intersection would be exact,
 * but it also has to be told which edges face which way and what to do with a
 * ray that leaves and re-enters an L — and being a few millimetres out here
 * only moves a camera a few millimetres.
 */
function distanceToWall(
  from: { x: number; z: number },
  dir: { x: number; z: number },
  outline: [number, number][],
  limit: number,
): number {
  const at = (t: number) => ({ x: from.x + dir.x * t, z: from.z + dir.z * t })
  const STEP = 50
  let inside = 0
  for (let t = STEP; t <= limit; t += STEP) {
    const p = at(t)
    if (!pointInPolygon(p.x, p.z, outline)) {
      let lo = inside
      let hi = t
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2
        const q = at(mid)
        if (pointInPolygon(q.x, q.z, outline)) lo = mid
        else hi = mid
      }
      return lo
    }
    inside = t
  }
  return inside
}

/**
 * The four stations, in plan millimetres.
 *
 * Each heads from the middle of the room toward one of the room's OWN corners
 * and stops `CAMERA_WALL_OFFSET` short of the wall it meets.
 *
 * Toward the corners, not along the world diagonals, and the difference is not
 * academic: a room drawn or scanned at an angle — which is most of them; the
 * user's own is turned 27.8 degrees — has its corners nowhere near 45 degrees
 * in world space, so fixed diagonals aimed two of the four cameras straight at
 * the middle of a wall. A wall fills the frame and says nothing about the room.
 *
 * Walking out from a point known to be inside is also what keeps this honest
 * in an L-shaped room: a camera placed AT a corner's coordinates can land in
 * the cut-away notch, while a walk stops at whatever wall it actually meets.
 */
export function roomCameraStations(room: RoomBounds): { x: number; z: number }[] {
  const centre = roomCentrePlan(room)
  const outline = room.outline
  const reach = Math.hypot(room.W, room.D)
  const offsetMm = CAMERA_WALL_OFFSET * 1000

  // Legacy rectangle: no outline to read corners off, but the room IS its
  // bounding box, so its corners are known outright. Aimed AT them for the
  // same reason the polygon path is: a 45-degree diagonal only reaches the
  // corner of a square room, and in a 5 x 4 it meets the long wall a metre
  // short of one.
  if (!outline || outline.length < 3) {
    const corners: [number, number][] = [[0, 0], [room.W, 0], [room.W, room.D], [0, room.D]]
    return corners.map(([cx, cz]) => {
      const dx = cx - centre.x
      const dz = cz - centre.z
      const len = Math.hypot(dx, dz) || 1
      const t = Math.max(0, len - offsetMm)
      return { x: centre.x + (dx / len) * t, z: centre.z + (dz / len) * t }
    })
  }

  return cornerDirections(centre, outline).map((dir) => {
    const wall = distanceToWall(centre, dir, outline, reach)
    // A room too small to back off in keeps the camera at the middle rather
    // than putting it through the wall behind it.
    const t = Math.max(0, wall - offsetMm)
    return { x: centre.x + dir.x * t, z: centre.z + dir.z * t }
  })
}

/**
 * Four unit directions from the middle toward four of the outline's corners,
 * spread as evenly around the room as its corners allow.
 *
 * A rectangle has exactly four and uses all of them. An L has six, and taking
 * the first four in order would put three cameras down one arm; so the pick is
 * by angle — the corner nearest each quarter turn from the first — which keeps
 * the four views looking at different parts of the room.
 */
function cornerDirections(
  centre: { x: number; z: number },
  outline: [number, number][],
): { x: number; z: number }[] {
  const corners = outline.map(([x, z]) => ({
    angle: Math.atan2(z - centre.z, x - centre.x),
    x: x - centre.x,
    z: z - centre.z,
  }))

  const taken = new Set<number>()
  const chosen: { x: number; z: number }[] = []
  for (let i = 0; i < ROOM_CAMERA_COUNT; i++) {
    const want = corners[0].angle + (i * 2 * Math.PI) / ROOM_CAMERA_COUNT
    let best = -1
    let bestGap = Infinity
    for (let c = 0; c < corners.length; c++) {
      if (taken.has(c)) continue
      // Shortest way round the circle, so a corner just the other side of the
      // seam is not judged a whole turn away.
      const raw = Math.abs(corners[c].angle - want) % (2 * Math.PI)
      const gap = Math.min(raw, 2 * Math.PI - raw)
      if (gap < bestGap) { bestGap = gap; best = c }
    }
    // Fewer corners than cameras — a triangular scan. Reuse one rather than
    // dropping a camera: four stations is what the UI offers.
    if (best < 0) { chosen.push(chosen[i % chosen.length]); continue }
    taken.add(best)
    const c = corners[best]
    const len = Math.hypot(c.x, c.z) || 1
    chosen.push({ x: c.x / len, z: c.z / len })
  }
  return chosen
}

/**
 * The four cameras for a room, in world metres, each looking at the middle.
 *
 * The target is the middle of the room at eye height, not on the floor: a
 * camera aimed at the floor tips the whole room backwards and throws away the
 * ceiling, and the verticals go with it.
 */
export function roomCameraPoses(
  geometry: RoomGeometry,
  fallback?: { W: number; D: number },
): CameraPose[] {
  const room = roomBoundsFromGeometry(geometry, fallback)
  const centre = planToWorld(roomCentrePlan(room), room)
  const target = { x: centre.x, y: RENDER_EYE_HEIGHT, z: centre.z }

  return roomCameraStations(room).map((station, i) => {
    const p = planToWorld(station, room)
    return {
      index: i + 1,
      position: { x: p.x, y: RENDER_EYE_HEIGHT, z: p.z },
      target,
    }
  })
}
