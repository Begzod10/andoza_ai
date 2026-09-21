import type { LucideIcon } from "lucide-react";
import { useMagneticHover } from "./hooks/useMagneticHover";

interface FloatingObjectProps {
  icon: LucideIcon;
  /** Size + position utility classes, applied to the outer (idle-float) wrapper. */
  className: string;
  /** Stagger the idle float animation so scattered objects don't bob in sync. */
  floatDelayed?: boolean;
  tint?: "orange" | "primary";
}

// Decorative renovation-themed icon scattered across the light sections —
// drifts gently on its own, and leans toward the cursor when it passes
// nearby (see useMagneticHover). Split into two nested elements because
// both effects animate `transform`: the outer div owns the idle CSS
// keyframe float, the inner div owns the cursor-driven inline-style
// transform — a CSS animation always wins over inline style on the same
// element/property, so combining them on one node would silently drop
// the magnetic effect. Purely decorative: aria-hidden, never blocks
// clicks on the real content underneath.
export function FloatingObject({
  icon: Icon,
  className,
  floatDelayed = false,
  tint = "primary",
}: FloatingObjectProps) {
  const ref = useMagneticHover<HTMLDivElement>();

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute ${floatDelayed ? "landing-float-delayed" : "landing-float"} ${className}`}
    >
      <div
        ref={ref}
        className={`landing-magnetic w-full h-full rounded-2xl flex items-center justify-center shadow-lg ${
          tint === "orange" ? "bg-orange-tint" : "bg-primary-tint"
        }`}
      >
        <Icon className={`w-1/2 h-1/2 ${tint === "orange" ? "text-orange-cta" : "text-primary"}`} />
      </div>
    </div>
  );
}
