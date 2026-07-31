/**
 * 3D bodies for the light fixtures, drawn from the catalog spec.
 *
 * Each fixture is built from primitives rather than a GLB so a new type costs
 * one catalog entry and (at most) one case here — and so the body always
 * matches the settings the user just moved.
 *
 * Emission vs illumination are deliberately separate. Every fixture always
 * shows a lit emissive face (that is what makes it read as "a lamp"), but only
 * a pooled subset carries a real light — see LightEmitters. A scene with
 * fifteen shadow-casting spot lights is a slideshow, and the fifteenth one
 * adds nothing a viewer can see.
 */
import * as THREE from 'three'
import type { PlacedLight } from '@/store/roomStore'
import { lightType, kelvinToHex, type LightType } from '@/lib/lightCatalog'

/** Where a fixture's body sits, in room-centred world metres. */
export interface FixturePose {
  x: number
  y: number
  z: number
  /** Yaw about Y. */
  rot: number
}

/**
 * Resolve a placed light to a world pose. Wall fixtures are pushed onto their
 * wall and turned to face into the room; everything else hangs from the
 * ceiling or stands on the floor at its plan position.
 */
export function fixturePose(
  light: PlacedLight,
  t: LightType,
  roomW: number,
  roomD: number,
  roomH: number,
): FixturePose {
  const x = light.xMm / 1000 - roomW / 2
  const z = light.zMm / 1000 - roomD / 2
  const rot = light.rotation ?? 0

  if (t.mount === 'wall') {
    const h = light.wallHM ?? t.wallHM ?? 1.8
    const inset = t.sizeM.d / 2
    switch (light.wallId ?? 'A') {
      case 'A': return { x, y: h, z: -roomD / 2 + inset, rot: 0 }
      case 'C': return { x, y: h, z: roomD / 2 - inset, rot: Math.PI }
      case 'B': return { x: roomW / 2 - inset, y: h, z, rot: -Math.PI / 2 }
      case 'D': return { x: -roomW / 2 + inset, y: h, z, rot: Math.PI / 2 }
    }
  }

  if (t.mount === 'floor') return { x, y: 0, z, rot }

  // Ceiling, recessed and track fixtures all hang from the ceiling plane.
  const drop = t.mount === 'recessed' ? 0 : (light.dropM ?? t.dropM ?? 0)
  return { x, y: roomH - drop, z, rot }
}

/** Emissive material for the lit face — colour follows the fixture's kelvin. */
function emitterMaterial(hex: string, on: boolean, strength = 1) {
  return (
    <meshStandardMaterial
      color={on ? hex : '#3A3A3A'}
      emissive={on ? hex : '#000000'}
      emissiveIntensity={on ? strength : 0}
      roughness={0.35}
      metalness={0}
      toneMapped={false}
    />
  )
}

const METAL = <meshStandardMaterial color="#BFBBB0" metalness={0.65} roughness={0.3} />
const DARK = <meshStandardMaterial color="#3C3F45" metalness={0.4} roughness={0.5} />

/**
 * One fixture body. Positioned by the caller so the drag handle and the light
 * emitter can share the same pose.
 */
export function LightFixture({ light, on }: { light: PlacedLight; on: boolean }) {
  const t = lightType(light.type)
  const hex = kelvinToHex(light.colorK ?? t.colorK)
  const lit = on && !light.off
  const { w, h } = { w: t.sizeM.w, h: t.sizeM.h }

  switch (t.id) {
    case 'pendant':
      return (
        <group>
          <Cord length={light.dropM ?? t.dropM ?? 0} />
          <mesh position={[0, -h / 2, 0]}>
            <coneGeometry args={[w / 2, h, 24, 1, true]} />
            <meshStandardMaterial color="#2F3338" side={THREE.DoubleSide} roughness={0.5} metalness={0.3} />
          </mesh>
          <mesh position={[0, -h + 0.02, 0]}>
            <sphereGeometry args={[w * 0.18, 16, 12]} />
            {emitterMaterial(hex, lit, 2.2)}
          </mesh>
        </group>
      )

    case 'chandelier': {
      const arms = 6
      return (
        <group>
          <Cord length={light.dropM ?? t.dropM ?? 0} />
          <mesh position={[0, -0.06, 0]}>
            <cylinderGeometry args={[0.05, 0.07, 0.12, 16]} />
            {METAL}
          </mesh>
          {Array.from({ length: arms }, (_, i) => {
            const a = (i / arms) * Math.PI * 2
            const r = w / 2
            return (
              <group key={i} position={[Math.cos(a) * r, -h * 0.55, Math.sin(a) * r]}>
                <mesh position={[0, 0.1, 0]}>
                  <cylinderGeometry args={[0.012, 0.012, 0.2, 8]} />
                  {METAL}
                </mesh>
                <mesh>
                  <sphereGeometry args={[0.05, 14, 10]} />
                  {emitterMaterial(hex, lit, 2)}
                </mesh>
              </group>
            )
          })}
        </group>
      )
    }

    case 'ceiling':
      return (
        <group>
          <mesh position={[0, -h / 2, 0]}>
            <cylinderGeometry args={[w / 2, w / 2 * 0.92, h, 28]} />
            {emitterMaterial(hex, lit, 1.3)}
          </mesh>
          <mesh position={[0, -0.008, 0]}>
            <cylinderGeometry args={[w / 2 * 0.98, w / 2 * 0.98, 0.016, 28]} />
            {METAL}
          </mesh>
        </group>
      )

    case 'downlight':
      return (
        <group>
          <mesh position={[0, -0.012, 0]}>
            <cylinderGeometry args={[w / 2, w / 2, 0.024, 20]} />
            {METAL}
          </mesh>
          <mesh position={[0, -0.026, 0]}>
            <circleGeometry args={[w / 2 * 0.78, 20]} />
            {emitterMaterial(hex, lit, 2.6)}
          </mesh>
        </group>
      )

    case 'led_panel':
      return (
        <group>
          <mesh position={[0, -h / 2, 0]}>
            <boxGeometry args={[t.sizeM.w, h, t.sizeM.d]} />
            {METAL}
          </mesh>
          <mesh position={[0, -h - 0.001, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[t.sizeM.w * 0.94, t.sizeM.d * 0.94]} />
            {emitterMaterial(hex, lit, 1.8)}
          </mesh>
        </group>
      )

    case 'spotlight':
    case 'ies':
      return (
        <group>
          <mesh position={[0, -0.02, 0]}>
            <cylinderGeometry args={[w / 2 * 0.7, w / 2 * 0.7, 0.04, 16]} />
            {METAL}
          </mesh>
          {/* Head tilts on its mount, so the body shows where the beam points */}
          <group position={[0, -0.05, 0]} rotation={[light.tiltRad ?? 0, 0, 0]}>
            <mesh position={[0, -h / 2 + 0.02, 0]}>
              <cylinderGeometry args={[w / 2 * 0.62, w / 2, h * 0.8, 18]} />
              {DARK}
            </mesh>
            <mesh position={[0, -h + 0.03, 0]}>
              <circleGeometry args={[w / 2 * 0.55, 18]} />
              {emitterMaterial(hex, lit, 2.8)}
            </mesh>
          </group>
        </group>
      )

    case 'led_linear':
      return (
        <group rotation={[0, 0, 0]}>
          <mesh position={[0, -h / 2, 0]}>
            <boxGeometry args={[t.sizeM.w, h, t.sizeM.d]} />
            {DARK}
          </mesh>
          <mesh position={[0, -h - 0.001, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[t.sizeM.w * 0.96, t.sizeM.d * 0.7]} />
            {emitterMaterial(hex, lit, 2.2)}
          </mesh>
        </group>
      )

    case 'track':
    case 'led_track': {
      const heads = 4
      const railW = t.sizeM.w
      return (
        <group>
          <mesh position={[0, -0.025, 0]}>
            <boxGeometry args={[railW, 0.05, t.sizeM.d]} />
            {DARK}
          </mesh>
          {Array.from({ length: heads }, (_, i) => {
            const x = -railW / 2 + (railW / (heads - 1)) * i
            return (
              <group key={i} position={[x, -0.06, 0]} rotation={[light.tiltRad ?? 0, 0, 0]}>
                {t.id === 'track' ? (
                  <mesh position={[0, -0.05, 0]}>
                    <cylinderGeometry args={[0.032, 0.042, 0.1, 16]} />
                    {DARK}
                  </mesh>
                ) : (
                  <mesh position={[0, -0.04, 0]}>
                    <boxGeometry args={[0.07, 0.08, 0.07]} />
                    {DARK}
                  </mesh>
                )}
                <mesh position={[0, -0.101, 0]}>
                  <circleGeometry args={[0.026, 14]} />
                  {emitterMaterial(hex, lit, 2.8)}
                </mesh>
              </group>
            )
          })}
        </group>
      )
    }

    case 'bra':
      return (
        <group>
          <mesh position={[0, 0, 0.01]}>
            <boxGeometry args={[w * 0.5, 0.14, 0.02]} />
            {METAL}
          </mesh>
          <mesh position={[0, h * 0.16, t.sizeM.d / 2]}>
            <cylinderGeometry args={[w / 2, w / 2 * 0.8, h * 0.6, 18, 1, true]} />
            <meshStandardMaterial color="#F2EAD9" side={THREE.DoubleSide} roughness={0.75} />
          </mesh>
          <mesh position={[0, h * 0.16, t.sizeM.d / 2]}>
            <sphereGeometry args={[0.035, 14, 10]} />
            {emitterMaterial(hex, lit, 2.2)}
          </mesh>
        </group>
      )

    case 'bath':
      return (
        <group>
          <mesh position={[0, 0, 0.02]}>
            <boxGeometry args={[t.sizeM.w, h, 0.04]} />
            {METAL}
          </mesh>
          <mesh position={[0, 0, 0.045]}>
            <planeGeometry args={[t.sizeM.w * 0.9, h * 0.6]} />
            {emitterMaterial(hex, lit, 2)}
          </mesh>
        </group>
      )

    case 'floor_lamp':
      return (
        <group>
          <mesh position={[0, 0.015, 0]}>
            <cylinderGeometry args={[w / 2 * 0.7, w / 2 * 0.75, 0.03, 24]} />
            {DARK}
          </mesh>
          <mesh position={[0, h / 2, 0]}>
            <cylinderGeometry args={[0.016, 0.016, h, 12]} />
            {METAL}
          </mesh>
          <mesh position={[0, h - 0.12, 0]}>
            <cylinderGeometry args={[w / 2 * 0.85, w / 2, 0.26, 24, 1, true]} />
            <meshStandardMaterial color="#F2EAD9" side={THREE.DoubleSide} roughness={0.8} />
          </mesh>
          <mesh position={[0, h - 0.16, 0]}>
            <sphereGeometry args={[0.05, 14, 10]} />
            {emitterMaterial(hex, lit, 2)}
          </mesh>
        </group>
      )
  }
}

/** Suspension cord for a hanging fixture. */
function Cord({ length }: { length: number }) {
  if (length <= 0.01) return null
  return (
    <mesh position={[0, length / 2, 0]}>
      <cylinderGeometry args={[0.006, 0.006, length, 6]} />
      {DARK}
    </mesh>
  )
}
