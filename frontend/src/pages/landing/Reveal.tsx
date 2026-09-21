import type { ReactNode, Ref } from "react";
import { useInView } from "./hooks/useInView";

interface RevealProps {
  children: ReactNode;
  delayMs?: number;
  className?: string;
  /** Root element tag — use "li" inside an <ol>/<ul> to keep valid HTML. */
  as?: "div" | "li";
}

// Fades + slides a section's children in once they scroll into view.
export function Reveal({ children, delayMs = 0, className = "", as = "div" }: RevealProps) {
  // The DOM node always matches `as`; the union ref type just needs a single
  // narrowing cast per branch below to satisfy each intrinsic element's prop.
  const { ref, isVisible } = useInView<HTMLLIElement | HTMLDivElement>();
  const revealClassName = `landing-reveal ${isVisible ? "is-visible" : ""} ${className}`;
  const style = { transitionDelay: isVisible ? `${delayMs}ms` : "0ms" };

  if (as === "li") {
    return (
      <li ref={ref as Ref<HTMLLIElement>} className={revealClassName} style={style}>
        {children}
      </li>
    );
  }

  return (
    <div ref={ref as Ref<HTMLDivElement>} className={revealClassName} style={style}>
      {children}
    </div>
  );
}
