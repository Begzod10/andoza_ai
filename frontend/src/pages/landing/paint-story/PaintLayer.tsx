import { useId } from "react";

/**
 * PaintLayer — the opaque blue paint that covers the WALL.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * SECTION 4 — PAINT REVEAL
 * A full-stage blue rectangle is hidden behind an SVG <mask>. The mask contains
 * ONE stroked path (the roller route, stroke-width = roller length). The timeline
 * grows that stroke with stroke-dashoffset, so the paint appears exactly behind
 * the roller instead of a big rectangle sliding in.
 *   • butt caps  → the leading edge is a clean vertical edge at the roller
 *   • round joins→ smooth turns
 *   • feDisplacementMap on the mask path → the slightly imperfect, rolled edge.
 *     Strength = `--edge-roughness` (0 disables the filter; it is 0 on mobile).
 * The cards sit ABOVE this layer, so the wall paint is hidden under them —
 * what you see ON a card is the separate translucent film (see FlashCard.tsx).
 * ════════════════════════════════════════════════════════════════════════════
 */
export default function PaintLayer({ staticMode = false }: { staticMode?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const maskId = `ps-mask-${uid}`;
  const filterId = `ps-rough-${uid}`;

  return (
    <svg className="paint-layer" aria-hidden preserveAspectRatio="none" data-paint-layer>
      <defs>
        <filter id={filterId} data-rough-filter filterUnits="userSpaceOnUse" x="0" y="0" width="1" height="1">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.04" numOctaves={1} seed={7} result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G" data-rough-map />
        </filter>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="-200" y="-200" width="10000" height="10000">
          <path
            data-paint-path
            data-masked
            fill="none"
            stroke="#fff"
            strokeLinejoin="round"
            strokeLinecap="butt"
            filter={`url(#${filterId})`}
          />
        </mask>
      </defs>
      <rect
        className="paint-layer__fill"
        x="-200"
        y="-200"
        width="10000"
        height="10000"
        mask={staticMode ? undefined : `url(#${maskId})`}
      />
    </svg>
  );
}
