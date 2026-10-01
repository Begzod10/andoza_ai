import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { acesFilmicToneMap, linearToSrgbHex, srgbHexToLinear } from '@/lib/moonriseSky'
import { iesRelativeOutputAt, parseIes } from '@/lib/iesPhotometry'
import { kelvinToHex } from '@/lib/lightCatalog'
import {
  DEFAULT_LIGHT_AREA_M2,
  DEFAULT_LIGHT_COLOR_K,
  DEFAULT_LIGHT_BRIGHTNESS_PCT,
  DEFAULT_LIGHT_MAX_EMITTERS_HIGH,
  DEFAULT_LIGHT_MAX_EMITTERS_LOW,
  defaultLightCounts,
  defaultLightIntensity,
  defaultLightPlan,
  defaultLightWorldSpots,
  lampGrid,
  lightPlanRoom,
} from '@/lib/defaultRoomLights'
import { pointInPolygon } from '@/lib/planPolygon'
import type { RoomGeometry } from '@/store/roomStore'

/** A legacy wizard rectangle: four walls named A/B/C/D and no vertices. */
const rect = (W: number, D: number): RoomGeometry =>
  ({
    walls: [
      { id: 'A', length: W },
      { id: 'B', length: D },
      { id: 'C', length: W },
      { id: 'D', length: D },
    ],
  }) as unknown as RoomGeometry

/** A drawn or scanned room: numbered walls and a real outline. */
const poly = (vertices: [number, number][]): RoomGeometry =>
  ({
    walls: vertices.map((_, i) => ({ id: `W${i + 1}`, length: 1000 })),
    vertices,
  }) as unknown as RoomGeometry

/**
 * 6 x 6 m with a 3 x 3 m bite out of one corner — 27 m² of real floor inside a
 * 36 m² bounding box, and the bounding box's centre (3000, 3000) is on the
 * outline itself rather than inside the room. The shape the old layout failed
 * on.
 */
const LROOM = poly([
  [0, 0],
  [6000, 0],
  [6000, 3000],
  [3000, 3000],
  [3000, 6000],
  [0, 6000],
])

describe('how many lamps', () => {
  it('scales with the floor, one per spacing-criterion cell', () => {
    expect(DEFAULT_LIGHT_AREA_M2).toBe(6)
    expect(defaultLightCounts(6, 4).ideal).toBe(1)
    expect(defaultLightCounts(12, 4).ideal).toBe(2)
    expect(defaultLightCounts(18, 4).ideal).toBe(3)
    expect(defaultLightCounts(24, 4).ideal).toBe(4)
    expect(defaultLightCounts(40, 4).ideal).toBe(7)
  })

  it('never leaves a room with no lamp at all', () => {
    expect(defaultLightCounts(0.5, 4)).toEqual({ ideal: 1, count: 1 })
    expect(defaultLightCounts(12, 0).count).toBe(1)
  })

  it('caps the emitters at what the renderer will pay for', () => {
    expect(defaultLightCounts(40, DEFAULT_LIGHT_MAX_EMITTERS_HIGH).count).toBe(4)
    expect(defaultLightCounts(40, DEFAULT_LIGHT_MAX_EMITTERS_LOW).count).toBe(2)
    // A small room is under the cap on both, so a phone and a desktop show it
    // identically.
    expect(defaultLightCounts(12, DEFAULT_LIGHT_MAX_EMITTERS_LOW).count).toBe(2)
    expect(defaultLightCounts(12, DEFAULT_LIGHT_MAX_EMITTERS_HIGH).count).toBe(2)
  })
})

describe('how bright', () => {
  const LUMENS = 13172.61

  it('comes from the file lumens through lumensToIntensity', () => {
    // 13172.61 / 800 x 50%, which is what the table in the constant's comment
    // was computed at.
    expect(defaultLightIntensity(LUMENS, 2, 2)).toBeCloseTo(8.2329, 3)
    expect(DEFAULT_LIGHT_BRIGHTNESS_PCT).toBe(50)
  })

  it('keeps the room as bright when the emitter cap cuts the count', () => {
    // 7 lamps' worth of light out of 4 emitters: the same total, in fewer and
    // stronger pools, so a 40 m² room is not dimmer than a 12 m² one.
    const capped = defaultLightIntensity(LUMENS, 7, 4)
    expect(capped * 4).toBeCloseTo(defaultLightIntensity(LUMENS, 7, 7) * 7, 6)
    expect(capped).toBeGreaterThan(defaultLightIntensity(LUMENS, 7, 7))
  })

  it('is about twenty times what the old defaults put out in total', () => {
    // The whole old array summed to intensity 1.6, which is why nothing the
    // user saw of those lamps was light — it was the emissive disc meshes.
    expect(defaultLightIntensity(LUMENS, 2, 2) * 2).toBeGreaterThan(1.6 * 10)
  })
})

describe('the lamp grid', () => {
  it('uses only exact factorisations, so no subset has to be picked', () => {
    for (const count of [1, 2, 3, 4, 6, 7, 8]) {
      for (const [W, D] of [[3000, 4000], [6000, 2000], [4000, 4000]]) {
        const { nx, nz } = lampGrid(count, W, D)
        expect(nx * nz).toBe(count)
      }
    }
  })

  it('runs the long way down the long axis', () => {
    expect(lampGrid(2, 3000, 4000)).toEqual({ nx: 1, nz: 2 })
    expect(lampGrid(2, 4000, 3000)).toEqual({ nx: 2, nz: 1 })
    expect(lampGrid(4, 3000, 4000)).toEqual({ nx: 2, nz: 2 })
    expect(lampGrid(4, 8000, 2000)).toEqual({ nx: 4, nz: 1 })
    expect(lampGrid(3, 3000, 9000)).toEqual({ nx: 1, nz: 3 })
  })
})

describe('a legacy rectangle', () => {
  it('describes its floor without needing an outline', () => {
    const room = lightPlanRoom(rect(3000, 4000))
    expect(room).toMatchObject({ W: 3000, D: 4000, minX: 0, minZ: 0, areaM2: 12 })
    expect(room.outline).toEqual([[0, 0], [3000, 0], [3000, 4000], [0, 4000]])
  })

  it('lays two lamps down the length of a 3 x 4 m room', () => {
    const plan = defaultLightPlan(rect(3000, 4000), 4)
    expect(plan.areaM2).toBe(12)
    expect(plan.ideal).toBe(2)
    expect(plan.spots).toHaveLength(2)
    const [a, b] = plan.spots
    // Centred across the width, a little over a metre off each end wall, and
    // the pair 1.83 m apart — the half-a-spacing-from-the-wall layout, arrived
    // at by relaxation rather than hardcoded.
    expect(a.x).toBeCloseTo(1500, 3)
    expect(b.x).toBeCloseTo(1500, 3)
    expect(a.z).toBeCloseTo(1086.96, 1)
    expect(b.z).toBeCloseTo(2913.04, 1)
    expect(Math.abs(b.z - a.z)).toBeCloseTo(1826.09, 1)
  })

  it('lands on the quarter points when it is asked for four', () => {
    // Forced by giving the same floor four lamps' worth of area.
    const plan = defaultLightPlan(rect(6000, 8000), 4)
    expect(plan.spots).toHaveLength(4)
    const xs = [...new Set(plan.spots.map((p) => Math.round(p.x)))].sort((m, n) => m - n)
    const zs = [...new Set(plan.spots.map((p) => Math.round(p.z)))].sort((m, n) => m - n)
    expect(xs).toHaveLength(2)
    expect(zs).toHaveLength(2)
    // The quarter points of the floor the lamps may use — the room inset by
    // the 150 mm wall clearance, so 1575/4425 across and 2075/5925 along —
    // reached to within the 15 mm the sampling grid can resolve. Those are
    // within 90 mm of the room's own quarter points (1500/4500 and
    // 2000/6000), i.e. the classic half-a-spacing-from-the-wall downlight
    // layout, and the relaxation arrives at it rather than being told it.
    expect(xs[0]).toBeCloseTo(1575, -2)
    expect(xs[1]).toBeCloseTo(4425, -2)
    expect(zs[0]).toBeCloseTo(2075, -2)
    expect(zs[1]).toBeCloseTo(5925, -2)
    // Symmetric about the room, to the millimetre.
    expect(xs[0] + xs[1]).toBeCloseTo(6000, 0)
    expect(zs[0] + zs[1]).toBeCloseTo(8000, 0)
  })

  it('puts a single lamp in the middle', () => {
    const plan = defaultLightPlan(rect(2400, 2400), 1)
    expect(plan.spots).toHaveLength(1)
    expect(plan.spots[0].x).toBeCloseTo(1200, 3)
    expect(plan.spots[0].z).toBeCloseTo(1200, 3)
  })

  it('still produces a lamp for a room narrower than the wall clearance', () => {
    const plan = defaultLightPlan(rect(400, 400), 4)
    expect(plan.spots.length).toBeGreaterThanOrEqual(1)
    for (const p of plan.spots) {
      expect(p.x).toBeGreaterThan(0)
      expect(p.x).toBeLessThan(400)
    }
  })
})

describe('a drawn polygon room', () => {
  it('measures the floor it has, not its bounding box', () => {
    const room = lightPlanRoom(LROOM)
    expect(room.W).toBe(6000)
    expect(room.D).toBe(6000)
    expect(room.areaM2).toBe(27)
    expect(defaultLightPlan(LROOM, 4).ideal).toBe(5)
  })

  it('keeps every lamp over real floor, never in the notch', () => {
    // The bug family this guards: the bounding box's own centre, (3000, 3000),
    // is not inside this room, and the old grid was built about it.
    expect(pointInPolygon(3200, 3200, lightPlanRoom(LROOM).outline)).toBe(false)
    for (const max of [1, 2, 3, 4]) {
      const plan = defaultLightPlan(LROOM, max)
      expect(plan.spots).toHaveLength(Math.min(max, 5))
      for (const p of plan.spots) {
        expect(pointInPolygon(p.x, p.z, plan.room.outline)).toBe(true)
      }
    }
  })

  it('spreads the lamps instead of bunching them', () => {
    const plan = defaultLightPlan(LROOM, 4)
    // The complaint was lamps "bunched together", two near a corner and two
    // overlapping. Nothing here is within a metre of anything else, and the
    // set spans both arms of the L.
    for (let i = 0; i < plan.spots.length; i++) {
      for (let j = i + 1; j < plan.spots.length; j++) {
        const d = Math.hypot(plan.spots[i].x - plan.spots[j].x, plan.spots[i].z - plan.spots[j].z)
        expect(d).toBeGreaterThan(1000)
      }
    }
    // The long arm (z < 3000) and the short one (x < 3000, z > 3000) both get
    // lamps, which a layout confined to the bounding box's middle would not do.
    expect(plan.spots.some((p) => p.x > 3000)).toBe(true)
    expect(plan.spots.some((p) => p.z > 3000)).toBe(true)
  })

  it('gives two lamps one arm each', () => {
    const plan = defaultLightPlan(LROOM, 2)
    expect(plan.spots).toHaveLength(2)
    const inLongArm = plan.spots.filter((p) => p.z < 3000)
    const inShortArm = plan.spots.filter((p) => p.z > 3000)
    expect(inLongArm).toHaveLength(1)
    expect(inShortArm).toHaveLength(1)
  })

  it('reaches the world frame the 3D scene draws the outline in', () => {
    // planPolygon centres a polygon on its VERTEX MEAN, so world =
    // vertex - centroid; the bounding box does not start at plan (0, 0) and
    // reading it as if it did is what put the old grid off to one side.
    // Vertex mean of the L is (3000, 2000).
    const plan = defaultLightPlan(LROOM, 2)
    const world = defaultLightWorldSpots(plan)
    expect(world).toHaveLength(2)
    for (let i = 0; i < world.length; i++) {
      expect(world[i].x).toBeCloseTo((plan.spots[i].x - 3000) / 1000, 6)
      expect(world[i].z).toBeCloseTo((plan.spots[i].z - 3000) / 1000, 6)
      // And the world point is inside the outline as the scene draws it.
      expect(
        pointInPolygon(
          world[i].x * 1000 + 3000,
          world[i].z * 1000 + 2000,
          LROOM.vertices as [number, number][],
        ),
      ).toBe(true)
    }
  })

  it('handles a polygon whose vertex mean is well off its bounding centre', () => {
    // A long thin T: the mean of the vertices sits in the stem, far from the
    // middle of the box. Every lamp still has to be over floor.
    const T = poly([
      [0, 0],
      [9000, 0],
      [9000, 1500],
      [5250, 1500],
      [5250, 7000],
      [3750, 7000],
      [3750, 1500],
      [0, 1500],
    ])
    const plan = defaultLightPlan(T, 4)
    expect(plan.spots.length).toBeGreaterThan(0)
    for (const p of plan.spots) {
      expect(pointInPolygon(p.x, p.z, plan.room.outline)).toBe(true)
    }
  })

  it('is deterministic — the same room always lays out the same way', () => {
    const a = defaultLightPlan(LROOM, 4).spots
    const b = defaultLightPlan(LROOM, 4).spots
    expect(a).toEqual(b)
  })
})

/**
 * What the user actually sees, worked out rather than looked at.
 *
 * There is no WebGL in this environment, so "the lamps light the room without
 * blowing it out" has to be arithmetic or it is an opinion. This reproduces
 * what the fragment shader will accumulate — `getAmbientLightIrradiance` and
 * `getHemisphereLightIrradiance` for the fills, the spot's own
 * `intensity * profile * cos / d²` for each lamp — and runs it through the
 * studio's ACES and the sRGB transfer function, which `lib/moonriseSky.ts`
 * already carries for exactly this purpose. It is the table in
 * `DEFAULT_LIGHT_BRIGHTNESS_PCT`'s comment, pinned, so changing the dim
 * percentage, the colour temperature, the spacing rule or the `.ies` file
 * cannot quietly invalidate the argument for any of them.
 */
describe('what the default array does on screen', () => {
  const profile = parseIes(
    readFileSync(resolve(__dirname, '../../../public/ies/wide_downlight_13k.ies'), 'utf8'),
  )
  const plan = defaultLightPlan(rect(3000, 4000), DEFAULT_LIGHT_MAX_EMITTERS_HIGH)
  const intensity = defaultLightIntensity(profile.lumens, plan.ideal, plan.spots.length)
  const lampColor = srgbHexToLinear(kelvinToHex(DEFAULT_LIGHT_COLOR_K))
  /** Lamp positions in metres, and their height above the floor. */
  const lamps = plan.spots.map((p) => ({ x: p.x / 1000, z: p.z / 1000 }))
  const MOUNT = 2.7 - 0.05

  /** `SceneLighting`'s fills: ambient #FFFFFF at 1.0 plus the hemisphere. */
  const AMBIENT: [number, number, number] = [1, 1, 1]
  const SKY = srgbHexToLinear('#DCE8FF').map((v) => v * 0.35) as [number, number, number]
  /** And the much smaller pair `ThreeDCanvasScene` swaps in with the scene light off. */
  const NIGHT = srgbHexToLinear('#8090B0')
    .map((v, i) => v * 0.22 + srgbHexToLinear('#4a5570')[i] * 0.35) as [number, number, number]

  const DAY_UP: [number, number, number] = [
    AMBIENT[0] + SKY[0], AMBIENT[1] + SKY[1], AMBIENT[2] + SKY[2],
  ]

  /** Direct irradiance from the whole array on an up-facing patch of floor. */
  function onFloor(x: number, z: number): [number, number, number] {
    const out: [number, number, number] = [0, 0, 0]
    for (const l of lamps) {
      const r = Math.hypot(x - l.x, z - l.z)
      const d = Math.hypot(r, MOUNT)
      const e = intensity * iesRelativeOutputAt(profile, (Math.atan2(r, MOUNT) * 180) / Math.PI) * (MOUNT / d) / (d * d)
      for (let c = 0; c < 3; c++) out[c] += lampColor[c] * e
    }
    return out
  }

  /** The same on the x = 0 wall, `below` metres under the ceiling. */
  function onSideWall(z: number, below: number): [number, number, number] {
    const out: [number, number, number] = [0, 0, 0]
    for (const l of lamps) {
      const v = [-l.x, -below, z - l.z]
      const d = Math.hypot(v[0], v[1], v[2])
      const deg = (Math.atan2(Math.hypot(v[0], v[2]), below) * 180) / Math.PI
      // Surface-to-light direction dotted with the wall's inward normal (1,0,0).
      const cos = Math.max(0, -v[0] / d)
      const e = intensity * iesRelativeOutputAt(profile, deg) * cos / (d * d)
      for (let c = 0; c < 3; c++) out[c] += lampColor[c] * e
    }
    return out
  }

  /** Lambertian surface under an irradiance, as the canvas will show it. */
  function screen(
    irradiance: [number, number, number],
    fill: [number, number, number],
    albedo: number,
  ): [number, number, number] {
    const radiance = irradiance.map((v, i) => ((v + fill[i]) * albedo) / Math.PI) as [number, number, number]
    const hex = linearToSrgbHex(acesFilmicToneMap(radiance))
    const n = parseInt(hex.slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }

  const FLOOR_ALBEDO = 0.45
  const WALL_ALBEDO = 0.85
  const NONE: [number, number, number] = [0, 0, 0]

  it('drives each lamp from the file lumens at the chosen dim', () => {
    expect(lamps).toHaveLength(2)
    expect(intensity).toBeCloseTo(8.233, 2)
  })

  it('lifts the daylight floor clearly, without going near white', () => {
    const off = screen(NONE, DAY_UP, FLOOR_ALBEDO)
    const middle = screen(onFloor(1.5, 2.0), DAY_UP, FLOOR_ALBEDO)
    const under = screen(onFloor(lamps[0].x, lamps[0].z), DAY_UP, FLOOR_ALBEDO)
    expect(off[1]).toBeCloseTo(139, -1)
    expect(middle[1]).toBeCloseTo(199, -1)
    expect(under[1]).toBeCloseTo(193, -1)
    // A lift well past anything the room's own shading varies by...
    expect(middle[1] - off[1]).toBeGreaterThan(50)
    // ...and short of the 230 that #FFFFFF itself tone-maps to, so there is
    // still headroom for the sun to land on the same floor.
    expect(middle[1]).toBeLessThan(225)
  })

  it('keeps a readable gradient out to the corners, so the layout reads as one', () => {
    const middle = screen(onFloor(1.5, 2.0), DAY_UP, FLOOR_ALBEDO)
    const corner = screen(onFloor(0.15, 0.15), DAY_UP, FLOOR_ALBEDO)
    expect(corner[1]).toBeCloseTo(165, -1)
    expect(middle[1] - corner[1]).toBeGreaterThan(25)
  })

  it('does not blow out the wall nearest a lamp', () => {
    // The brightest patch of plaster the array makes: the side wall 1.5 m from
    // the nearer lamp, 1.2 m below the ceiling. A vertical surface sees the
    // hemisphere's sky and ground mixed half and half rather than the sky
    // alone, which is the only reason its fill differs from the floor's.
    const GROUND = srgbHexToLinear('#CFC6B4').map((v) => v * 0.35) as [number, number, number]
    const daySide = AMBIENT.map((v, i) => v + (SKY[i] + GROUND[i]) / 2) as [number, number, number]
    const off = screen(NONE, daySide, WALL_ALBEDO)
    const on = screen(onSideWall(lamps[0].z, 1.2), daySide, WALL_ALBEDO)
    expect(off[1]).toBeCloseTo(181, -1)
    expect(on[1]).toBeCloseTo(201, -1)
    // Short of the 230 that #FFFFFF itself tone-maps to, with the sun still to
    // be added on top of it.
    expect(on[1]).toBeLessThan(215)
    for (const c of on) expect(c).toBeLessThan(255)
  })

  it('is plainly the light source when the scene light is off', () => {
    const off = screen(NONE, NIGHT, FLOOR_ALBEDO)
    const middle = screen(onFloor(1.5, 2.0), NIGHT, FLOOR_ALBEDO)
    expect(off[1]).toBeLessThan(30)
    expect(middle[1]).toBeCloseTo(170, -1)
  })

  it('reads as electric light against the cool daylight fill', () => {
    // 6500 K displacing the #DCE8FF hemisphere: the unlit floor is faintly
    // blue, the lit one neutral. That difference is the only colour cue that
    // the room's own lamps are doing the lighting.
    const off = screen(NONE, DAY_UP, FLOOR_ALBEDO)
    const middle = screen(onFloor(1.5, 2.0), DAY_UP, FLOOR_ALBEDO)
    expect(off[2] - off[0]).toBeGreaterThan(2)
    expect(Math.abs(middle[2] - middle[0])).toBeLessThanOrEqual(2)
  })
})
