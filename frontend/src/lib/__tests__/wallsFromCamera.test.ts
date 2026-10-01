/**
 * A wall seen from outside is culled and simply is not there. Its door, its
 * skirting and its sockets are not, so they hung in mid-air in front of the
 * room. This is the same question the renderer asks when it culls.
 */
import { describe, it, expect } from 'vitest'
import { wallsBehindCamera, sameWallSet, type WallPlane } from '../wallsFromCamera'

// A 4 x 3 room at the origin. Normals point inward.
const WALLS: WallPlane[] = [
  { id: 'A', midX: 0, midZ: -1.5, nx: 0, nz: 1 },
  { id: 'C', midX: 0, midZ: 1.5, nx: 0, nz: -1 },
  { id: 'B', midX: 2, midZ: 0, nx: -1, nz: 0 },
  { id: 'D', midX: -2, midZ: 0, nx: 1, nz: 0 },
]

describe('wallsBehindCamera', () => {
  it('hides nothing while the camera is inside the room', () => {
    expect(wallsBehindCamera(WALLS, 0, 0).size).toBe(0)
  })

  it('hides the wall the camera has stepped behind', () => {
    // Behind A (further out in -z): A is between the camera and the room.
    expect([...wallsBehindCamera(WALLS, 0, -4)]).toEqual(['A'])
  })

  it('hides both walls at a corner', () => {
    expect([...wallsBehindCamera(WALLS, 5, -4)].sort()).toEqual(['A', 'B'])
  })

  it('never hides the far wall, which is what you are looking at', () => {
    expect(wallsBehindCamera(WALLS, 0, -4).has('C')).toBe(false)
  })

  it('holds its answer while the camera sits in the plane of a wall', () => {
    // Orbiting along a wall puts the camera exactly in its plane; without a
    // band the whole wall's furniture flickers every frame.
    const hidden = new Set(['A'])
    expect(wallsBehindCamera(WALLS, 0, -1.5, hidden).has('A')).toBe(true)
    expect(wallsBehindCamera(WALLS, 0, -1.5, new Set()).has('A')).toBe(false)
  })

  it('brings the attachments back once the camera is clearly inside again', () => {
    expect(wallsBehindCamera(WALLS, 0, -1.3, new Set(['A'])).has('A')).toBe(false)
  })

  it('works off each wall\'s own plane, so a drawn room is no different', () => {
    // A diagonal wall of a hand-drawn room, normal pointing up-left.
    const k = Math.SQRT1_2
    const diagonal: WallPlane[] = [{ id: 'W3', midX: 1, midZ: 1, nx: -k, nz: -k }]
    expect(wallsBehindCamera(diagonal, 3, 3).has('W3')).toBe(true)
    expect(wallsBehindCamera(diagonal, -1, -1).has('W3')).toBe(false)
  })
})

describe('sameWallSet', () => {
  it('spots a real change and ignores a re-ordering', () => {
    expect(sameWallSet(new Set(['A', 'B']), new Set(['B', 'A']))).toBe(true)
    expect(sameWallSet(new Set(['A']), new Set(['A', 'B']))).toBe(false)
    expect(sameWallSet(new Set(), new Set())).toBe(true)
  })
})
