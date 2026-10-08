/**
 * RegisterBackground — the renovation photo behind the auth card.
 *
 * A full-bleed cover photo (public/register-bg.webp) with a subtle pointer
 * parallax (smoothed by a spring, slightly over-scaled so edges never show) and
 * a soft scrim that keeps the card readable. Disabled for reduced motion.
 */
import { useEffect } from "react";
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from "framer-motion";
import { useThemeStore } from "@/store/themeStore";

export default function RegisterBackground() {
  const reduce = useReducedMotion();
  const night = useThemeStore((s) => s.theme) === "night";
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 55, damping: 18, mass: 0.7 });
  const sy = useSpring(py, { stiffness: 55, damping: 18, mass: 0.7 });

  useEffect(() => {
    if (reduce) return;
    function onMove(e: PointerEvent) {
      px.set((e.clientX / window.innerWidth) * 2 - 1);
      py.set((e.clientY / window.innerHeight) * 2 - 1);
    }
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduce, px, py]);

  const x = useTransform(sx, [-1, 1], [16, -16]);
  const y = useTransform(sy, [-1, 1], [12, -12]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <motion.div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          x,
          y,
          scale: 1.08,
          backgroundImage: "url('/register-bg.webp')",
        }}
      />
      {/* soft scrim — keeps the card and brand legible: bright by day, deep indigo by night */}
      <div
        className="absolute inset-0"
        style={{
          background: night
            ? "radial-gradient(70% 60% at 50% 50%, rgba(29,26,46,0.72) 0%, rgba(29,26,46,0.82) 55%, rgba(29,26,46,0.92) 100%)"
            : "radial-gradient(70% 60% at 50% 50%, rgba(247,250,255,0.55) 0%, rgba(230,240,252,0.25) 45%, rgba(210,228,248,0.12) 100%)",
        }}
      />
    </div>
  );
}
