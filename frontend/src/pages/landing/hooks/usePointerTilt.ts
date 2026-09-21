import { useCallback, useRef } from "react";

const MAX_TILT_DEG = 8;

// Cursor-follow 3D tilt for the hero mock card — plain CSS perspective/
// rotate, no WebGL, so the landing chunk never pulls in three.js.
export function usePointerTilt<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const prefersReducedMotion = useRef(
    typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const onMouseMove = useCallback((e: React.MouseEvent<T>) => {
    if (prefersReducedMotion.current || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    const rotateX = (-py * MAX_TILT_DEG).toFixed(2);
    const rotateY = (px * MAX_TILT_DEG).toFixed(2);
    ref.current.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  }, []);

  const onMouseLeave = useCallback(() => {
    if (!ref.current) return;
    ref.current.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg)";
  }, []);

  return { ref, onMouseMove, onMouseLeave };
}
