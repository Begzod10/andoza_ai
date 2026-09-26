interface GridBackdropProps {
  className?: string;
  lineColor?: string;
  size?: number;
}

// Reuses the graph-paper motif from the AndozaAI pitch deck so the public
// site and the investor materials share one visual signature.
export function GridBackdrop({
  className = "",
  lineColor = "rgba(255,255,255,0.07)",
  size = 40,
}: GridBackdropProps) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 ${className}`}
      style={{
        backgroundImage: `linear-gradient(${lineColor} 1px, transparent 1px), linear-gradient(90deg, ${lineColor} 1px, transparent 1px)`,
        backgroundSize: `${size}px ${size}px`,
      }}
    />
  );
}
