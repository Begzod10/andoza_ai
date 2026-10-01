import * as THREE from 'three'

/**
 * The 360 camera: where it stands, and how its picture is made.
 *
 * It stands in the middle of the room at eye height and has no target — it
 * turns on the spot rather than orbiting a point, because a panorama is taken
 * from somewhere, not of something.
 *
 * The picture is equirectangular, 4000 x 2000: the 2:1 ratio every 360 viewer
 * expects, since the image wraps 360 degrees across and 180 up and down.
 */

/** Eye height, metres. A person's eyes, not a camera on a tripod. */
export const PANO_EYE_HEIGHT = 1.65

export const PANO_WIDTH = 4000
export const PANO_HEIGHT = 2000

/** Each face of the cube the panorama is stitched from. 1024 keeps the four
 *  walls crisp at 4000 across without asking for a texture a phone may not
 *  grant. */
const FACE_SIZE = 1024

/**
 * Cube face to equirectangular.
 *
 * For each pixel of the output, the UV becomes a longitude and a latitude,
 * that pair becomes a direction on the unit sphere, and the direction samples
 * the cube. Longitude runs from -PI to PI across the image, latitude from
 * +PI/2 at the top to -PI/2 at the bottom, which is the convention every 360
 * viewer assumes.
 */
const EQUIRECT_FRAGMENT = /* glsl */`
  uniform samplerCube cube;
  varying vec2 vUv;
  #define PI 3.141592653589793
  void main() {
    float lon = (vUv.x - 0.5) * 2.0 * PI;
    float lat = (vUv.y - 0.5) * PI;
    vec3 dir = vec3(
      cos(lat) * sin(lon),
      sin(lat),
      cos(lat) * cos(lon)
    );
    gl_FragColor = textureCube(cube, dir);
  }
`

const EQUIRECT_VERTEX = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

/**
 * The largest equirectangular image this GPU will render, at 2:1.
 *
 * 4000 x 2000 is what we ask for; a device whose maximum texture is 2048 — and
 * some phones' is — would fail the allocation outright, so it takes what it
 * can get instead of nothing.
 */
export function panoramaSizeFor(maxTexture: number): { width: number; height: number } {
  const width = Math.min(PANO_WIDTH, Math.max(1024, maxTexture))
  return { width, height: width / 2 }
}

/**
 * Renders the scene as an equirectangular panorama from `position`.
 *
 * Returns the pixels bottom-up, as WebGL hands them over — the caller flips
 * them into an image.
 */
export function renderPanorama(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  position: THREE.Vector3,
  size: { width: number; height: number },
): { pixels: Uint8Array; width: number; height: number } {
  const cubeTarget = new THREE.WebGLCubeRenderTarget(FACE_SIZE, {
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    colorSpace: THREE.SRGBColorSpace,
  })
  const cubeCamera = new THREE.CubeCamera(0.05, 100, cubeTarget)
  cubeCamera.position.copy(position)

  const target = new THREE.WebGLRenderTarget(size.width, size.height, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    colorSpace: THREE.SRGBColorSpace,
  })

  const quadScene = new THREE.Scene()
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const material = new THREE.ShaderMaterial({
    uniforms: { cube: { value: cubeTarget.texture } },
    vertexShader: EQUIRECT_VERTEX,
    fragmentShader: EQUIRECT_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  })
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
  quadScene.add(quad)

  const previousTarget = renderer.getRenderTarget()
  try {
    cubeCamera.update(renderer, scene)
    renderer.setRenderTarget(target)
    renderer.render(quadScene, quadCamera)

    const pixels = new Uint8Array(size.width * size.height * 4)
    renderer.readRenderTargetPixels(target, 0, 0, size.width, size.height, pixels)
    return { pixels, width: size.width, height: size.height }
  } finally {
    renderer.setRenderTarget(previousTarget)
    quad.geometry.dispose()
    material.dispose()
    target.dispose()
    cubeTarget.dispose()
  }
}

/**
 * WebGL reads a framebuffer from the bottom row up; an image goes top row
 * down. Flipping is the whole difference between a panorama and an upside-down
 * one — floor in the sky.
 *
 * Returns the rows, not an ImageData: the pixels are the part worth checking,
 * and ImageData is a browser type the tests have no business needing.
 */
export function flipRows(
  pixels: Uint8Array,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length)
  const rowBytes = width * 4
  for (let y = 0; y < height; y++) {
    const from = y * rowBytes
    const to = (height - 1 - y) * rowBytes
    out.set(pixels.subarray(from, from + rowBytes), to)
  }
  return out
}
