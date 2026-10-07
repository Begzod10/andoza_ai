/**
 * Where the four fixed cameras stand, and what shape of picture they take.
 *
 * Two things here would ruin a render without looking wrong in the code. A
 * camera outside the room renders the inside of a wall — the same fault the
 * 360 camera had in an L-shaped room, and the reason these walk outward from a
 * point known to be inside rather than being placed at corner coordinates. And
 * a field of view fixed vertically would make 9:16 and 16:9 two different
 * views rather than two framings of one, which is why the horizontal angle is
 * the constant.
 */
import { describe, it, expect } from 'vitest'
import {
  roomCameraPoses, roomCameraStations, renderSizeFor, verticalFovFor,
  RENDER_ASPECTS, RENDER_EYE_HEIGHT, ROOM_CAMERA_COUNT, CAMERA_WALL_OFFSET,
  RENDER_HFOV_DEG, CAMERA_CHOICES,
} from '../roomCameras'
import { pointInPolygon } from '../planPolygon'
import type { RoomBounds } from '../furnitureBounds'
import type { RoomGeometry } from '@/store/roomStore'

/** A 5 x 4 m room as a plain rectangle, and the same as its own polygon. */
const RECT_OUTLINE: [number, number][] = [[0, 0], [5000, 0], [5000, 4000], [0, 4000]]
const RECT: RoomBounds = { W: 5000, D: 4000, inner: RECT_OUTLINE, outline: RECT_OUTLINE }
const LEGACY: RoomBounds = { W: 5000, D: 4000, inner: null, outline: null }

/** An L: the bottom-right quarter is cut away. */
const L_OUTLINE: [number, number][] =
  [[0, 0], [6000, 0], [6000, 2000], [2000, 2000], [2000, 6000], [0, 6000]]
const L: RoomBounds = { W: 6000, D: 6000, inner: L_OUTLINE, outline: L_OUTLINE }

function geometryFor(outline: [number, number][]): RoomGeometry {
  return {
    vertices: outline,
    walls: outline.map((_, i) => ({
      id: String(i),
      length: Math.hypot(
        outline[(i + 1) % outline.length][0] - outline[i][0],
        outline[(i + 1) % outline.length][1] - outline[i][1],
      ),
      elements: [],
    })),
  } as unknown as RoomGeometry
}

describe('roomCameraStations', () => {
  it('gives one per camera', () => {
    expect(roomCameraStations(RECT)).toHaveLength(ROOM_CAMERA_COUNT)
  })

  it('stands them all inside the room', () => {
    for (const s of roomCameraStations(RECT)) {
      expect(pointInPolygon(s.x, s.z, RECT_OUTLINE)).toBe(true)
    }
  })

  it('keeps every one inside an L, including the arm the diagonal leaves', () => {
    // The failure this guards against: a camera placed by corner coordinates
    // lands in the cut-away quarter and renders the inside of a wall.
    for (const s of roomCameraStations(L)) {
      expect(pointInPolygon(s.x, s.z, L_OUTLINE)).toBe(true)
    }
  })

  it('backs off the wall rather than standing against it', () => {
    // A camera on the wall has the plaster, the skirting and anything hung on
    // it inside the near plane.
    const offset = CAMERA_WALL_OFFSET * 1000
    for (const s of roomCameraStations(RECT)) {
      const toWall = Math.min(s.x, RECT.W - s.x, s.z, RECT.D - s.z)
      expect(toWall).toBeGreaterThan(offset * 0.5)
    }
  })

  it('spreads them to four different corners', () => {
    const [a, b, c, d] = roomCameraStations(RECT)
    // One per quadrant about the middle — not four views of the same corner.
    const quadrant = (s: { x: number; z: number }) =>
      `${s.x > RECT.W / 2 ? '+' : '-'}${s.z > RECT.D / 2 ? '+' : '-'}`
    expect(new Set([a, b, c, d].map(quadrant)).size).toBe(4)
  })

  it('puts cameras in the same four places whether or not the room has an outline', () => {
    // The two paths exist because a legacy room carries no outline to walk.
    // The same shape must get the same four cameras — but not necessarily in
    // the same ORDER: the polygon path starts at the outline's first vertex
    // and the legacy one has no vertices to start from, so which corner is
    // called "1" can differ. A room either carries vertices or does not, and
    // never both, so nothing in the app sees the two numberings side by side.
    const poly = roomCameraStations(RECT)
    const legacy = roomCameraStations(LEGACY)
    for (const l of legacy) {
      expect(poly.some((p) => Math.hypot(p.x - l.x, p.z - l.z) < 1)).toBe(true)
    }
    expect(legacy).toHaveLength(poly.length)
  })

  it('aims at the room\'s own corners, not at the world diagonals', () => {
    // The user's room, a true rectangle turned 27.8 degrees. Fixed 45-degree
    // diagonals sent two of the four cameras straight at the middle of a wall,
    // which fills the frame and says nothing about the room.
    const turned: [number, number][] = [[0, 2661], [5041, 0], [6838, 3405], [1797, 6065]]
    const room: RoomBounds = { W: 6838, D: 6065, inner: turned, outline: turned }
    const stations = roomCameraStations(room)
    const centre = { x: (0 + 5041 + 6838 + 1797) / 4, z: (2661 + 0 + 3405 + 6065) / 4 }

    for (const s of stations) {
      expect(pointInPolygon(s.x, s.z, turned)).toBe(true)
      // Each one heads for a corner: the direction it sits in from the middle
      // must line up with one of the four real corners, not with 45 degrees.
      const a = Math.atan2(s.z - centre.z, s.x - centre.x)
      const nearest = Math.min(...turned.map(([x, z]) => {
        const c = Math.atan2(z - centre.z, x - centre.x)
        const raw = Math.abs(c - a) % (2 * Math.PI)
        return Math.min(raw, 2 * Math.PI - raw)
      }))
      expect(nearest).toBeLessThan(0.02)
    }
  })
})

describe('roomCameraPoses', () => {
  it('numbers them from one, as the user sees them', () => {
    expect(roomCameraPoses(geometryFor(RECT_OUTLINE)).map((p) => p.index)).toEqual([1, 2, 3, 4])
  })

  it('stands every camera at eye height and aims it level', () => {
    // A camera aimed at the floor tips the room backwards and throws the
    // ceiling away, taking the verticals with it.
    for (const p of roomCameraPoses(geometryFor(RECT_OUTLINE))) {
      expect(p.position.y).toBe(RENDER_EYE_HEIGHT)
      expect(p.target.y).toBe(RENDER_EYE_HEIGHT)
    }
  })

  it('aims all four at one point — the middle of the room', () => {
    const targets = roomCameraPoses(geometryFor(L_OUTLINE)).map((p) => `${p.target.x},${p.target.z}`)
    expect(new Set(targets).size).toBe(1)
  })

  it('does not stand a camera on its own target', () => {
    for (const p of roomCameraPoses(geometryFor(RECT_OUTLINE))) {
      expect(Math.hypot(p.position.x - p.target.x, p.position.z - p.target.z)).toBeGreaterThan(0.5)
    }
  })
})

describe('verticalFovFor', () => {
  it('shows the same width of room in both shapes', () => {
    // The point of fixing the HORIZONTAL angle: switching 16:9 to 9:16 must
    // turn the picture, not crop the room out of its sides.
    const widthAt = (aspect: number) => {
      const v = (verticalFovFor(aspect) * Math.PI) / 180
      return 2 * Math.atan(Math.tan(v / 2) * aspect) * 180 / Math.PI
    }
    expect(widthAt(16 / 9)).toBeCloseTo(RENDER_HFOV_DEG, 6)
    expect(widthAt(9 / 16)).toBeCloseTo(RENDER_HFOV_DEG, 6)
  })

  it('gives portrait the taller frame', () => {
    expect(verticalFovFor(9 / 16)).toBeGreaterThan(verticalFovFor(16 / 9))
  })
})

describe('renderSizeFor', () => {
  it('gives the full picture when the GPU allows it', () => {
    for (const a of RENDER_ASPECTS) {
      expect(renderSizeFor(a, 4096)).toEqual({ width: a.width, height: a.height })
    }
  })

  it('scales a whole picture down rather than cropping one', () => {
    // A phone at 1024 would fail the allocation outright at 1920; the framing
    // must not change with the device.
    for (const a of RENDER_ASPECTS) {
      const got = renderSizeFor(a, 1024)
      expect(Math.max(got.width, got.height)).toBeLessThanOrEqual(1024)
      expect(got.width / got.height).toBeCloseTo(a.width / a.height, 2)
    }
  })

  it('offers the two shapes the user asked for, and only those', () => {
    expect(RENDER_ASPECTS.map((a) => a.label)).toEqual(['9:16', '16:9'])
    expect(RENDER_ASPECTS.map((a) => `${a.width}x${a.height}`)).toEqual(['1080x1920', '1920x1080'])
  })
})

describe('CAMERA_CHOICES', () => {
  it('offers the 360 camera and every station, once each', () => {
    expect(CAMERA_CHOICES).toHaveLength(ROOM_CAMERA_COUNT + 1)
    expect(CAMERA_CHOICES.filter((c) => c.station == null)).toHaveLength(1)
    expect(CAMERA_CHOICES.map((c) => c.station)).toEqual([null, 1, 2, 3, 4])
  })

  it('names every station the poses actually provide', () => {
    // The list and the cameras it names must not drift apart: a button for a
    // station `roomCameraPoses` does not return would stand the user nowhere.
    const poses = roomCameraPoses(geometryFor(RECT_OUTLINE))
    for (const c of CAMERA_CHOICES) {
      if (c.station == null) continue
      expect(poses.some((p) => p.index === c.station)).toBe(true)
    }
  })

  it('gives each one something to show and something to read', () => {
    for (const c of CAMERA_CHOICES) {
      expect(c.badge.length).toBeGreaterThan(0)
      expect(c.title.length).toBeGreaterThan(0)
      expect(c.label.length).toBeGreaterThan(c.title.length)
    }
  })
})
