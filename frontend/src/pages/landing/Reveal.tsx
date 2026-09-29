import { useEffect, useRef, useState } from "react";

/**
 * Fades + rises its children into view the first time they enter the viewport.
 * Falls back to visible if IntersectionObserver is unavailable.
 */
export default function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  /** delay in seconds before the rise-in animation plays */
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={`${shown ? "animate-rise-in" : "opacity-0"} ${className ?? ""}`}
      style={shown ? { animationDelay: `${delay}s` } : undefined}
    >
      {children}
    </Tag>
  );
}
