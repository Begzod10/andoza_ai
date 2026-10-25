import { useEffect, useState } from "react";
import { useEmbeddedApp } from "@/lib/embedded";

/** A phone-width window: Tailwind's `sm` breakpoint (640px) and below. */
export const COMPACT_QUERY = "(max-width: 639px)";

function matchesCompact(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(COMPACT_QUERY).matches
    : false;
}

/**
 * The studio's small-screen layout: inside the native app, or in a phone's
 * browser. The 3D view then keeps the screen — the header floats over it,
 * the smeta is a ⋮ menu row and the smeta page drops its title row. A wider
 * browser keeps the full header.
 */
export function useCompactStudio(): boolean {
  const embedded = useEmbeddedApp();
  const [narrow, setNarrow] = useState(matchesCompact);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(COMPACT_QUERY);
    const onChange = () => setNarrow(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return embedded || narrow;
}
