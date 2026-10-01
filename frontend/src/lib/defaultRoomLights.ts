/**
 * Where a room's default ceiling lamps go, and how hard they are driven.
 *
 * These are the lamps that exist before the user has placed any of their own:
 * `CeilingLights` in `pages/studio/three-d/LightingComponents.tsx` renders them
 * and stands down the moment the first fixture is placed from Chiroqlar.
 *
 * The complaint this file answers (2026-10-02) was that they were "located
 * incorrectly" — bunched into a corner and overlapping near one side instead of
 * laid out over the room. They were, and for two compounding reasons, both in
 * the function this replaces (`computeDiskLightPositions` in
 * `pages/studio/three-d/helpers.ts`):
 *
 *   - It only ever saw `W` and `D`, the room's bounding box, and built a grid
 *     centred on the world origin. For a legacy A-B-C-D rectangle the origin IS
 *     the middle of the floor, so that worked. For a drawn or scanned polygon,
 *     `NWallRoomShell` centres the outline on the MEAN of its vertices, which
 *     is not the centre of its bounding box unless the room happens to be
 *     symmetric — so the whole grid sat off to one side of the floor it was
 *     supposed to light, and in an L-shaped room part of it sat in the notch,
 *     outside the room altogether. The same "the rectangle is handled, the
 *     polygon falls through" shape as the furniture clamp `furnitureBounds.ts`
 *     was written to fix.
 *   - Only a pooled handful of the grid positions became real lights, and the
 *     pool was picked as every n-th entry of a list built column by column
 *     (`for ix { for iz { } }`). Taking 2 of a 2x2 grid that way picks indices
 *     0 and 2 — both lamps on the SAME side of the room. On a phone, which
 *     pools to 2, that is the bunching in the screenshot exactly.
 *
 * So the layout here is computed from the room's real outline, in the plan
 * millimetre frame `planPolygon.ts` defines, and it decides the emitter count
 * FIRST — because with the fixtures now invisible (see `LightingComponents`),
 * the lamps that exist are the only thing the user can see, and a pooled subset
 * of a denser grid is a lopsided pattern rather than a hidden optimisation.
 */
import { lumensToIntensity } from '@/lib/lightCatalog'
import { offsetPolygon, planPolygon, pointInPolygon } from '@/lib/planPolygon'
import { planToWorld, type PlanPoint } from '@/lib/furnitureBounds'
import { roomExtents, type RoomExtents } from '@/lib/roomDims'
import { computeFloorArea } from '@/store/utils/geometryHelpers'
import type { RoomGeometry } from '@/store/roomStore'

/**
 * Clearance kept between a default lamp and the nearest wall, mm.
 *
 * Small on purpose: this is a safety margin, not a design offset. Even
 * illuminance across a floor wants lamps half a spacing in from the walls, and
 * the relaxation below arrives at that on its own — a 3 m wide room laid out
 * for two columns puts them 0.82 m from each side wall without being told to.
 * All this margin has to do is stop a lamp landing *in* a wall or inside a
 * doorway reveal on an outline whose vertices sit exactly on the wall line,
 * which 150 mm does. The 600 mm a lighting catalogue would quote as a wall
 * offset was tried and is actively wrong here: in a 3 m wide room it eats 40%
 * of the width and pulls the two columns to 0.9 m apart, which is the bunching
 * the user complained about, reintroduced by hand.
 */
export const DEFAULT_LIGHT_WALL_CLEARANCE_MM = 150

/**
 * Floor area one of these lamps is spaced to cover, m².
 *
 * From the spacing criterion lighting design uses for downlights: lamps about
 * 1.2–1.5 times their mounting height above the work plane apart. At a 2.7 m
 * ceiling and an 0.8 m work plane that height is 1.85 m, so 2.2–2.8 m apart,
 * so 4.9–7.8 m² each; 6 sits in the middle of that band.
 *
 * Cross-checked against the shipped file's own photometry rather than taken on
 * faith: its output is still half of peak at 36.3 degrees off axis (see
 * `iesAngleAtFractionDeg`), which at a 2.65 m drop is a 1.95 m radius circle.
 * Lamps 2.4 m apart therefore have their half-peak circles overlapping well
 * past each other's centres, which is why the result reads as an even wash
 * with a gentle fall to the corners rather than as separate pools — the
 * measured numbers for that are in `DEFAULT_LIGHT_BRIGHTNESS_PCT`.
 */
export const DEFAULT_LIGHT_AREA_M2 = 6

/**
 * Colour temperature of the default array, kelvin.
 *
 * 6500 K, as the user asked for (2026-10-02) — nominally D65, the reference
 * white of sRGB itself, and cooler than anything in `LIGHT_TYPES`, whose
 * entries run 2700 to 4000 K. It is a constant of its own rather than a change
 * to the catalogue's `ies` fixture precisely so it stays scoped to the default
 * array: a user who places IES spots of their own still gets that fixture's
 * 3000 K, and their per-light `colorK` override and its slider are untouched.
 * Nothing in the UI is pinned by this either — `LIGHT_LIMITS.colorK`'s slider
 * belongs to `LightPanel`, which edits a `PlacedLight`, and the default array
 * is not one, so it has no panel and no slider to sit at the end of.
 *
 * `kelvinToHex` is sound at the daylight end, which was worth checking rather
 * than assuming: 6500 K puts it on its `t <= 66` branch, where red is pinned
 * and green and blue are monotone logs, and it returns #FFFEFA — linear
 * (1.000, 0.991, 0.956), luminance 0.990. That is neutral white to within 1
 * count of green and 5 of blue of the #FFFFFF that D65 should map to exactly,
 * so no cast, nothing to fix in the helper, and nothing downstream to
 * compensate for. (The approximation is much warmer than true blackbody lower
 * down — 3000 K comes out at luminance 0.538 — but that is the catalogue's
 * business, not this array's.)
 *
 * It only has one job here. The default lamps draw no fixture at all — see
 * `IesCeilingLamp` in `LightingComponents.tsx` — so there is no emissive body
 * whose colour could drift from the light's; this value has to be right as
 * illumination and nothing else.
 */
export const DEFAULT_LIGHT_COLOR_K = 6500

/**
 * How hard the default array is driven, as the percentage `lumensToIntensity`
 * already takes.
 *
 * It has to be dimmed, and by a lot. The file is a 13,172 lumen commercial
 * downlight; one of those per 6 m² is over 2,000 lumens per square metre,
 * roughly ten times any residential design level. And `lumensToIntensity` is
 * explicitly not photometric — its own comment calls it a calibrated ratio
 * with 800 lm at 1.0 — so no honest number falls out of the arithmetic and the
 * only way to choose is to work out what lands on screen.
 *
 * Which is what this is, computed the way `lib/moonriseSky.ts` computes its
 * exposures: ACES at the studio's 1.15 and the sRGB transfer function, applied
 * to the irradiance the shader will actually accumulate, per channel, with the
 * lamp at its real `DEFAULT_LIGHT_COLOR_K` colour. The room is a 3x4 m one
 * laid out by `defaultLightPlan` (two lamps, 1.83 m apart, 1.09 m off the end
 * walls, 2.65 m above the floor); the floor is taken at 0.45 albedo and the
 * wall at 0.85; "day" is the `SceneLighting` fill the room always has
 * (`ambientLight` #FFFFFF at 1.0 plus the #DCE8FF/#CFC6B4 hemisphere at 0.35),
 * "night" the much smaller fill `ThreeDCanvasScene` swaps in when the scene
 * light is switched off.
 *
 *   pct  per-lamp   daylight floor, sRGB                                 side wall         night floor
 *                   off           middle        under         corner     off → on          off → middle
 *     0      0.00   137,139,142   137,139,142   137,139,142   137,139,…  181,181,182 → 181  11,15,25 → 11,15,25
 *    25      4.12   137,139,142   178,178,179   172,173,174   152,154,…  181,181,182 → 193  11,15,25 → 123,123,125
 *    50      8.23   137,139,142   199,199,199   193,193,193   164,165,…  181,181,182 → 201  11,15,25 → 170,170,170
 *    75     12.35   137,139,142   212,212,212   206,206,206   174,175,…  181,181,182 → 208  11,15,25 → 195,195,194
 *   100     16.47   137,139,142   220,220,220   215,215,214   183,183,…  181,181,182 → 214  11,15,25 → 209,209,208
 *   200     32.93   137,139,142   236,236,236   232,232,232   204,205,…  181,181,182 → 227  11,15,25 → 233,233,232
 *
 * The side wall is the one 1.5 m from the nearer lamp, read 1.2 m below the
 * ceiling, which is the brightest patch of plaster the array produces.
 *
 * 50 is bracketed from both sides. Above it the picture stops being a lit room
 * and starts being a white one: at 100 the floor is at 220 where #FFFFFF
 * itself only tone-maps to 230, and the corner has closed to within 37 counts
 * of the middle so the layout no longer reads as a layout. Below it, at 25,
 * the daylight lift is 39 counts — real, but no more than the room's own
 * shading already varies by, so switching the lamps on would read as a guess.
 * At 50 the floor lifts 60 counts, keeps a 34 count gradient out to the
 * corners, leaves the brightest wall at 201 with the sun still to be added on
 * top of it, and with the scene light off takes the floor from 15 to 170 —
 * unambiguously the lamps lighting the room. Note that the lit floor is
 * neutral where the unlit one is faintly blue (199,199,199 against
 * 137,139,142): that is the 6500 K lamp displacing the cool #DCE8FF
 * hemisphere fill, which is the one colour cue that the room's own lights are
 * what is doing the lighting.
 *
 * `__tests__/defaultRoomLights.test.ts` recomputes this, so none of it can go
 * stale behind a change to the dim, the colour temperature, the spacing rule
 * or the `.ies` file itself.
 *
 * Note what this replaces: the old defaults summed to a total intensity of 1.6
 * across the whole array, about 1/20th of this, which put their contribution
 * below one output code value. Nothing the user saw of them was light at all —
 * it was the emissive disc meshes, which is why removing those had to come with
 * raising this.
 */
export const DEFAULT_LIGHT_BRIGHTNESS_PCT = 50

/** How many real emitters the scene will pay for. See `LightingComponents`. */
export const DEFAULT_LIGHT_MAX_EMITTERS_HIGH = 4
export const DEFAULT_LIGHT_MAX_EMITTERS_LOW = 2

/** The room's floor, ready to lay lamps out on. All distances plan mm. */
export interface LightPlanRoom {
  /** Bounding-box extents — the same W/D every 3D view uses. */
  W: number
  D: number
  /**
   * Bounding-box corner. NOT (0, 0) for a polygon room: `planPolygon` centres
   * the outline on its vertex mean, not on its bounding box, so the box can
   * start anywhere. Reading it as 0 is half of the bug this file fixes.
   */
  minX: number
  minZ: number
  /** The room's real outline. */
  outline: [number, number][]
  /** That outline pulled in by `DEFAULT_LIGHT_WALL_CLEARANCE_MM`. */
  inset: [number, number][]
  /** Floor area of the real outline, m². */
  areaM2: number
}

/**
 * The floor a drawn, scanned or legacy room presents.
 *
 * Two branches for the same reason `roomBoundsFromGeometry` in
 * `furnitureBounds.ts` has two: a polygon carries its outline and a legacy
 * A-B-C-D rectangle carries none, so the rectangle's is the trivial one. They
 * are not two different rules — both are "the room, pulled in by the
 * clearance" — and the area comes from `computeFloorArea`, which already knows
 * both cases, rather than from a second shoelace here.
 */
export function lightPlanRoom(
  geometry: RoomGeometry,
  fallback?: Partial<RoomExtents>,
  clearanceMm = DEFAULT_LIGHT_WALL_CLEARANCE_MM,
): LightPlanRoom {
  const areaFromGeometry = computeFloorArea(geometry) / 1e6
  const poly = planPolygon(geometry)
  if (poly) {
    return {
      W: poly.W,
      D: poly.D,
      minX: poly.minX,
      minZ: poly.minZ,
      outline: poly.vertices,
      inset: offsetPolygon(poly, -clearanceMm),
      areaM2: areaFromGeometry,
    }
  }
  const ext = roomExtents(geometry, fallback)
  const W = ext.W * 1000
  const D = ext.D * 1000
  // A room narrower than twice the clearance would invert the inset, so cap it
  // rather than hand back a rectangle turned inside out.
  const c = Math.min(clearanceMm, W / 4, D / 4)
  return {
    W,
    D,
    minX: 0,
    minZ: 0,
    outline: [[0, 0], [W, 0], [W, D], [0, D]],
    inset: [[c, c], [W - c, c], [W - c, D - c], [c, D - c]],
    areaM2: areaFromGeometry > 0 ? areaFromGeometry : (W * D) / 1e6,
  }
}

/**
 * How many lamps the floor wants, and how many we will actually emit.
 *
 * `ideal` is the lighting answer — one per `DEFAULT_LIGHT_AREA_M2` of real
 * floor, which for an L-shaped room means its real floor and not its bounding
 * box. `count` is that capped at what the renderer will pay for. When the cap
 * bites, `defaultLightIntensity` divides the ideal array's whole output among
 * the emitters that are left, so a big room is as bright as it should be and
 * simply has fewer, stronger pools.
 */
export function defaultLightCounts(areaM2: number, maxEmitters: number): { ideal: number; count: number } {
  const ideal = Math.max(1, Math.ceil(areaM2 / DEFAULT_LIGHT_AREA_M2))
  return { ideal, count: Math.max(1, Math.min(ideal, maxEmitters)) }
}

/**
 * One lamp's `SpotLight.intensity`.
 *
 * The fixture's rated output through `lumensToIntensity` — the helper the rest
 * of the lighting already uses, so the default array and a user-placed fixture
 * are on one scale — dimmed by `DEFAULT_LIGHT_BRIGHTNESS_PCT`, then carrying
 * the share of any lamps the emitter cap left out.
 */
export function defaultLightIntensity(
  lumens: number,
  ideal: number,
  count: number,
  brightnessPct = DEFAULT_LIGHT_BRIGHTNESS_PCT,
): number {
  return (lumensToIntensity(lumens, brightnessPct) * ideal) / Math.max(1, count)
}

/**
 * The integer grid closest to the room's own proportions.
 *
 * Only factorisations of the exact lamp count are considered, so the grid holds
 * neither more nor fewer lamps than were asked for — no subset has to be picked
 * afterwards, which is the step that produced the lopsided pattern before. For
 * a count with no useful factors (3, say) that means a single row, which in a
 * long room is the right layout anyway.
 */
export function lampGrid(count: number, W: number, D: number): { nx: number; nz: number } {
  const aspect = D > 0 ? W / D : 1
  let best = { nx: 1, nz: count }
  let bestScore = Infinity
  for (let nx = 1; nx <= count; nx++) {
    if (count % nx !== 0) continue
    const nz = count / nx
    const score = Math.abs(Math.log(nx / nz / aspect))
    if (score < bestScore - 1e-9) {
      bestScore = score
      best = { nx, nz }
    }
  }
  return best
}

/**
 * Points covering the floor, for the relaxation to weigh.
 *
 * A grid over the bounding box keeping only what falls inside the inset
 * outline, so an L-shaped room's notch simply contributes no samples and
 * carries no weight. Both counts are forced even: for a rectangle that makes
 * the sample set exactly symmetric about every bisector the relaxation can
 * draw, which is what lets the result land on the room's quarter points
 * exactly instead of a sample step away from them.
 */
function floorSamples(room: LightPlanRoom, outline: [number, number][], target = 1600): PlanPoint[] {
  const step = Math.max(50, Math.sqrt((room.W * room.D) / target))
  const even = (n: number) => 2 * Math.max(1, Math.round(n / 2))
  const nx = even(room.W / step)
  const nz = even(room.D / step)
  const out: PlanPoint[] = []
  for (let i = 0; i < nx; i++) {
    const x = room.minX + ((i + 0.5) * room.W) / nx
    for (let j = 0; j < nz; j++) {
      const z = room.minZ + ((j + 0.5) * room.D) / nz
      if (pointInPolygon(x, z, outline)) out.push({ x, z })
    }
  }
  return out
}

/** Lloyd's algorithm: move each lamp to the centre of the floor it serves. */
function relax(seeds: PlanPoint[], samples: PlanPoint[], iterations = 24): PlanPoint[] {
  const lamps = seeds.map((p) => ({ ...p }))
  for (let it = 0; it < iterations; it++) {
    const sumX = new Array<number>(lamps.length).fill(0)
    const sumZ = new Array<number>(lamps.length).fill(0)
    const n = new Array<number>(lamps.length).fill(0)
    for (const s of samples) {
      let best = 0
      let bestD = Infinity
      for (let k = 0; k < lamps.length; k++) {
        const d = (s.x - lamps[k].x) ** 2 + (s.z - lamps[k].z) ** 2
        if (d < bestD) {
          bestD = d
          best = k
        }
      }
      sumX[best] += s.x
      sumZ[best] += s.z
      n[best]++
    }
    let moved = 0
    for (let k = 0; k < lamps.length; k++) {
      // A lamp that serves no floor at all — a seed that landed in the notch of
      // an L, where there are no samples to claim it — is parked on the sample
      // farthest from every other lamp instead, which is the floor most in
      // need of one. Leaving it where it is would strand a lamp in a wall.
      if (n[k] === 0) {
        let far = samples[0]
        let farD = -1
        for (const s of samples) {
          let d = Infinity
          for (let j = 0; j < lamps.length; j++) {
            if (j === k) continue
            d = Math.min(d, (s.x - lamps[j].x) ** 2 + (s.z - lamps[j].z) ** 2)
          }
          if (d > farD) {
            farD = d
            far = s
          }
        }
        moved = Math.max(moved, (lamps[k].x - far.x) ** 2 + (lamps[k].z - far.z) ** 2)
        lamps[k] = { ...far }
        continue
      }
      const nx = sumX[k] / n[k]
      const nz = sumZ[k] / n[k]
      moved = Math.max(moved, (lamps[k].x - nx) ** 2 + (lamps[k].z - nz) ** 2)
      lamps[k] = { x: nx, z: nz }
    }
    if (moved < 1) break // settled to under a millimetre
  }
  return lamps
}

/**
 * Pull a lamp onto real floor, if it is not already on some.
 *
 * Needed because the mean of a set of points inside a non-convex region can
 * fall outside it: relax three lamps over an L and the one serving the inside
 * corner can settle in the notch. Only applied when it has to be, so a lamp
 * that relaxed to a perfectly good spot keeps it to the millimetre instead of
 * being nudged up to half a sample step away from it.
 */
function ontoFloor(p: PlanPoint, samples: PlanPoint[], outline: [number, number][]): PlanPoint {
  if (pointInPolygon(p.x, p.z, outline)) return p
  let best = samples[0]
  let bestD = Infinity
  for (const s of samples) {
    const d = (s.x - p.x) ** 2 + (s.z - p.z) ** 2
    if (d < bestD) {
      bestD = d
      best = s
    }
  }
  return best
}

export interface DefaultLightPlan {
  /** Lamp positions in plan millimetres — the frame `fixturePose` works in. */
  spots: PlanPoint[]
  /** How many a lighting layout wants for this floor, before the emitter cap. */
  ideal: number
  /** Floor area of the room's real outline, m². */
  areaM2: number
  /** The frame the spots are expressed in, for `planToWorld`. */
  room: LightPlanRoom
}

/**
 * Lay the default lamps out over the room's floor.
 *
 * The rule is "k lamps, each at the centre of the floor it is nearest to",
 * which is Lloyd's algorithm seeded from the integer grid closest to the room's
 * proportions and weighed only on floor the room actually has. That one rule
 * covers both cases the old code split on, and lands where a lighting layout
 * would:
 *
 *   - A 3 x 4 m rectangle takes two lamps (12 m² / 6), a 1 x 2 grid along the
 *     longer axis, and settles at 1.500 m across and 1.087 / 2.913 m along:
 *     centred on the width, a little over a metre off each end wall, the pair
 *     1.83 m apart. A 6 x 8 m one takes four of its eight (the emitter cap)
 *     and settles at 1.575 / 4.425 m across and 2.075 / 5.925 m along. Those
 *     are the quarter points of the floor the lamps may use — the classic
 *     half-a-spacing-from-the-wall downlight layout, and within 90 mm of the
 *     room's own quarter points, arrived at rather than hardcoded.
 *   - An L-shaped room takes lamps for its real area, not its bounding box,
 *     and every one of them lands over floor. A seed that falls in the notch
 *     has no floor to claim and is moved to the part of the room least well
 *     served; and because the relaxed centre of a non-convex region can itself
 *     fall outside the region, any lamp that ends up off the floor is pulled
 *     to the nearest sample, every one of which is inside the room by
 *     construction. A 6 x 6 m L with a 3 x 3 m bite out of it — 27 m² inside a
 *     36 m² box, whose box centre is not even in the room — takes five lamps'
 *     worth of light from four emitters, one of them out in the long arm and
 *     three down the short one, nothing within a metre of anything else.
 */
export function defaultLightPlan(
  geometry: RoomGeometry,
  maxEmitters: number,
  fallback?: Partial<RoomExtents>,
): DefaultLightPlan {
  const room = lightPlanRoom(geometry, fallback)
  const { ideal, count } = defaultLightCounts(room.areaM2, maxEmitters)

  // The inset outline is the one to lay out on, but a mitred inset of a narrow
  // or sharply cornered outline can collapse to nothing. Fall back to the raw
  // outline rather than to no lamps at all.
  let region = room.inset
  let samples = floorSamples(room, region)
  if (samples.length < count) {
    region = room.outline
    samples = floorSamples(room, region)
  }
  if (samples.length === 0) {
    // Nothing to stand on — a degenerate outline. One lamp at the middle of
    // the bounding box keeps the room lit and visibly wrong rather than dark.
    return {
      spots: [{ x: room.minX + room.W / 2, z: room.minZ + room.D / 2 }],
      ideal,
      areaM2: room.areaM2,
      room,
    }
  }

  const { nx, nz } = lampGrid(count, room.W, room.D)
  const seeds: PlanPoint[] = []
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      seeds.push({
        x: room.minX + ((i + 0.5) * room.W) / nx,
        z: room.minZ + ((j + 0.5) * room.D) / nz,
      })
    }
  }

  const spots = relax(seeds, samples).map((p) => ontoFloor(p, samples, region))
  return { spots, ideal, areaM2: room.areaM2, room }
}

/**
 * The same layout in the world metres the 3D scene draws in.
 *
 * `planToWorld` is `furnitureBounds`', so the lamps land in the frame the
 * furniture clamp, the 2D plans and `fixturePose` all agree on — world =
 * plan − (W/2, D/2), which for a polygon room is vertex − centroid, exactly
 * where `NWallRoomShell` puts the outline.
 */
export function defaultLightWorldSpots(plan: DefaultLightPlan): { x: number; z: number }[] {
  return plan.spots.map((p) => planToWorld(p, plan.room))
}
