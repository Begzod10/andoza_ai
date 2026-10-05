import { useLayoutEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import FlashCard from "./FlashCard";
import PaintLayer from "./PaintLayer";
import PaintRoller from "./PaintRoller";
import { CARDS, type PaintCard } from "./config";
import { initPaintStory } from "./paintStoryTimeline";
import "./paint-story.css";

/**
 * PaintStorySection — a white wall gets painted blue by a roller, driven 100% by scroll.
 *
 * Where to change things
 *   Colours / sizes / positions / scroll length / paint-over-card transparency / mobile → paint-story.css
 *   1. Roller path ................ ScrollPath.ts
 *   2. Scroll timing .............. config.ts (TIMING) + paintStoryTimeline.ts  (+ --scroll-length in CSS)
 *   3. Card appearance ............ FlashCard.tsx + paint-story.css (.pcard*)
 *   4. Paint reveal ............... PaintLayer.tsx + paintStoryTimeline.ts (dashoffset)
 *   5. Paint-over-card transparency FlashCard.tsx (.pcard__film) + --paint-over-card
 *   6. Mobile responsive behaviour  paint-story.css (@media blocks, bottom of file)
 *
 * Layer order (back → front): wall colour → PaintLayer → grain → cards (+ their film) → roller.
 * Reduced motion: no pin, no roller; a static, fully painted wall with the cards laid out in a grid.
 */
export default function PaintStorySection({ cards = CARDS, className }: { cards?: PaintCard[]; className?: string }) {
  const reduce = useReducedMotion() ?? false;
  const ref = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;
    return initPaintStory(el);
  }, [reduce, cards]);

  return (
    <section
      ref={ref}
      className={`paint-story${reduce ? " is-static" : ""}${className ? ` ${className}` : ""}`}
      aria-label="Paint story"
    >
      <PaintLayer staticMode={reduce} />
      <div className="paint-story__grain" aria-hidden />
      <div className="paint-story__cards">
        {cards.map((c) => (
          <FlashCard key={c.id} card={c} />
        ))}
      </div>
      {!reduce && <PaintRoller />}
    </section>
  );
}
