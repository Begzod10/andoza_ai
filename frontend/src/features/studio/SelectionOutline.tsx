import { useEffect, useMemo } from "react"
import * as THREE from "three"

/**
 * A blue line around a selected model, following its actual silhouette.
 *
 * Selection used to be a wireframe box round the model's bounding volume,
 * which says where the model roughly is but not what it is: a chair and a rug
 * of the same footprint got the same drawing, and the box floated well clear
 * of anything slender.
 *
 * This is the inverted-hull outline: the model drawn a second time with its
 * surface pushed out along its own normals and only the BACK faces kept. The
 * model itself then covers all of it except the rim that pokes out past the
 * silhouette, which reads as a line traced round the shape. It costs one extra
 * draw of an already-loaded geometry and needs no post-processing pass.
 */
const OUTLINE_COLOR = new THREE.Color('#2563EB')
/** World-space width of the line, metres. */
const OUTLINE_M = 0.012

function outlineMaterial(thickness: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uThickness: { value: thickness }, uColor: { value: OUTLINE_COLOR } },
    vertexShader: `
      uniform float uThickness;
      void main() {
        // Along the normal, in object space: a uniform push, so the line keeps
        // its width round a chair leg as well as round a sofa.
        vec3 pushed = position + normal * uThickness;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pushed, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0); }
    `,
    side: THREE.BackSide,
  })
}

export function SelectionOutline({ object, scale, position, rotationY }: {
  /** The model being outlined. Its geometries are shared, not copied. */
  object: THREE.Object3D
  /** The model's own uniform scale, so the line can be kept a fixed width in
   *  the room rather than growing with the furniture. */
  scale: number
  position: [number, number, number]
  rotationY: number
}) {
  const { hull, material } = useMemo(() => {
    const material = outlineMaterial(OUTLINE_M / (scale || 1))
    // clone() shares geometry — only the scene-graph nodes are new, and the
    // material is replaced per node, so the model itself is untouched.
    const hull = object.clone(true)
    hull.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = material
      // The outline is a drawing, not a thing in the room: it must not take
      // pointer events off the model or throw a second shadow of its own.
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.raycast = () => {}
    })
    return { hull, material }
  }, [object, scale])

  useEffect(() => () => { material.dispose() }, [material])

  return (
    <primitive object={hull} position={position} rotation={[0, rotationY, 0]} scale={scale} />
  )
}
