/**
 * A catalogue model is turned by its `model_yaw` before the placement's own
 * rotation, so that every piece faces the room the same way (back on -Z,
 * front on +Z) whichever way its GLB was exported.
 *
 * The yaw lives on a group INSIDE the node that carries `item.rotation`: the
 * live rotate drag writes `rotation.y` on that outer node, and must never wipe
 * the yaw out. The geometry footprint reported for collisions is the turned
 * one, so a quarter turn swaps its width and depth.
 *
 * Same harness as StudioFurniture.pick.test.tsx: a real react-three-fiber root
 * driven directly, with a stub renderer — nothing is drawn.
 */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { act } from '@testing-library/react'
import { useState } from 'react'
import * as THREE from 'three'
import { advance, createRoot, events as pointerEvents, extend, useThree } from '@react-three/fiber'

// The GLB stand-in, swapped per test. A plain group holding one named box.
let fakeGltfScene = new THREE.Group()
function useBox(w: number, h: number, d: number) {
  fakeGltfScene = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial())
  mesh.name = 'seat'
  fakeGltfScene.add(mesh)
}

vi.mock('@react-three/drei', () => ({
  useGLTF: Object.assign(() => ({ scene: fakeGltfScene }), { preload: () => {} }),
  Html: () => null,
}))

import { DraggableFurnitureItem, DraggableFurnitureModels, FurnitureItem } from './StudioFurniture'
import { useRoomStore, type PlacedFurniture } from '@/store/roomStore'

extend(THREE)

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

const WIDTH = 800
const HEIGHT = 600

afterEach(() => {
  document.body.innerHTML = ''
})

/** A shop-catalogue row, with or without a yaw (an old cached response has none). */
function shopRow(modelYaw?: number) {
  return {
    id: 'shop-chair', name_uz: 'Stul', glb_url: '/fake-chair.glb',
    footprint_w: 100, footprint_d: 100, price_uzs: 100000,
    ...(modelYaw === undefined ? {} : { model_yaw: modelYaw }),
  }
}

function placeOne(rotation: number, modelYaw?: number): PlacedFurniture {
  const item: PlacedFurniture = { id: 'f1', furniture_id: 'shop-chair', x: 0, y: 0, rotation }
  useRoomStore.setState({
    furniture: [item],
    userFurniture: [],
    catalogFurniture: [shopRow(modelYaw)] as never,
  })
  return item
}

function mount(node: React.ReactNode) {
  let scene: THREE.Scene | null = null
  function Grab() {
    scene = useThree((s) => s.scene)
    return null
  }
  const canvas = document.createElement('canvas')
  document.body.appendChild(canvas)
  const root = createRoot(canvas)
  root.configure({
    gl: stubRenderer,
    events: pointerEvents,
    frameloop: 'never',
    size: { width: WIDTH, height: HEIGHT, top: 0, left: 0 },
    camera: { position: [0, 0.5, 6], rotation: [0, 0, 0] },
  })
  act(() => { root.render(<><Grab />{node}</>) })
  return {
    canvas,
    scene: () => scene!,
    unmount: () => act(() => { root.unmount() }),
  }
}

/** The model's own mesh (not the selection outline's copy of it) and the nodes above it. */
function modelNodes(scene: THREE.Scene) {
  let mesh: THREE.Mesh | null = null
  let outline: THREE.Mesh | null = null
  scene.traverse((o) => {
    if (o.name !== 'seat' || !(o as THREE.Mesh).isMesh) return
    if ((o as THREE.Mesh).material instanceof THREE.ShaderMaterial) outline = o as THREE.Mesh
    else mesh = o as THREE.Mesh
  })
  if (!mesh) throw new Error('model mesh not found')
  const model = (mesh as THREE.Mesh).parent!   // the clone, i.e. the <primitive>
  const yaw = model.parent!                     // the yaw group
  const placed = yaw.parent!                    // the node that carries item.rotation
  return { mesh: mesh as THREE.Mesh, outline: outline as THREE.Mesh | null, model, yaw, placed }
}

describe('a model turned by its yaw', () => {
  it('renders an item without model_yaw unrotated', () => {
    useBox(1, 1, 1)
    const item = placeOne(0.3)
    const { scene, unmount } = mount(<FurnitureItem item={item} />)

    const { yaw, placed } = modelNodes(scene())
    expect(yaw.rotation.y).toBe(0)
    expect(placed.rotation.y).toBeCloseTo(0.3)

    unmount()
  })

  it('turns the model by its yaw inside the placement rotation', () => {
    useBox(1, 1, 1)
    const item = placeOne(0.3, 90)
    const { scene, unmount } = mount(<FurnitureItem item={item} />)

    const { yaw, placed } = modelNodes(scene())
    expect(yaw.rotation.y).toBeCloseTo(Math.PI / 2)
    expect(placed.rotation.y).toBeCloseTo(0.3)

    unmount()
  })

  it('live rotation keeps the inner yaw', () => {
    useBox(1, 1, 1)
    placeOne(0, 90)
    function Scene() {
      const [selectedId, setSelectedId] = useState<string | null>(null)
      return (
        <DraggableFurnitureModels
          controlsRef={{ current: null }}
          roomW={6000}
          roomD={6000}
          toolMode="rotate"
          selectedId={selectedId}
          onSelectItem={setSelectedId}
          onDelete={() => {}}
          selectedPart={null}
          onSelectPart={() => {}}
        />
      )
    }
    const { canvas, scene, unmount } = mount(<Scene />)

    // Press on the model, then drag 30px left: a 45° turn (π/120 per pixel, 5° steps).
    const down = new MouseEvent('pointerdown', { bubbles: true, cancelable: true })
    Object.defineProperty(down, 'offsetX', { value: WIDTH / 2 })
    Object.defineProperty(down, 'offsetY', { value: HEIGHT / 2 })
    act(() => { canvas.dispatchEvent(down) })
    act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: -30 })) })
    act(() => { advance(performance.now()) })

    const { yaw, placed, mesh, outline } = modelNodes(scene())
    expect(placed.rotation.y).toBeCloseTo(Math.PI / 4)
    expect(yaw.rotation.y).toBeCloseTo(Math.PI / 2)
    // The selection cage turns with the model, yaw and all.
    expect(outline).not.toBeNull()
    scene().updateMatrixWorld(true)
    expect(outline!.matrixWorld.toArray().map((v) => +v.toFixed(6)))
      .toEqual(mesh.matrixWorld.toArray().map((v) => +v.toFixed(6)))

    act(() => { window.dispatchEvent(new MouseEvent('pointerup')) })
    unmount()
  })

  it('reports a turned collision footprint', () => {
    useBox(2.32, 1, 1.97)
    const item = placeOne(0, 270)
    const onFootprint = vi.fn()
    const { unmount } = mount(
      <DraggableFurnitureItem
        item={item}
        isDragging={false}
        isSelected={false}
        toolMode="select"
        dragPosRef={{ current: new THREE.Vector3() }}
        dragRotRef={{ current: 0 }}
        dragScaleRef={{ current: 1 }}
        onMeshPointerDown={() => {}}
        onButtonPointerDown={() => {}}
        onFootprint={onFootprint}
        displayInfo={{ name: 'Stul', priceUzs: null }}
        selectedPartKey={null}
        onSelectPart={() => {}}
      />,
    )

    expect(onFootprint).toHaveBeenCalled()
    const [id, hw, hd] = onFootprint.mock.calls.at(-1)!
    expect(id).toBe('f1')
    expect(hw).toBeCloseTo(0.985)
    expect(hd).toBeCloseTo(1.16)

    unmount()
  })
})
