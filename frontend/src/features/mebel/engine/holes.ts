import type { CabinetSpec, Hole, Part } from './model'

/** The 32 mm system the drilling follows (spec: 2026-10-29-mebel-teshik-design.md). */
const CONFIRMAT = { diameter: 7, depth: 0 }
const CONFIRMAT_EDGE = { diameter: 5, depth: 60 }
const SHELF_PIN = { diameter: 5, depth: 10, setback: 37, below: 5 }
const HINGE_CUP = { diameter: 35, depth: 12, fromEdge: 22.5, fromEnd: 100 }
const HINGE_PLATE = { diameter: 5, depth: 12, setback: 37, spread: 16 }
const SLIDE = { diameter: 2.5, depth: 10, setback: 37, above: 8 }

const lo = (p: Part, a: 'x' | 'y' | 'z') => p.placement[a] - p.placement[a === 'x' ? 'sx' : a === 'y' ? 'sy' : 'sz'] / 2
const hi = (p: Part, a: 'x' | 'y' | 'z') => p.placement[a] + p.placement[a === 'x' ? 'sx' : a === 'y' ? 'sy' : 'sz'] / 2
const r1 = (n: number) => Math.round(n * 10) / 10

/** Where along a panel's depth its confirmats go, mm from the front. */
function confirmatSpots(front: number, back: number): number[] {
  const d = back - front
  if (d <= 150) return [front + d * 0.25, front + d * 0.75]
  return d > 400 ? [front + 50, front + d / 2, back - 50] : [front + 50, back - 50]
}

function hingesPerDoor(height: number): number {
  return height <= 900 ? 2 : height <= 1600 ? 3 : 4
}

/** The parts of every cabinet with their holes added; MDF doors are not parts, so not drilled. */
export function drillParts(parts: Part[], cabinets: CabinetSpec[]): Part[] {
  const holes = new Map<string, Hole[]>(parts.map((p) => [p.id, []]))
  const add = (p: Part, h: Hole) => holes.get(p.id)!.push({ ...h, u: r1(h.u), v: r1(h.v) })

  for (const cab of cabinets) {
    const own = parts.filter((p) => p.cabinetId === cab.id)
    const left = own.find((p) => p.role === 'side_left')
    const right = own.find((p) => p.role === 'side_right')
    if (!left || !right) continue
    const sides = [left, right]
    const sideY1 = lo(left, 'y')
    const front = hi(left, 'z')
    const vOf = (z: number) => front - z

    // Bottom, top panel and rails: confirmats through the sides, or up through the bottom under them.
    for (const panel of own.filter((p) => ['bottom', 'top', 'rail_front', 'rail_back'].includes(p.role))) {
      const pf = vOf(hi(panel, 'z'))
      const spots = confirmatSpots(pf, vOf(lo(panel, 'z')))
      const under = lo(panel, 'x') < hi(left, 'x') // the sides stand on it
      if (!under) {
        for (const side of sides) {
          for (const v of spots) add(side, { kind: 'confirmat', face: 'B', u: panel.placement.y - sideY1, v, ...CONFIRMAT })
        }
        for (const face of ['W1', 'W2'] as const) {
          for (const v of spots) add(panel, { kind: 'confirmat_edge', face, u: v - pf, v: panel.thickness / 2, ...CONFIRMAT_EDGE })
        }
      } else {
        for (const side of sides) {
          const u = side.placement.x - lo(panel, 'x')
          for (const v of spots) {
            add(panel, { kind: 'confirmat', face: 'B', u, v: v - pf, ...CONFIRMAT })
            add(side, { kind: 'confirmat_edge', face: 'W2', u: v, v: side.thickness / 2, ...CONFIRMAT_EDGE })
          }
        }
      }
    }

    // Shelf pins under each shelf, front and back, on both sides.
    for (const shelf of own.filter((p) => p.role === 'shelf')) {
      for (const side of sides) {
        const u = lo(shelf, 'y') - SHELF_PIN.below - sideY1
        for (const v of [SHELF_PIN.setback, side.finished.width - SHELF_PIN.setback]) {
          add(side, { kind: 'shelf_pin', face: 'A', u, v, diameter: SHELF_PIN.diameter, depth: SHELF_PIN.depth })
        }
      }
    }

    // Hinges: one door hinges on the left; of two, each on its outer side.
    const doors = own.filter((p) => p.role === 'door').sort((a, b) => a.placement.x - b.placement.x)
    doors.forEach((door, i) => {
      const onLeft = doors.length === 1 || i === 0
      const L = door.finished.length
      const n = hingesPerDoor(cab.height)
      const us = Array.from({ length: n }, (_, k) => HINGE_CUP.fromEnd + ((L - 2 * HINGE_CUP.fromEnd) * k) / (n - 1))
      const side = onLeft ? left : right
      for (const u of us) {
        add(door, { kind: 'hinge_cup', face: 'A', u, v: onLeft ? HINGE_CUP.fromEdge : door.finished.width - HINGE_CUP.fromEdge, diameter: HINGE_CUP.diameter, depth: HINGE_CUP.depth })
        for (const du of [-HINGE_PLATE.spread, HINGE_PLATE.spread]) {
          add(side, { kind: 'hinge_plate', face: 'A', u: lo(door, 'y') + u - sideY1 + du, v: HINGE_PLATE.setback, diameter: HINGE_PLATE.diameter, depth: HINGE_PLATE.depth })
        }
      }
    })

    // Slides: three pilot holes along each drawer box's slide line, on both sides.
    const boxSides = own.filter((p) => p.role === 'drawer_side')
    for (let i = 0; i < boxSides.length; i += 2) {
      const box = boxSides[i]
      const Ls = box.finished.length
      const v0 = vOf(hi(box, 'z'))
      for (const side of sides) {
        for (const v of [v0 + SLIDE.setback, v0 + Ls / 2, v0 + Ls - SLIDE.setback]) {
          add(side, { kind: 'slide', face: 'A', u: lo(box, 'y') + SLIDE.above - sideY1, v, diameter: SLIDE.diameter, depth: SLIDE.depth })
        }
      }
    }
  }
  return parts.map((p) => ({ ...p, holes: holes.get(p.id) ?? [] }))
}
