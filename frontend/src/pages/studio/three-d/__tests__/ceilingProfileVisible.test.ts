import { describe, it, expect } from 'vitest'
import { ceilingProfileVisible } from '../FloorCeiling'

// A dropped ceiling's boxes are solid from every side: seen from above the room
// they covered it like a lid (the slab itself only faces down).
describe('ceilingProfileVisible', () => {
  it('shows the dropped ceiling from inside the room', () => {
    expect(ceilingProfileVisible(1.6, 2.7)).toBe(true)
  })
  it('hides it when the camera looks down from above the ceiling', () => {
    expect(ceilingProfileVisible(6, 2.7)).toBe(false)
    expect(ceilingProfileVisible(2.7, 2.7)).toBe(false)
  })
})
