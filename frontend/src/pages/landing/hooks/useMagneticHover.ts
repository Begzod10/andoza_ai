import { useEffect, useRef } from "react";

const DEFAULT_RADIUS = 140;
const DEFAULT_STRENGTH = 20;

// Nudges an element toward the cursor whenever the pointer comes within
// `radius` px, easing back to rest once it leaves — a "magnetic" object.
// Tracks mousemove on window (cheap: a handful of these on a page, each
// doing one getBoundingClientRect + a distance check per event) rather
// than requiring hover directly on the small decorative element itself.
export function useMagneticHover<T extends HTMLElement>(
  radius: number = DEFAULT_RADIUS,
  strength: number = DEFAULT_STRENGTH,
) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    function onMouseMove(e: MouseEvent) {
      const rect = el!.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);

      if (dist < radius) {
        const pull = (1 - dist / radius) * strength;
        const angle = Math.atan2(dy, dx);
        const tx = Math.cos(angle) * pull;
        const ty = Math.sin(angle) * pull;
        const rotate = (dx / radius) * 10;
        el!.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) rotate(${rotate.toFixed(1)}deg)`;
      } else {
        el!.style.transform = "";
      }
    }

    window.addEventListener("mousemove", onMouseMove);
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, [radius, strength]);

  return ref;
}
