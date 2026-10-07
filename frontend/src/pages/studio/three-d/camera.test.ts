import { describe, it, expect } from 'vitest'
import { getCamera, fitFramingToAspect } from './helpers'

const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

describe('the corner overview camera', () => {
  const W = 4, D = 3, H = 2.7
  const cam = getCamera('corner', W, D, H)

  it('is above the back-left corner, high enough to look down on the floor', () => {
    expect(cam.position[0]).toBeLessThanOrEqual(-W / 2)
    expect(cam.position[2]).toBeLessThanOrEqual(-D / 2)
    expect(cam.position[1]).toBeGreaterThan(H * 0.8)
  })

  it('looks down at the floor steeply enough not to see it at a grazing angle', () => {
    const [px, py, pz] = cam.position
    const [tx, ty, tz] = cam.target
    const pitch = (Math.atan2(py - ty, Math.hypot(px - tx, pz - tz)) * 180) / Math.PI
    expect(pitch).toBeGreaterThan(25)
    expect(pitch).toBeLessThan(60)
  })

  it('looks at the middle of the room, not at a wall', () => {
    const [tx, ty, tz] = cam.target
    expect(Math.abs(tx)).toBeLessThan(W * 0.15)
    expect(Math.abs(tz)).toBeLessThan(D * 0.15)
    expect(ty).toBeGreaterThan(0)
    expect(ty).toBeLessThan(H)
  })

  it('sees the far corner and the near ones in a 68° view: the whole room fits the angle', () => {
    // The direction to each floor corner, against the direction the camera faces.
    const dir = [cam.target[0] - cam.position[0], cam.target[1] - cam.position[1], cam.target[2] - cam.position[2]]
    const len = Math.hypot(...dir)
    const farCorners = [[W / 2, 0, -D / 2], [W / 2, 0, D / 2], [-W / 2, 0, D / 2]]
    for (const c of farCorners) {
      const v = [c[0] - cam.position[0], c[1] - cam.position[1], c[2] - cam.position[2]]
      const cos = (v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2]) / (Math.hypot(...v) * len)
      const angle = (Math.acos(cos) * 180) / Math.PI
      expect(angle).toBeLessThan(55) // inside a 16:9 view of 68° vertical (about 97° across)
    }
  })

  it('scales with the room, so a bigger room is framed from further away', () => {
    const big = getCamera('corner', W * 2, D * 2, H)
    expect(dist(big.position, big.target)).toBeGreaterThan(dist(cam.position, cam.target))
  })

  it('pulls back along the same line for a narrow canvas, and not at all for a wide one', () => {
    const wide = fitFramingToAspect(cam, 1, 100)
    expect(wide).toBe(cam)
    const narrow = fitFramingToAspect(cam, 2, 100)
    expect(dist(narrow.position, narrow.target)).toBeCloseTo(dist(cam.position, cam.target) * 2, 5)
    expect(narrow.target).toEqual(cam.target)
  })
})
