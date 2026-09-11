/**
 * Ambient 3D living-room scene behind the login card.
 *
 * Design handoff: a looping, slowly-swaying low-poly room (no textures/
 * models — plain primitives + MeshStandardMaterial), with the whole room
 * tilting toward the pointer on desktop and device tilt on mobile. Ported
 * from the handoff's raw-three.js reference into this app's actual stack
 * (@react-three/fiber + drei), matching its numbers closely rather than the
 * reference file's imperative API.
 *
 * Purely decorative: a WebGL failure here must never block the login form,
 * so failures are swallowed to a blank background rather than shown.
 */
import * as React from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

// ─── Small error boundary — decorative only, never surface a failure ──────

class SilentCanvasBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: Error) {
    console.error("[login] 3D background failed:", err);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// ─── Shared materials (created once per mount, not per render) ────────────

function useRoomMaterials() {
  return React.useMemo(
    () => ({
      floor: new THREE.MeshStandardMaterial({ color: "#dac9a8", roughness: 0.9 }),
      rug: new THREE.MeshStandardMaterial({ color: "#d9622b", roughness: 1 }),
      sofa: new THREE.MeshStandardMaterial({ color: "#2f52c4", roughness: 0.85 }),
      armchair: new THREE.MeshStandardMaterial({ color: "#c75d3a", roughness: 0.85 }),
      cushion: new THREE.MeshStandardMaterial({ color: "#f9a13a", roughness: 0.92 }),
      leg: new THREE.MeshStandardMaterial({ color: "#3a2f28", roughness: 0.35, metalness: 0.1 }),
      wood: new THREE.MeshStandardMaterial({ color: "#8a6a4a", roughness: 0.4, metalness: 0.05 }),
      dark: new THREE.MeshStandardMaterial({ color: "#2b2f36", roughness: 0.4, metalness: 0.2 }),
      shelf: new THREE.MeshStandardMaterial({ color: "#d8d2c4", roughness: 0.55, metalness: 0.05 }),
      foliage: new THREE.MeshStandardMaterial({ color: "#2f8f5b", roughness: 0.85 }),
      pot: new THREE.MeshStandardMaterial({ color: "#c75d3a", roughness: 0.8 }),
      glow: new THREE.MeshStandardMaterial({
        color: "#ffce7a", emissive: "#ffb347", emissiveIntensity: 0.5, roughness: 0.4,
      }),
      glowShade: new THREE.MeshStandardMaterial({
        color: "#ffce7a", emissive: "#ffb347", emissiveIntensity: 0.4, roughness: 0.6, side: THREE.DoubleSide,
      }),
      mirrorGlass: new THREE.MeshStandardMaterial({ color: "#cfd8e6", metalness: 0.7, roughness: 0.08 }),
      screen: new THREE.MeshStandardMaterial({ color: "#1c1f26", roughness: 0.15, metalness: 0.3 }),
      vase: new THREE.MeshStandardMaterial({ color: "#3b7fff", roughness: 0.3, metalness: 0.1 }),
    }),
    [],
  );
}

const BOOK_COLORS = ["#1e40af", "#f97316", "#10b981", "#d9622b", "#3b7fff", "#2b2f36"];
const HOOK_COLORS = ["#f97316", "#3b7fff", "#2b2f36"];

// ─── Furniture pieces ───────────────────────────────────────────────────────

function Sofa({ mats }: { mats: ReturnType<typeof useRoomMaterials> }) {
  const ref = React.useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = Math.sin(clock.elapsedTime * 0.4 + 1) * 0.015;
  });
  return (
    <group position={[0.6, 0, -1.6]} ref={ref} name="sofa">
      <mesh material={mats.sofa} position={[0, -0.65, 0]}><boxGeometry args={[3, 0.6, 1.1]} /></mesh>
      <mesh material={mats.sofa} position={[0, -0.15, -0.42]}><boxGeometry args={[3, 0.7, 0.25]} /></mesh>
      <mesh material={mats.sofa} position={[-1.45, -0.15, 0]}><boxGeometry args={[0.25, 0.7, 1.1]} /></mesh>
      <mesh material={mats.sofa} position={[1.45, -0.15, 0]}><boxGeometry args={[0.25, 0.7, 1.1]} /></mesh>
      <mesh material={mats.leg} position={[-1.3, -0.98, -0.72]}><cylinderGeometry args={[0.04, 0.04, 0.15, 12]} /></mesh>
      <mesh material={mats.leg} position={[1.3, -0.98, -0.72]}><cylinderGeometry args={[0.04, 0.04, 0.15, 12]} /></mesh>
      <mesh material={mats.cushion} position={[-0.9, -0.28, -0.2]} rotation={[0, 0, 0.15]}><boxGeometry args={[0.4, 0.4, 0.15]} /></mesh>
      <mesh material={mats.cushion} position={[-0.35, -0.28, -0.2]} rotation={[0, 0, -0.1]}><boxGeometry args={[0.4, 0.4, 0.15]} /></mesh>
    </group>
  );
}

function Armchair({ mats }: { mats: ReturnType<typeof useRoomMaterials> }) {
  return (
    <group position={[-1.5, 0, 0.6]} rotation={[0, -0.6, 0]} name="armchair">
      <mesh material={mats.armchair} position={[0, -0.68, 0]}><boxGeometry args={[1.0, 0.55, 1.0]} /></mesh>
      <mesh material={mats.armchair} position={[0, -0.16, -0.4]}><boxGeometry args={[1.0, 0.75, 0.22]} /></mesh>
      <mesh material={mats.armchair} position={[-0.45, -0.3, 0]}><boxGeometry args={[0.2, 0.5, 1.0]} /></mesh>
      <mesh material={mats.armchair} position={[0.45, -0.3, 0]}><boxGeometry args={[0.2, 0.5, 1.0]} /></mesh>
    </group>
  );
}

function Tables({ mats }: { mats: ReturnType<typeof useRoomMaterials> }) {
  return (
    <group name="tables">
      <mesh material={mats.wood} position={[0.3, -0.55, 0.9]}><cylinderGeometry args={[0.7, 0.7, 0.08, 48]} /></mesh>
      <mesh material={mats.wood} position={[0.3, -0.85, 0.9]}><cylinderGeometry args={[0.06, 0.06, 0.55, 24]} /></mesh>
      <mesh material={mats.wood} position={[-2.5, -0.72, 0.9]}><cylinderGeometry args={[0.28, 0.28, 0.06, 28]} /></mesh>
      <mesh material={mats.wood} position={[-2.5, -0.88, 0.9]}><cylinderGeometry args={[0.04, 0.04, 0.3, 16]} /></mesh>
      <mesh material={mats.vase} position={[-2.5, -0.58, 0.9]}><cylinderGeometry args={[0.06, 0.09, 0.22, 20]} /></mesh>
    </group>
  );
}

function FloorLamp({ mats }: { mats: ReturnType<typeof useRoomMaterials> }) {
  const ref = React.useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = Math.sin(clock.elapsedTime * 0.6) * 0.02;
  });
  return (
    <group position={[-2.3, 0, -1.2]} ref={ref} name="floor-lamp">
      <mesh material={mats.dark} position={[0, -0.97, 0]}><cylinderGeometry args={[0.14, 0.16, 0.05, 24]} /></mesh>
      <mesh material={mats.dark} position={[0, -0.2, 0]}><cylinderGeometry args={[0.03, 0.03, 1.6, 20]} /></mesh>
      <mesh material={mats.glowShade} position={[0, 0.65, 0]}><coneGeometry args={[0.28, 0.32, 32, 1, true]} /></mesh>
      <pointLight color="#ffb347" intensity={0.6} distance={3} position={[0, 0.5, 0]} />
    </group>
  );
}

function Plant({
  mats, position, scale = 1,
}: { mats: ReturnType<typeof useRoomMaterials>; position: [number, number, number]; scale?: number }) {
  const ref = React.useRef<THREE.Group>(null);
  const phase = React.useRef(Math.random() * Math.PI * 2).current;
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.25 + phase) * 0.08;
  });
  return (
    <group position={position} scale={scale} ref={ref} name="plant">
      <mesh material={mats.pot} position={[0, -0.84, 0]}><cylinderGeometry args={[0.22, 0.18, 0.32, 24]} /></mesh>
      <mesh material={mats.foliage} position={[0, -0.32, 0]} scale={[0.8, 1.3, 0.8]}><sphereGeometry args={[0.32, 20, 20]} /></mesh>
      <mesh material={mats.foliage} position={[0.18, -0.1, 0.05]}><sphereGeometry args={[0.22, 20, 20]} /></mesh>
      <mesh material={mats.foliage} position={[-0.2, -0.05, -0.05]}><sphereGeometry args={[0.2, 20, 20]} /></mesh>
    </group>
  );
}

function Bookshelf({ mats }: { mats: ReturnType<typeof useRoomMaterials> }) {
  const books = React.useMemo(() => {
    let bx = -0.72;
    return Array.from({ length: 7 }, (_, i) => {
      const h = 0.28 + (i % 3) * 0.06;
      const w = 0.07 + (i % 2) * 0.02;
      const x = bx;
      bx += w + 0.02;
      return { x, w, h, color: BOOK_COLORS[i % BOOK_COLORS.length] };
    });
  }, []);
  return (
    <group position={[-3.55, 0.05, -0.4]} name="bookshelf">
      <mesh material={mats.shelf} position={[-0.85, 0, 0]}><boxGeometry args={[0.05, 1.3, 0.32]} /></mesh>
      <mesh material={mats.shelf} position={[0.85, 0, 0]}><boxGeometry args={[0.05, 1.3, 0.32]} /></mesh>
      {[-0.62, -0.1, 0.42].map((y) => (
        <mesh key={y} material={mats.shelf} position={[0, y, 0]}><boxGeometry args={[1.7, 0.05, 0.32]} /></mesh>
      ))}
      {books.map((b) => (
        <mesh key={b.x} position={[b.x, -0.62 + b.h / 2 + 0.03, 0]}>
          <boxGeometry args={[b.w, b.h, 0.24]} />
          <meshStandardMaterial color={b.color} roughness={0.55} />
        </mesh>
      ))}
      <mesh position={[-0.5, -0.1 + 0.19, 0]}>
        <boxGeometry args={[0.18, 0.28, 0.18]} />
        <meshStandardMaterial color="#10b981" roughness={0.5} />
      </mesh>
      <mesh position={[0.4, -0.1 + 0.12, 0]}>
        <sphereGeometry args={[0.12, 20, 20]} />
        <meshStandardMaterial color="#d97757" roughness={0.5} />
      </mesh>
    </group>
  );
}

function TvConsole({ mats }: { mats: ReturnType<typeof useRoomMaterials> }) {
  return (
    <group name="tv-console">
      <mesh material={mats.wood} position={[-0.6, -0.82, -2.2]}><boxGeometry args={[1.6, 0.35, 0.4]} /></mesh>
      <mesh material={mats.screen} position={[-0.6, -0.25, -2.32]}><boxGeometry args={[1.3, 0.75, 0.04]} /></mesh>
    </group>
  );
}

function Mirror({ mats }: { mats: ReturnType<typeof useRoomMaterials> }) {
  return (
    <group position={[2.9, -0.15, -0.6]} rotation={[0, 0.5, 0]} name="mirror">
      <mesh material={mats.dark}><boxGeometry args={[0.6, 1.3, 0.05]} /></mesh>
      <mesh material={mats.mirrorGlass} position={[0, 0, 0.03]}><planeGeometry args={[0.5, 1.2]} /></mesh>
    </group>
  );
}

function CoatRack() {
  const rackMat = React.useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#5a4632", roughness: 0.4, metalness: 0.05 }),
    [],
  );
  return (
    <group name="coat-rack">
      <mesh material={rackMat} position={[-1.9, 0, -2.3]}><cylinderGeometry args={[0.03, 0.03, 1.8, 16]} /></mesh>
      <mesh material={rackMat} position={[-1.9, -0.88, -2.3]}><cylinderGeometry args={[0.22, 0.22, 0.04, 20]} /></mesh>
      {HOOK_COLORS.map((c, i) => (
        <mesh key={c} position={[-1.9 + (i - 1) * 0.14, 0.85, -2.3]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.05, 0.015, 10, 20]} />
          <meshStandardMaterial color={c} metalness={0.3} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function Pendant() {
  const ref = React.useRef<THREE.Group>(null);
  return (
    <group position={[-3.0, 1.55, -2.0]} ref={ref} name="pendant">
      <mesh position={[0, 0.25, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.5, 8]} />
        <meshStandardMaterial color="#2b2f36" />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.16, 24, 24]} />
        <meshStandardMaterial color="#ffce7a" emissive="#ffb347" emissiveIntensity={0.5} roughness={0.4} />
      </mesh>
      <pointLight color="#ffb347" intensity={0.5} distance={3} />
    </group>
  );
}

// ─── The room: everything above, plus the sway/parallax animation ─────────

function Room() {
  const mats = useRoomMaterials();
  const groupRef = React.useRef<THREE.Group>(null);

  // Mutable targets, updated by pointer/orientation listeners and read every
  // frame — refs, not state, so a mouse move never triggers a React render.
  const targetYExtra = React.useRef(0);
  const targetX = React.useRef(0);
  const baseY = 0.35;

  React.useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      targetYExtra.current = nx * 0.35;
      targetX.current = ny * 0.12;
    }
    window.addEventListener("pointermove", onPointerMove);

    function onOrientation(e: DeviceOrientationEvent) {
      if (e.gamma == null) return;
      const gamma = Math.max(-30, Math.min(30, e.gamma)) / 30;
      const beta = Math.max(-20, Math.min(20, (e.beta ?? 0) - 45)) / 20;
      targetYExtra.current = gamma * 0.35;
      targetX.current = beta * 0.12;
    }
    let orientationBound = false;
    function bindOrientation() {
      if (orientationBound) return;
      orientationBound = true;
      window.addEventListener("deviceorientation", onOrientation);
    }
    // iOS requires a user gesture before device-motion permission can be
    // requested — bind it on the first tap rather than on load.
    const DOE = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    let requestOnce: (() => void) | null = null;
    if (typeof DOE?.requestPermission === "function") {
      requestOnce = () => {
        DOE.requestPermission!().then((r) => { if (r === "granted") bindOrientation(); }).catch(() => {});
      };
      window.addEventListener("touchstart", requestOnce, { once: true });
    } else if (typeof DeviceOrientationEvent !== "undefined") {
      bindOrientation();
    }

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("deviceorientation", onOrientation);
      if (requestOnce) window.removeEventListener("touchstart", requestOnce);
    };
  }, []);

  useFrame(({ clock }) => {
    const g = groupRef.current;
    if (!g) return;
    const t = clock.elapsedTime;
    const sway = Math.sin(t * 0.12) * 0.15;
    g.rotation.y += (baseY + sway + targetYExtra.current - g.rotation.y) * 0.04;
    g.rotation.x += (targetX.current * 0.5 - g.rotation.x) * 0.04;
  });

  return (
    <group ref={groupRef} position={[0, -0.3, 0]}>
      <mesh material={mats.floor} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]} receiveShadow>
        <circleGeometry args={[6, 64]} />
      </mesh>
      <mesh material={mats.rug} rotation={[-Math.PI / 2, 0, 0]} position={[0.3, -0.99, 0.3]} receiveShadow>
        <circleGeometry args={[2.1, 48]} />
      </mesh>

      {/* Everything else casts + receives shadows (shadows set via defaults below) */}
      <group>
        <Pendant />
        <TvConsole mats={mats} />
        <Mirror mats={mats} />
        <CoatRack />
        <Sofa mats={mats} />
        <Armchair mats={mats} />
        <Tables mats={mats} />
        <FloorLamp mats={mats} />
        <Plant mats={mats} position={[2.5, 0, -1.9]} />
        <Plant mats={mats} position={[-3.55, -0.35, -2.2]} scale={0.6} />
        <Bookshelf mats={mats} />
      </group>
    </group>
  );
}

/** Casts/receives shadows on every mesh under it except the floor/rug (which
 * set their own receiveShadow directly above and never cast). */
function ShadowCaster({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<THREE.Group>(null);
  React.useEffect(() => {
    ref.current?.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
  }, []);
  return <group ref={ref}>{children}</group>;
}

function Scene() {
  return (
    <>
      <fog attach="fog" args={["#f9f9f9", 7, 15]} />
      <ambientLight color="#fff4e8" intensity={0.55} />
      <directionalLight
        color="#ffe4c4"
        intensity={1.1}
        position={[4, 6, 5]}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-camera-near={1}
        shadow-camera-far={16}
        shadow-bias={-0.0015}
      />
      <directionalLight color="#9fc4ff" intensity={0.4} position={[-5, 3, -3]} />
      <ShadowCaster>
        <Room />
      </ShadowCaster>
    </>
  );
}

export function LoginBackground() {
  return (
    <div className="absolute inset-0 z-0" aria-hidden="true">
      <SilentCanvasBoundary>
        <Canvas
          shadows="soft"
          dpr={[1, 2]}
          camera={{ position: [0, 2.3, 8.5], fov: 38, near: 0.1, far: 50 }}
          gl={{
            antialias: true,
            alpha: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.15,
            outputColorSpace: THREE.SRGBColorSpace,
          }}
          onCreated={({ camera }) => camera.lookAt(0, 0.4, 0)}
        >
          <Scene />
        </Canvas>
      </SilentCanvasBoundary>
    </div>
  );
}
