import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { detectModelYaw, MODEL_YAWS, turnedSize, yawFromPoints, yawRadians, type ModelYaw } from '../modelYaw'
import cases from './fixtures/modelYawCases.json'

type Case = { name: string; points: [number, number, number][]; yaw: ModelYaw; detected: boolean }
const fixture = cases as Case[]

/** The synthetic bed as three.js slabs: a 2×0.4×1.6 mattress and a 2×1.0×0.1 headboard on -Z. */
function bedSlabs(): { bed: THREE.Group; headboard: THREE.Mesh } {
  const bed = new THREE.Group()
  const mattress = new THREE.Mesh(new THREE.BoxGeometry(2, 0.4, 1.6))
  mattress.position.set(0, 0.2, 0)
  const headboard = new THREE.Mesh(new THREE.BoxGeometry(2, 1.0, 0.1))
  headboard.position.set(0, 0.5, -0.85)
  bed.add(mattress, headboard)
  return { bed, headboard }
}

/** The bed with its back on -X, as some exports come. */
function bedBackOnMinusX() {
  const { bed, headboard } = bedSlabs()
  bed.rotation.y = Math.PI / 2
  const model = new THREE.Group()
  model.add(bed)
  return { model, headboard }
}

describe('yawFromPoints', () => {
  it.each(fixture.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(yawFromPoints(c.points)).toEqual({ yaw: c.yaw, detected: c.detected })
  })

  it('reads each side of the bed: back -Z → 0, +X → 90, +Z → 180, -X → 270', () => {
    const yaws = Object.fromEntries(fixture.filter((c) => c.name.startsWith('bed')).map((c) => [c.name, yawFromPoints(c.points).yaw]))
    expect(yaws).toEqual({ 'bed back -Z': 0, 'bed back +X': 90, 'bed back +Z': 180, 'bed back -X': 270 })
  })

  it('a symmetric model is not turned', () => {
    for (const name of ['symmetric box', 'ring']) {
      const c = fixture.find((f) => f.name === name)!
      expect(yawFromPoints(c.points)).toEqual({ yaw: 0, detected: false })
    }
  })

  it('an empty model is not turned', () => {
    expect(yawFromPoints([])).toEqual({ yaw: 0, detected: false })
  })
})

describe('detectModelYaw', () => {
  it('finds the back of a bed lying with its back on -X', () => {
    expect(detectModelYaw(bedBackOnMinusX().model, 'bed')).toEqual({ yaw: 270, detected: true })
  })

  it('leaves a piece with no tall back alone', () => {
    expect(detectModelYaw(bedBackOnMinusX().model, 'dining_table')).toEqual({ yaw: 0, detected: false })
    expect(detectModelYaw(bedBackOnMinusX().model, null)).toEqual({ yaw: 0, detected: false })
  })

  it('measures the model in its own frame, whatever turns it on screen', () => {
    const { model } = bedBackOnMinusX()
    const shown = new THREE.Group()
    shown.rotation.y = Math.PI
    shown.add(model)
    shown.updateMatrixWorld(true)
    expect(detectModelYaw(model, 'bed')).toEqual({ yaw: 270, detected: true })
  })

  it('the detected yaw, as a three.js rotation.y, puts the back on -Z', () => {
    const { model, headboard } = bedBackOnMinusX()
    const { yaw } = detectModelYaw(model, 'bed')
    const placed = new THREE.Group()
    placed.rotation.y = (yaw * Math.PI) / 180
    placed.add(model)
    placed.updateMatrixWorld(true)
    const at = headboard.getWorldPosition(new THREE.Vector3())
    expect(at.z).toBeCloseTo(-0.85)
    expect(at.x).toBeCloseTo(0)
  })
})

describe('turnedSize', () => {
  it('swaps width and depth for a quarter turn', () => {
    expect(turnedSize({ w: 2.32, d: 1.97 }, 270)).toEqual({ w: 1.97, d: 2.32 })
    expect(turnedSize({ w: 2.32, d: 1.97 }, 90)).toEqual({ w: 1.97, d: 2.32 })
  })

  it('keeps them for a half turn or none', () => {
    expect(turnedSize({ w: 2.32, d: 1.97 }, 180)).toEqual({ w: 2.32, d: 1.97 })
    expect(turnedSize({ w: 2.32, d: 1.97 }, 0)).toEqual({ w: 2.32, d: 1.97 })
  })
})

it('MODEL_YAWS lists the four turns', () => {
  expect(MODEL_YAWS).toEqual([0, 90, 180, 270])
})

describe('yawRadians', () => {
  it('turns degrees into the radians three.js rotates by', () => {
    expect(yawRadians(0)).toBe(0)
    expect(yawRadians(90)).toBeCloseTo(Math.PI / 2)
    expect(yawRadians(270)).toBeCloseTo((3 * Math.PI) / 2)
  })

  it('is no turn for a model without a yaw', () => {
    expect(yawRadians(undefined)).toBe(0)
  })
})
