/**
 * The doors in the wall a room is being slid along — what the slide must not
 * run past ("moving should stop when wall reaches the trim of door") and
 * what the dimensions either side of the door measure while it moves.
 */
import { describe, expect, it } from 'vitest'
import { partitionDoorSpans } from '@/lib/partitionDoors'
import { slideAxisAgainst, slideTo, type RoomBox } from '@/lib/slideRoom'
import type { RoomGeometry, WallElement } from '@/store/roomStore'

const rect = (w: number, d: number, els: Partial<Record<'A' | 'B' | 'C' | 'D', WallElement[]>> = {}): RoomGeometry => ({
  walls: (['A', 'B', 'C', 'D'] as const).map((id) => ({ id, length: id === 'A' || id === 'C' ? w : d, elements: els[id] ?? [] })),
  vertices: [[0, 0], [w, 0], [w, d], [0, d]],
})
const door = (position: number): WallElement => ({ id: 'd1', type: 'eshik', width: 900, height: 2100, sill_height: 0, position, positionAuto: false })

// The user's pair: the owner 4 x 3 with its door on wall B 797 mm along,
// the east room 200 mm away.
const owner = { id: 'a', geometry: rect(4000, 3000, { B: [door(797)] }), offsetXM: 0, offsetZM: 0 }
const east = { id: 'b', geometry: rect(3500, 3000), offsetXM: 3.95, offsetZM: 0 }
const ownerBox: RoomBox = { id: 'a', cx: 0, cz: 0, w: 4, d: 3 }
const eastBox: RoomBox = { id: 'b', cx: 3.95, cz: 0, w: 3.5, d: 3 }

describe('partitionDoorSpans', () => {
  it('finds the neighbour\'s door in the facing wall, along the wall', () => {
    // Wall B runs from z −1.5: the door spans −1.5 + 0.797 … + 0.9.
    const s = partitionDoorSpans(east, eastBox, owner, ownerBox, 'z')
    expect(s.own).toEqual([])
    expect(s.theirs).toHaveLength(1)
    expect(s.theirs[0][0]).toBeCloseTo(-0.703)
    expect(s.theirs[0][1]).toBeCloseTo(0.197)
  })

  it('finds it as the moving room\'s own when the owner moves', () => {
    const s = partitionDoorSpans(owner, ownerBox, east, eastBox, 'z')
    expect(s.theirs).toEqual([])
    expect(s.own[0][0]).toBeCloseTo(-0.703)
  })
})

describe('sliding stops at the door\'s trim', () => {
  const slide = slideAxisAgainst(eastBox, [ownerBox])!
  const trim = 0.07
  it('keeps the neighbour\'s door inside the moving room\'s wall', () => {
    const keep = { fixed: [[-0.703, 0.197] as [number, number]], trimM: trim }
    // Pushed far south (+z): its −z end may not pass the door's −z trim.
    const p = slideTo(eastBox, slide, 10, [ownerBox], { snap: false, keep })!
    expect(p.cz - eastBox.d / 2).toBeCloseTo(-0.703 - trim)
    const q = slideTo(eastBox, slide, -10, [ownerBox], { snap: false, keep })!
    expect(q.cz + eastBox.d / 2).toBeCloseTo(0.197 + trim)
  })

  it('keeps its own door inside the neighbour\'s wall', () => {
    const ownerSlide = slideAxisAgainst(ownerBox, [eastBox])!
    // The owner's door, relative to the owner's centre.
    const keep = { own: [[-0.703, 0.197] as [number, number]], trimM: trim }
    const p = slideTo(ownerBox, ownerSlide, 10, [eastBox], { snap: false, keep })!
    // The door's +z trim may reach the east room's +z end (1.5), no further.
    expect(p.cz + 0.197 + trim).toBeCloseTo(1.5)
  })
})
