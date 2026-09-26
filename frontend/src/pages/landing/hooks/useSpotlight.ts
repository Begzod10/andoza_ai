import { useCallback, useRef } from "react";

// Tracks the cursor position as CSS custom properties on the element, for
// a light that follows the pointer (`.landing-spotlight` reads --spot-x/y).
export function useSpotlight<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  const onMouseMove = useCallback((e: React.MouseEvent<T>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
    el.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
  }, []);

  return { ref, onMouseMove };
}
