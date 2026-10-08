/**
 * One tap on a model must select the MODEL, never the wall behind it.
 *
 * The bug this covers: in a room with a chair standing against a wall, a
 * single tap on the chair opened the WALL's radial menu ("Devor") and left the
 * chair unselected — even though the chair's geometry is in front of the wall
 * and the chair carries both an `onPointerDown` and the `swallowPickClick`
 * `onClick` that exists precisely to stop the click reaching the surface
 * behind it (see lib/pickEvents.ts).
 *
 * This renders the real DraggableFurnitureModels into a real react-three-fiber
 * root (not <Canvas>, which never renders in jsdom because it waits for a
 * measured size) with a wall behind it wired the way RoomShell wires one — an
 * `onClick` on the wrapping group, deliberately without stopPropagation — and
 * taps the model dead centre. The wall's handler must never run.
 *
 * `createRoot` is driven directly and `gl` is a stub: nothing is drawn, only
 * raycast, which is all the event system needs.
 */
import { describe, expect, it, vi, beforeAll, afterEach } from 'vitest'
import { act } from '@testing-library/react'
import { useState } from 'react'
import * as THREE from 'three'
import { createRoot, events as pointerEvents, extend } from '@react-three/fiber'

// A one-box GLB stand-in. The box is centred on the origin so the renderer's
// own bottom-align offset puts it at y 0..1, and the test's camera is aimed at
// y 0.5 — the middle of the model.
const fakeGltfScene = new THREE.Group()
beforeAll(() => {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial(),
  )
  mesh.name = 'seat'
  fakeGltfScene.add(mesh)
})

vi.mock('@react-three/drei', () => ({
  useGLTF: Object.assign(() => ({ scene: fakeGltfScene }), { preload: () => {} }),
  // The model's name card / part bar are DOM overlays; they play no part in
  // picking and <Html> needs a real canvas parent, so they render nothing.
  Html: () => null,
}))

import { DraggableFurnitureModels } from './StudioFurniture'
import { useRoomStore } from '@/store/roomStore'

extend(THREE)

/** Enough of a WebGLRenderer for R3F to configure a root around it. */
function stubRenderer(canvas: HTMLCanvasElement) {
  return {
    domElement: canvas,
    render: () => {},
    setSize: () => {},
    setPixelRatio: () => {},
    setClearColor: () => {},
    setAnimationLoop: () => {},
    getContext: () => null,
    dispose: () => {},
    outputColorSpace: '',
    toneMapping: 0,
    shadowMap: { enabled: false, type: 0, needsUpdate: false },
    info: { autoReset: true, reset: () => {}, render: { frame: 0 } },
    capabilities: { isWebGL2: true },
  } as unknown as THREE.WebGLRenderer
}

function tap(canvas: HTMLCanvasElement, x: number, y: number) {
  for (const type of ['pointerdown', 'pointerup', 'click'] as const) {
    const ev = new MouseEvent(type, { bubbles: true, cancelable: true })
    // jsdom computes no layout, so offsetX/offsetY are 0 — R3F's `compute`
    // turns exactly these two numbers into the pick ray.
    Object.defineProperty(ev, 'offsetX', { value: x })
    Object.defineProperty(ev, 'offsetY', { value: y })
    act(() => { canvas.dispatchEvent(ev) })
  }
}

const WIDTH = 800
const HEIGHT = 600

afterEach(() => {
  document.body.innerHTML = ''
})

type Taps = { wall: string[]; selections: Array<string | null> }

/** A room with one shop-catalogue model standing in front of one wall. */
function mountRoom(): { canvas: HTMLCanvasElement; taps: Taps; unmount: () => void } {
  useRoomStore.setState({
    furniture: [{ id: 'f1', furniture_id: 'shop-chair', x: 0, y: 0, rotation: 0 }],
    userFurniture: [],
    // A do'kon (shop) catalogue row — the ordinary case for a placed model,
    // and what the bug was reported on.
    catalogFurniture: [{
      id: 'shop-chair', name_uz: 'Stul', glb_url: '/fake-chair.glb',
      footprint_w: 50, footprint_d: 50, price_uzs: 100000,
    }] as never,
  })

  const taps: Taps = { wall: [], selections: [] }

  function Scene() {
    // Mirrors ThreeDPage: the press selects, and that selection re-renders the
    // furniture layer before the trailing click is raycast.
    const [selectedId, setSelectedId] = useState<string | null>(null)
    return (
      <>
        {/* The wall, wired the way RoomShell wires one: an `onClick` on the
            wrapping group that deliberately does NOT stop propagation, because
            whatever stands in front of it is supposed to stop the click
            first. */}
        <group onClick={() => taps.wall.push('wall')}>
          <mesh position={[0, 0.5, -3]}>
            <planeGeometry args={[40, 40]} />
            <meshBasicMaterial />
          </mesh>
        </group>
        <DraggableFurnitureModels
          controlsRef={{ current: null }}
          roomW={6000}
          roomD={6000}
          toolMode="select"
          selectedId={selectedId}
          onSelectItem={(id) => { taps.selections.push(id); setSelectedId(id) }}
          onDelete={() => {}}
          selectedPart={null}
          onSelectPart={() => {}}
        />
      </>
    )
  }

  const canvas = document.createElement('canvas')
  document.body.appendChild(canvas)
  const root = createRoot(canvas)
  root.configure({
    gl: stubRenderer,
    events: pointerEvents,
    frameloop: 'never',
    size: { width: WIDTH, height: HEIGHT, top: 0, left: 0 },
    // Straight down -Z, aimed at the model's middle. The explicit rotation is
    // what keeps R3F from re-aiming the camera at the origin.
    camera: { position: [0, 0.5, 6], rotation: [0, 0, 0] },
  })
  act(() => { root.render(<Scene />) })
  return { canvas, taps, unmount: () => act(() => { root.unmount() }) }
}

describe('tapping a model standing in front of a wall', () => {
  it('selects the model and does not let the tap reach the wall behind it', () => {
    const { canvas, taps, unmount } = mountRoom()

    tap(canvas, WIDTH / 2, HEIGHT / 2)

    expect(taps.selections).toEqual(['f1'])
    // Before the fix this was ['wall']: the press selected the model, that
    // selection rebuilt the model's clone, and R3F then refused to call the
    // new object's `onClick` because the press had recorded the old one — so
    // the click ran on to the wall and opened its ring.
    expect(taps.wall).toEqual([])

    unmount()
  })

  it('still lets a tap on bare wall reach the wall', () => {
    const { canvas, taps, unmount } = mountRoom()

    // Well clear of the model, which is a 1m box about 25px wide on screen.
    tap(canvas, WIDTH - 40, HEIGHT / 2)

    expect(taps.selections).toEqual([])
    expect(taps.wall).toEqual(['wall'])

    unmount()
  })
})
