import type { CSSProperties } from "react";
import type { PaintCard } from "./config";

/**
 * FlashCard — one paper card attached to the wall.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * SECTION 3 — CARD APPEARANCE
 * Look (size, radius, shadow, paper) is in paint-story.css (`.pcard*`).
 * Position comes from `--card-N-x / --card-N-y` (centre point, % of the wall).
 * The entrance (scale .94→1, opacity 0→1, small rotation→0) is a tween on the
 * shared scrubbed timeline — see paintStoryTimeline.ts / CARD_ENTER in config.ts.
 *
 * SECTION 5 — PAINT-OVER-CARD TRANSPARENCY
 * The card is NOT simply stacked under the wall paint. Instead each card owns a
 * second, translucent copy of the SAME roller stroke (`.pcard__film`), clipped to
 * the card's rounded rectangle and drawn above the text with mix-blend-mode:
 * multiply. Result: WHITE CARD + VERY LIGHT BLUE FILM + CRISP TEXT (multiply
 * tints the paper but leaves dark ink dark). Strength: `--paint-over-card`
 * (0.12–0.25 recommended). The film's stroke is revealed by the very same
 * dashoffset as the wall paint, so it appears at the same instant the roller
 * passes — the card really looks rolled over.
 * ════════════════════════════════════════════════════════════════════════════
 */
export default function FlashCard({ card }: { card: PaintCard }) {
  const Icon = card.icon;
  const style = {
    "--cx": `var(--card-${card.id}-x)`,
    "--cy": `var(--card-${card.id}-y)`,
  } as CSSProperties;

  return (
    <article className="pcard" data-card={card.id} data-side={card.side} style={style}>
      <div className="pcard__paper" aria-hidden />
      <div className="pcard__body">
        <div className="pcard__top">
          <span className="pcard__number">{card.number}</span>
          <span className="pcard__icon" aria-hidden>
            <Icon strokeWidth={1.6} />
          </span>
        </div>
        <h3 className="pcard__title">{card.title}</h3>
        <p className="pcard__text">{card.description}</p>
      </div>
      {/* translucent paint film — same stroke as the wall paint, clipped by the card */}
      <svg className="pcard__film" aria-hidden data-film>
        <path data-paint-path fill="none" strokeLinejoin="round" strokeLinecap="butt" />
      </svg>
    </article>
  );
}
