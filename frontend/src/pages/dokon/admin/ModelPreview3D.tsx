import { Component, Suspense, useEffect, useMemo, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, Center, OrbitControls, useGLTF } from "@react-three/drei";

interface BoundaryState {
  failed: boolean;
}

/** A broken/corrupt .glb throws inside useGLTF's suspense — without this the
 * whole dialog would crash instead of showing a friendly message. Keyed by
 * blob URL in the parent so picking a different file resets it. */
class PreviewErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("[ModelPreview3D] failed to load .glb preview:", error);
  }

  render() {
    if (this.state.failed) {
      return (
        <p className="text-xs text-neutral-400 text-center px-4">
          Modelni ko'rib bo'lmadi — fayl buzilgan bo'lishi mumkin
        </p>
      );
    }
    return this.props.children;
  }
}

function GltfModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

/**
 * Live rotate-and-inspect preview of a `.glb` the admin just picked in the
 * upload form — before this, the only feedback was the raw file name, so
 * there was no way to catch a wrong file or a broken export before uploading.
 */
export function ModelPreview3D({ file }: { file: File | null }) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  if (!url) return null;

  return (
    <div className="w-full h-48 rounded-lg border border-neutral-200 bg-neutral-50 overflow-hidden">
      {/* Suspense must live INSIDE Canvas — R3F's render tree is separate
       * from the DOM tree, so a boundary outside Canvas can't catch a
       * suspension from useGLTF happening inside it. fallback={null} means
       * a blank canvas while loading, same as SafeEnvironment.tsx. */}
      <PreviewErrorBoundary key={url}>
        <Canvas camera={{ fov: 40 }} dpr={[1, 1.5]}>
          <ambientLight intensity={0.7} />
          <directionalLight position={[3, 5, 2]} intensity={1.1} />
          <Suspense fallback={null}>
            <Bounds fit clip observe margin={1.2}>
              <Center>
                <GltfModel url={url} />
              </Center>
            </Bounds>
          </Suspense>
          <OrbitControls enablePan={false} makeDefault />
        </Canvas>
      </PreviewErrorBoundary>
    </div>
  );
}
