/**
 * The plan draws a catalogue model the way the 3-D shows it: its traced top
 * view turned by the model's yaw first, then by the placement's rotation. The
 * hull it reports (the plan's collisions and hit-tests) is in the same turned
 * frame, so a quarter-turned model's extents swap like its footprint does.
 */
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import * as THREE from 'three'
import type { Poly } from '@/lib/modelTopView'
import { hullBounds, type Hull } from '@/lib/modelFootprint'

// An L, off-centre: no turn of it looks like any other.
const L_SHAPE: Poly = [[0, 0], [2, 0], [2, 1], [1, 1], [1, 3], [0, 3]]

vi.mock('@react-three/drei', () => ({
  useGLTF: Object.assign(() => ({ scene: new THREE.Group() }), { preload: () => {} }),
}))
vi.mock('@/lib/modelTopView', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/modelTopView')>()),
  topViewOutline: () => ({ outline: [L_SHAPE], details: [] }),
}))
vi.mock('@/lib/modelConverter', () => ({
  extractSceneInfo: () => ({ scale: 1 }),
}))

import { PlanFurnitureLayer } from './PlanFurniture'

function hullFor(modelYaw?: number): Hull {
  const onHull = vi.fn()
  render(
    <svg>
      <PlanFurnitureLayer
        furniture={[{ id: 'f1', furniture_id: 'shop-sofa', x: 0, y: 0, rotation: 0 }]}
        userFurniture={[]}
        catalogFurniture={[{
          id: 'shop-sofa', name_uz: 'Divan', glb_url: '/sofa.glb',
          footprint_w: 300, footprint_d: 200, price_uzs: null,
          ...(modelYaw === undefined ? {} : { model_yaw: modelYaw }),
        }] as never}
        W={6000}
        Dp={6000}
        selectedId={null}
        onHull={onHull}
        onPointerDownItem={() => {}}
      />
    </svg>,
  )
  expect(onHull).toHaveBeenCalled()
  return onHull.mock.calls.at(-1)![1]
}

describe('PlanFurniture', () => {
  it('draws a model without model_yaw as traced', () => {
    expect(hullFor(undefined)).toEqual(L_SHAPE)
  })

  it('the plan outline turns with the yaw', () => {
    const flat = hullFor(0)
    const turned = hullFor(90)
    const expected = hullBounds(flat, Math.PI / 2, 1)
    const got = hullBounds(turned, 0, 1)
    expect(got.minX).toBeCloseTo(expected.minX)
    expect(got.maxX).toBeCloseTo(expected.maxX)
    expect(got.minZ).toBeCloseTo(expected.minZ)
    expect(got.maxZ).toBeCloseTo(expected.maxZ)
    // …and is not merely the untouched shape.
    expect(got).not.toEqual(hullBounds(flat, 0, 1))
  })
})
