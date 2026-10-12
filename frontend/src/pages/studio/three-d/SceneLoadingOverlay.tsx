import { useProgress } from "@react-three/drei";

/**
 * Sits over the studio canvas while drei's loaders (models, textures, the
 * environment map) are still fetching. The canvas's own Suspense fallback is
 * empty, so without this the studio showed a black viewport for seconds with
 * nothing saying it was busy. Lives outside <Canvas>: useProgress reads the
 * global three.js loading manager, not the R3F context.
 */
export function SceneLoadingOverlay() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <p
        role="status"
        className="rounded-full bg-black/60 px-4 py-2 text-sm font-semibold text-white shadow-panel backdrop-blur"
      >
        3D sahna yuklanmoqda…{progress >= 1 && ` ${Math.round(progress)}%`}
      </p>
    </div>
  );
}
