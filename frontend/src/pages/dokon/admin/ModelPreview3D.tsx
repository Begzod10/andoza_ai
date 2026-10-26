import { useTranslation } from "react-i18next";
import { Component, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, Center, OrbitControls, useGLTF } from "@react-three/drei";
import { extractSceneInfo } from "@/lib/modelConverter";
import { describeSize, type MeasuredSize } from "@/lib/modelSize";
import { detectModelYaw, type YawGuess } from "@/lib/modelYaw";
import type { FurnitureRole } from "@/lib/furnitureRole";

/** What the preview reads of a model: its size, and which way it faces. */
export type OnMeasured = (size: MeasuredSize | null, front: YawGuess) => void;

const NO_FRONT: YawGuess = { yaw: 0, detected: false };

interface BoundaryState {
  failed: boolean;
}

/** A broken/corrupt .glb throws inside useGLTF's suspense — without this the
 * whole dialog would crash instead of showing a friendly message. Keyed by
 * blob URL in the parent so picking a different file resets it. */
function PreviewFailed() {
  const { t } = useTranslation();
  return <p className="text-xs text-neutral-400 text-center px-4">{t("dokon.model.preview_failed")}</p>;
}

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
      return <PreviewFailed />;
    }
    return this.props.children;
  }
}

function GltfModel({ url, role, onMeasured }: { url: string; role: FurnitureRole | null; onMeasured?: OnMeasured }) {
  const { scene } = useGLTF(url);
  // Measured the way the studio sizes a catalog model (units detected from the geometry), so the
  // numbers stored with it are the numbers it will be drawn at. The size is as the file lies, before
  // the front is turned. A new role (the name or category changed) looks for the front again.
  useEffect(() => {
    if (!onMeasured) return;
    try {
      const { w, d, h } = extractSceneInfo(scene).sizeM;
      const cm = (m: number) => Math.round(m * 1000) / 10;
      onMeasured({ width_cm: cm(w), depth_cm: cm(d), height_cm: cm(h) }, detectModelYaw(scene, role));
    } catch {
      onMeasured(null, NO_FRONT);
    }
  }, [scene, role, onMeasured]);
  return <primitive object={scene} />;
}

/**
 * Live rotate-and-inspect preview of a `.glb` the admin just picked in the
 * upload form — before this, the only feedback was the raw file name, so
 * there was no way to catch a wrong file or a broken export before uploading.
 */
export function ModelPreview3D({
  file,
  role = null,
  onMeasured,
  themed = false,
}: {
  file: File | null;
  /** What the piece is for: only one with a tall back (a bed, a sofa, a chair) has its front looked for. */
  role?: FurnitureRole | null;
  onMeasured?: OnMeasured;
  themed?: boolean;
}) {
  const { t } = useTranslation();
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  const [size, setSize] = useState<MeasuredSize | null>(null);
  const report = useCallback(
    (next: MeasuredSize | null, front: YawGuess) => {
      setSize(next);
      onMeasured?.(next, front);
    },
    [onMeasured],
  );

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  // No file, no size: a size measured from an earlier file must not outlive it.
  useEffect(() => {
    if (!url) report(null, NO_FRONT);
  }, [url, report]);

  if (!url) return null;

  return (
    <div>
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
                <GltfModel url={url} role={role} onMeasured={report} />
              </Center>
            </Bounds>
          </Suspense>
          <OrbitControls enablePan={false} makeDefault />
        </Canvas>
      </PreviewErrorBoundary>
    </div>
    {size && (
      <p className={`mt-1.5 text-xs ${themed ? "text-ink-muted" : "text-neutral-500"}`}>
        {t("dokon.model.measured", { size: describeSize(size) })}
      </p>
    )}
    </div>
  );
}
