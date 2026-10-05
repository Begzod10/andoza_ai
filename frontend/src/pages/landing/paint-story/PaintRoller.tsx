import { useId } from "react";

/**
 * PaintRoller — stylised roller: blue drum, metal arm, dark handle.
 *
 * The drum's centre (48,150 in the 260×330 art box) is the point that travels
 * along the route; drum height (280 units) == band thickness == `--roller-size`.
 * The arm+handle live in `[data-roller-arm]` and are mirrored (scaleX) when the
 * direction changes, so the drum never goes edge-on. Replace the art freely —
 * just keep `data-roller`, `data-roller-arm` and the 48/150 pivot.
 */
export default function PaintRoller() {
  const uid = useId().replace(/:/g, "");
  return (
    <div className="paint-roller" data-roller aria-hidden>
      <svg viewBox="0 0 260 330" width="100%" height="100%" overflow="visible">
        <defs>
          <linearGradient id={`shade-${uid}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#000" stopOpacity="0.42" />
            <stop offset="0.28" stopColor="#fff" stopOpacity="0.34" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.4" />
          </linearGradient>
          <pattern id={`fuzz-${uid}`} width="56" height="5" patternUnits="userSpaceOnUse">
            <line x1="0" y1="2.5" x2="56" y2="2.5" stroke="#fff" strokeOpacity="0.1" strokeWidth="1" />
          </pattern>
        </defs>

        {/* arm + handle (mirrored around the drum axis x=48 when direction flips) */}
        <g data-roller-arm>
          <path d="M76 150 H116 Q134 150 142 168 L160 214" fill="none" stroke="#8f99ab" strokeWidth="6" strokeLinecap="round" />
          <path d="M76 148.5 H116 Q133 148.5 140.5 166 L158 211" fill="none" stroke="#e9eef6" strokeOpacity="0.8" strokeWidth="1.6" strokeLinecap="round" />
          <rect x="74" y="140" width="10" height="20" rx="3" fill="#a9b3c4" />
          <g transform="translate(160 214) rotate(24)">
            <rect x="-10" y="-4" width="20" height="116" rx="10" fill="#171c28" />
            <rect x="-10" y="-4" width="20" height="116" rx="10" fill="none" stroke="#fff" strokeOpacity="0.1" />
            {[16, 34, 52, 70, 88].map((y) => (
              <line key={y} x1="-10" x2="10" y1={y} y2={y} stroke="#2c3447" strokeWidth="2" />
            ))}
          </g>
        </g>

        {/* drum */}
        <g>
          <rect x="20" y="10" width="56" height="280" rx="10" style={{ fill: "var(--paint-color)" }} />
          <rect x="20" y="10" width="56" height="280" rx="10" fill={`url(#fuzz-${uid})`} />
          <rect x="20" y="10" width="56" height="280" rx="10" fill={`url(#shade-${uid})`} />
          <rect x="20" y="10" width="56" height="13" rx="6" fill="#0a1a45" fillOpacity="0.4" />
          <rect x="20" y="277" width="56" height="13" rx="6" fill="#0a1a45" fillOpacity="0.4" />
        </g>
      </svg>
    </div>
  );
}
