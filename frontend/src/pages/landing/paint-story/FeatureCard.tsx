import type { PaintCardData } from "./config";

/**
 * Layer 3 (card) + Layer 4 (paint film over the card).
 * Position is set by the section (data-card) from the path anchor. The `__film`
 * is the translucent blue overlay left after the roller passes (opacity driven
 * by the timeline).
 */
export default function FeatureCard({ card }: { card: PaintCardData }) {
  const Icon = card.icon;
  return (
    <article className="ps-card" data-card={card.id} data-place={card.place} aria-label={card.title}>
      <div className="ps-card__head">
        <span className="ps-card__num">{card.number}</span>
        <span className="ps-card__icon"><Icon strokeWidth={1.8} /></span>
      </div>
      <h3 className="ps-card__title">{card.title}</h3>
      <p className="ps-card__desc">{card.description}</p>
      <span className="ps-card__film" data-film aria-hidden />
    </article>
  );
}
