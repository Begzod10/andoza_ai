/**
 * The shell has one job: leave the sun no way in that the room does not have.
 *
 * These check the two properties the leak came from — that the shell is a
 * closed solid around the room with real thickness, and that its pieces
 * actually overlap rather than meeting along a line — plus the one property
 * that would make it useless the other way, that openings still let light
 * through.
 */
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildShellGeometry, SHELL_T } from '../shadowShell'
import type { ResolvedElMm } from '../shadowShell'

const W = 5
const D = 4
const H = 3

function bare() {
  return buildShellGeometry({ W, D, H, elementsA: [], elementsB: [], elementsC: [], elementsD: [] })!
}

/** Does any triangle-bearing box in the merged geometry contain this point? */
function solidAt(geo: THREE.BufferGeometry, p: THREE.Vector3): boolean {
  // The merge is a soup of boxes, so test against each 24-vertex box in turn.
  const pos = geo.getAttribute('position')
  const box = new THREE.Box3()
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i += 24) {
    box.makeEmpty()
    for (let j = i; j < i + 24 && j < pos.count; j++) {
      box.expandByPoint(v.fromBufferAttribute(pos, j))
    }
    if (box.containsPoint(p)) return true
  }
  return false
}

describe('shadow shell', () => {
  it('wraps the room without intruding into it', () => {
    const geo = bare()
    geo.computeBoundingBox()
    const b = geo.boundingBox!
    // Reaches past every interior face…
    expect(b.min.x).toBeLessThanOrEqual(-W / 2 - SHELL_T + 1e-6)
    expect(b.max.x).toBeGreaterThanOrEqual(W / 2 + SHELL_T - 1e-6)
    expect(b.min.z).toBeLessThanOrEqual(-D / 2 - SHELL_T + 1e-6)
    expect(b.max.z).toBeGreaterThanOrEqual(D / 2 + SHELL_T - 1e-6)
    // …and over the ceiling, without hanging below the floor
    expect(b.max.y).toBeGreaterThanOrEqual(H + SHELL_T - 1e-6)
    expect(b.min.y).toBeCloseTo(0)
  })

  it('leaves the middle of the room empty', () => {
    expect(solidAt(bare(), new THREE.Vector3(0, H / 2, 0))).toBe(false)
  })

  it('is solid through the full thickness of every wall', () => {
    const geo = bare()
    const mid = SHELL_T / 2
    expect(solidAt(geo, new THREE.Vector3(0, H / 2, -(D / 2 + mid)))).toBe(true)  // A
    expect(solidAt(geo, new THREE.Vector3(0, H / 2, D / 2 + mid))).toBe(true)     // C
    expect(solidAt(geo, new THREE.Vector3(W / 2 + mid, H / 2, 0))).toBe(true)     // B
    expect(solidAt(geo, new THREE.Vector3(-(W / 2 + mid), H / 2, 0))).toBe(true)  // D
  })

  it('fills every corner — the seam the light used to come down', () => {
    const geo = bare()
    const mid = SHELL_T / 2
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const p = new THREE.Vector3(sx * (W / 2 + mid), H / 2, sz * (D / 2 + mid))
        expect(solidAt(geo, p)).toBe(true)
      }
    }
  })

  it('laps the roof over the wall tops instead of butting against them', () => {
    const geo = bare()
    // A point inside the top of a wall slab must also be inside the roof slab,
    // which is only true if the two overlap.
    const p = new THREE.Vector3(0, H + SHELL_T / 2, -(D / 2 + SHELL_T / 2))
    expect(solidAt(geo, p)).toBe(true)
    // And directly over the middle of the room, the roof alone is solid.
    expect(solidAt(geo, new THREE.Vector3(0, H + SHELL_T / 2, 0))).toBe(true)
  })

  it('cuts openings so daylight still comes through a window', () => {
    // A 1.2 m window, 1 m sill, 1.4 m tall, centred on wall A's 5 m span
    const window_: ResolvedElMm = { position: 1900, width: 1200, height: 1400, sill_height: 1000 }
    const geo = buildShellGeometry({
      W, D, H, elementsA: [window_], elementsB: [], elementsC: [], elementsD: [],
    })!
    const z = -(D / 2 + SHELL_T / 2)
    // Middle of the glass: open
    expect(solidAt(geo, new THREE.Vector3(0, 1.7, z))).toBe(false)
    // Spandrel below it and lintel above it: still solid
    expect(solidAt(geo, new THREE.Vector3(0, 0.5, z))).toBe(true)
    expect(solidAt(geo, new THREE.Vector3(0, 2.7, z))).toBe(true)
    // And the pier beside it
    expect(solidAt(geo, new THREE.Vector3(-2.0, 1.7, z))).toBe(true)
  })

  it('keeps a doorway open all the way to the floor', () => {
    const door: ResolvedElMm = { position: 2000, width: 900, height: 2100, sill_height: 0 }
    const geo = buildShellGeometry({
      W, D, H, elementsA: [door], elementsB: [], elementsC: [], elementsD: [],
    })!
    const z = -(D / 2 + SHELL_T / 2)
    expect(solidAt(geo, new THREE.Vector3(-0.05, 0.2, z))).toBe(false)
    expect(solidAt(geo, new THREE.Vector3(-0.05, 1.5, z))).toBe(false)
    // Lintel above the door remains
    expect(solidAt(geo, new THREE.Vector3(-0.05, 2.6, z))).toBe(true)
  })
})

/**
 * The reported leak: sunlight running down the side of a doorway and around a
 * window frame, onto the floor.
 *
 * A door leaf is cut 6mm narrower than its opening and a sash sits inside its
 * frame. The shell used to cut its hole at the FULL opening, so those few
 * millimetres were a slot with nothing behind them and the sun came straight
 * through. The shell must now be solid across that clearance.
 */
describe('the gap around a leaf is not a light slot', () => {
  /** Leaf-to-jamb clearance in DoorLeaves, metres. */
  const LEAF_GAP = 0.006
  /** A door on wall A: 900 wide, 2100 tall, 1000mm along the wall. */
  const DOOR: ResolvedElMm = { position: 1000, width: 900, height: 2100, sill_height: 0 }
  /** A window on wall A: 1200 wide, 1400 tall, sill at 900. */
  const WINDOW: ResolvedElMm = { position: 1500, width: 1200, height: 1400, sill_height: 900 }

  const withDoor = () =>
    buildShellGeometry({ W, D, H, elementsA: [DOOR], elementsB: [], elementsC: [], elementsD: [] })!
  const withWindow = () =>
    buildShellGeometry({ W, D, H, elementsA: [WINDOW], elementsB: [], elementsC: [], elementsD: [] })!

  /** Wall A's interior face is at z = -D/2; its slab sits just outside. */
  const zA = -(D / 2 + SHELL_T / 2)
  /** Wall-A openings are measured from the wall's start; the slab is centred. */
  const xAt = (mm: number) => mm / 1000 - W / 2

  it('is solid where the door leaf clears its jamb', () => {
    const geo = withDoor()
    // Just inside each jamb, within the clearance the leaf leaves behind.
    const leftEdge = xAt(DOOR.position + LEAF_GAP / 2 * 1000)
    const rightEdge = xAt(DOOR.position + DOOR.width - LEAF_GAP / 2 * 1000)
    expect(solidAt(geo, new THREE.Vector3(leftEdge, 1.0, zA))).toBe(true)
    expect(solidAt(geo, new THREE.Vector3(rightEdge, 1.0, zA))).toBe(true)
  })

  it('is solid where the leaf clears its head', () => {
    const geo = withDoor()
    const y = (DOOR.sill_height + DOOR.height) / 1000 - LEAF_GAP / 2
    expect(solidAt(geo, new THREE.Vector3(xAt(DOOR.position + DOOR.width / 2), y, zA))).toBe(true)
  })

  it('is solid where a window sash clears its frame', () => {
    const geo = withWindow()
    const y = (WINDOW.sill_height + WINDOW.height / 2) / 1000
    expect(solidAt(geo, new THREE.Vector3(xAt(WINDOW.position + 2), y, zA))).toBe(true)
    expect(solidAt(geo, new THREE.Vector3(xAt(WINDOW.position + WINDOW.width - 2), y, zA))).toBe(true)
  })

  it('still lets daylight through the opening itself', () => {
    // The whole point of a hole. Well inside the door and the window, the
    // shell must be open, or the room goes dark.
    const door = withDoor()
    expect(solidAt(door, new THREE.Vector3(xAt(DOOR.position + DOOR.width / 2), 1.0, zA))).toBe(false)
    const win = withWindow()
    const y = (WINDOW.sill_height + WINDOW.height / 2) / 1000
    expect(solidAt(win, new THREE.Vector3(xAt(WINDOW.position + WINDOW.width / 2), y, zA))).toBe(false)
  })

  it('keeps the sill below a window solid', () => {
    const geo = withWindow()
    const y = WINDOW.sill_height / 2000
    expect(solidAt(geo, new THREE.Vector3(xAt(WINDOW.position + WINDOW.width / 2), y, zA))).toBe(true)
  })

  it('does not seal a narrow opening shut', () => {
    // Two insets must never meet in the middle of a slot window.
    const slot: ResolvedElMm = { position: 1000, width: 40, height: 40, sill_height: 1500 }
    const geo = buildShellGeometry({ W, D, H, elementsA: [slot], elementsB: [], elementsC: [], elementsD: [] })!
    const y = (slot.sill_height + slot.height / 2) / 1000
    expect(solidAt(geo, new THREE.Vector3(xAt(slot.position + slot.width / 2), y, zA))).toBe(false)
  })
})

describe('the sill edge', () => {
  const LEAF_GAP = 0.006
  const WINDOW: ResolvedElMm = { position: 1500, width: 1200, height: 1400, sill_height: 900 }
  const DOOR: ResolvedElMm = { position: 1000, width: 900, height: 2100, sill_height: 0 }
  const zA = -(D / 2 + SHELL_T / 2)
  const xAt = (mm: number) => mm / 1000 - W / 2

  it('is solid where a window sash clears its sill', () => {
    const geo = buildShellGeometry({ W, D, H, elementsA: [WINDOW], elementsB: [], elementsC: [], elementsD: [] })!
    const y = WINDOW.sill_height / 1000 + LEAF_GAP / 2
    expect(solidAt(geo, new THREE.Vector3(xAt(WINDOW.position + WINDOW.width / 2), y, zA))).toBe(true)
  })

  it('leaves a doorway threshold clear, so an open door casts no line across it', () => {
    const geo = buildShellGeometry({ W, D, H, elementsA: [DOOR], elementsB: [], elementsC: [], elementsD: [] })!
    // Just above the floor in the middle of the doorway: nothing may block it.
    expect(solidAt(geo, new THREE.Vector3(xAt(DOOR.position + DOOR.width / 2), 0.003, zA))).toBe(false)
  })
})
