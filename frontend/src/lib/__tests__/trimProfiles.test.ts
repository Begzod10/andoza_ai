/**
 * The trim catalogue is data transcribed off a millwork sheet, which is easy to
 * get quietly wrong: a duplicated code, a size the picker's own steppers cannot
 * reach, or a profile drawn outside the box it claims to occupy — none of which
 * announce themselves until someone puts one in a room.
 */
import { describe, it, expect } from 'vitest'
import {
  trimProfilesOf, trimProfileDef, resolveTrim,
  TRIM_HEIGHT_RANGE_MM, TRIM_WIDTH_RANGE_MM,
  type TrimKind, type TrimProfileDef,
} from '../trimProfiles'

/**
 * The outline itself, sampled — not the control points.
 *
 * Control points steer a curve without being reached: one skirting bead is
 * aimed from x = 1.06 and actually peaks at 0.9976, exactly filling its stated
 * width. Testing the hull instead of the curve called that a fault when it is
 * the drawing working as intended.
 */
function outlineOf(def: TrimProfileDef, steps = 24): [number, number][] {
  const bez = (t: number, a: number, b: number, c: number, d: number) => {
    const u = 1 - t
    return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d
  }
  const pts: [number, number][] = [def.path.start]
  let from = def.path.start
  for (const step of def.path.steps) {
    if (step.c1 && step.c2) {
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        pts.push([
          bez(t, from[0], step.c1[0], step.c2[0], step.to[0]),
          bez(t, from[1], step.c1[1], step.c2[1], step.to[1]),
        ])
      }
    } else {
      pts.push(step.to)
    }
    from = step.to
  }
  return pts
}

describe.each<TrimKind>(['skirting', 'cornice'])('%s profiles', (kind) => {
  const profiles = trimProfilesOf(kind)

  it('has some', () => {
    expect(profiles.length).toBeGreaterThan(0)
  })

  it('gives every profile its own id and label', () => {
    expect(new Set(profiles.map((p) => p.id)).size).toBe(profiles.length)
    expect(new Set(profiles.map((p) => p.label)).size).toBe(profiles.length)
  })

  it('stays inside the box it claims to occupy', () => {
    // A moulding that ran past its own width x height would stand proud of the
    // wall by more than the size the estimate is priced from.
    for (const def of profiles) {
      for (const [x, y] of outlineOf(def)) {
        expect(x, `${def.label} x`).toBeGreaterThanOrEqual(0)
        expect(x, `${def.label} x`).toBeLessThanOrEqual(1)
        expect(y, `${def.label} y`).toBeGreaterThanOrEqual(0)
        expect(y, `${def.label} y`).toBeLessThanOrEqual(1)
      }
    }
  })

  it('runs from the ceiling/floor face to the wall face', () => {
    // The outline is closed along x = 0, so it has to start and finish there.
    for (const def of profiles) {
      expect(def.path.start, def.label).toEqual([0, 0])
      expect(def.path.steps.at(-1)!.to, def.label).toEqual([0, 1])
    }
  })

  it('has sizes the picker can actually reach', () => {
    // A default outside the stepper's range would be clamped the moment the
    // user touched it, silently resizing what they had just chosen.
    const h = TRIM_HEIGHT_RANGE_MM[kind]
    const w = TRIM_WIDTH_RANGE_MM[kind]
    for (const def of profiles) {
      expect(def.defaultHeightMm, def.label).toBeGreaterThanOrEqual(h.min)
      expect(def.defaultHeightMm, def.label).toBeLessThanOrEqual(h.max)
      expect(def.defaultWidthMm, def.label).toBeGreaterThanOrEqual(w.min)
      expect(def.defaultWidthMm, def.label).toBeLessThanOrEqual(w.max)
    }
  })

  it('resolves an unknown id to a real profile rather than nothing', () => {
    expect(trimProfileDef('no-such-profile', kind).kind).toBe(kind)
    expect(resolveTrim({ id: 'no-such-profile' }, kind).heightM).toBeGreaterThan(0)
  })

  it('only contains profiles of its own kind', () => {
    for (const def of profiles) expect(def.kind).toBe(kind)
  })
})

describe('the cornice sheet', () => {
  /** Code → width x height, straight off the T-series sheet. */
  const SHEET: [string, number, number][] = [
    ['T 140', 65, 100], ['T 56', 65, 100], ['T 139', 80, 100], ['T 254', 80, 100],
    ['T 279', 90, 100], ['T 272', 95, 100], ['T 276', 98, 100], ['T 193', 60, 101],
    ['T 37', 25, 102], ['T 112', 72, 102], ['T 339', 113, 103], ['T 58', 50, 105],
    ['T 371', 73, 105], ['T 160', 88, 105], ['T 267', 102, 105], ['T 169', 105, 105],
    ['T 84', 120, 105], ['T 324', 120, 105], ['T 192', 98, 106], ['T 255', 70, 110],
  ]

  it('offers every profile on the sheet, at its printed size', () => {
    const byLabel = new Map(trimProfilesOf('cornice').map((p) => [p.label, p]))
    for (const [label, w, h] of SHEET) {
      const def = byLabel.get(label)
      expect(def, `${label} missing`).toBeDefined()
      expect(def!.defaultWidthMm, `${label} width`).toBe(w)
      expect(def!.defaultHeightMm, `${label} height`).toBe(h)
    }
  })

  it('offers nothing that is not on the sheet', () => {
    const sheet = new Set(SHEET.map(([l]) => l))
    for (const def of trimProfilesOf('cornice')) expect(sheet.has(def.label)).toBe(true)
  })

  it('lists them in the order the sheet reads', () => {
    expect(trimProfilesOf('cornice').map((p) => p.label)).toEqual(SHEET.map(([l]) => l))
  })
})
