/**
 * PaintStorySection — scroll-scrubbed "roller paints the wall" story.
 *
 * Layers (back→front): wall → paint trail → cards → card paint-film → roller → splashes.
 * One SVG path (config.ts) drives the roller, the paint reveal and the card anchors.
 * Scroll position === timeline progress (ScrollTrigger scrub + pin). Nothing autoplays;
 * scrolling up reverses everything. Reduced-motion → static finished composition.
 *
 * Sections you may want to touch (all clearly marked below):
 *   1. ROLLER PATH ............... config.ts (PATH_*) + samplePath()
 *   2. SCROLL TIMING ............. config.ts (CONFIG.*ScrollLength) + ScrollTrigger end
 *   3. CARD APPEARANCE ........... positionCards() + card entrance in render()
 *   4. PAINT REVEAL .............. render() `--reveal` (tracks roller x)
 *   5. PAINT-OVER-CARD ........... render() film opacity + CONFIG.cardPaintOpacity
 *   6. MOBILE RESPONSIVE ......... isMobile branch + paint-story.css @media
 */
import { useLayoutEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import WallBackground from "./WallBackground";
import PaintTrail from "./PaintTrail";
import FeatureCard from "./FeatureCard";
import PaintRoller from "./PaintRoller";
import PaintSplashes from "./PaintSplashes";
import { BOX, CARDS, CONFIG, PATH_DESKTOP, PATH_MOBILE } from "./config";
import "./paint-story.css";

gsap.registerPlugin(ScrollTrigger);

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => clamp01((v - a) / (b - a));
const ss = (t: number) => t * t * (3 - 2 * t); // smoothstep

export default function PaintStorySection() {
  const reduce = useReducedMotion() ?? false;
  const sectionRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const root: HTMLElement = section; // non-null, captured by the closures below
    const stage = section.querySelector<HTMLElement>(".ps-stage")!;
    const roller = section.querySelector<HTMLElement>("[data-roller]")!;
    const splashes = section.querySelector<HTMLElement>("[data-splashes]")!;
    const pathEl = section.querySelector<SVGPathElement>("[data-path]")!;
    const cardEls = Array.from(section.querySelectorAll<HTMLElement>("[data-card]"));
    const filmEls = cardEls.map((c) => c.querySelector<HTMLElement>("[data-film]")!);

    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    pathEl.setAttribute("d", isMobile ? PATH_MOBILE : PATH_DESKTOP);
    const len = pathEl.getTotalLength();

    // box(1440×760) → stage px. (recomputed on refresh/resize)
    let sx = 1;
    let sy = 1;
    let rectW = 1;
    const at = (f: number) => pathEl.getPointAtLength(clamp01(f) * len);

    /* 3. CARD APPEARANCE — anchor each card to its path point (set once / on resize) */
    const CARD_OFFSET = isMobile ? 120 : 150; // px above/below the path line
    function positionCards() {
      const r = stage.getBoundingClientRect();
      rectW = r.width;
      sx = r.width / BOX.w;
      sy = r.height / BOX.h;
      cardEls.forEach((el, i) => {
        const p = at(CARDS[i].at);
        el.style.left = `${p.x * sx}px`;
        el.style.top = `${p.y * sy + (CARDS[i].place === "above" ? -CARD_OFFSET : CARD_OFFSET)}px`;
      });
    }

    const REVEAL_LAG = CONFIG.paintLagPx; // paint edge sits this far behind the roller
    const LEAD = 0.1; // card starts appearing this much progress before its anchor
    const DUR = 0.09; // over this much progress

    function render(p: number) {
      /* 1. ROLLER PATH — sample point + tangent */
      const pt = at(p);
      const pt2 = at(Math.min(1, p + 0.004));
      const rx = pt.x * sx;
      const ry = pt.y * sy;
      const angle = (Math.atan2((pt2.y - pt.y) * sy, (pt2.x - pt.x) * sx) * 180) / Math.PI;
      gsap.set(roller, { x: rx, y: ry, rotation: angle * 0.35 });

      /* 4. PAINT REVEAL — leading edge tracks the roller's x (minus a small lag) */
      root.style.setProperty("--reveal", String(clamp01((rx - REVEAL_LAG) / rectW)));

      /* 6b. splash near first contact (~0.08..0.18) then fade */
      splashes.style.opacity = String(ss(smooth(0.05, 0.12, p)) * (1 - ss(smooth(0.2, 0.32, p))));
      gsap.set(splashes, { x: rx, y: ry });

      /* 3./5. card entrance + paint film */
      cardEls.forEach((el, i) => {
        const c = CARDS[i];
        const enter = ss(smooth(c.at - LEAD, c.at - LEAD + DUR, p));
        gsap.set(el, {
          opacity: enter,
          scale: 0.94 + 0.06 * enter,
          y: 15 * (1 - enter),
          rotation: (c.place === "above" ? -2 : 2) * (1 - enter),
        });
        // film appears as the roller crosses the card's anchor
        filmEls[i].style.opacity = String(CONFIG.cardPaintOpacity * ss(smooth(c.at, c.at + 0.05, p)));
      });

      if (CONFIG.debug) {
        const dbg = root.querySelector<HTMLElement>("[data-dbg]");
        if (dbg) dbg.textContent = `progress ${(p * 100).toFixed(1)}%`;
      }
    }

    /* ── Reduced motion: no scroll animation, show the finished wall ── */
    if (reduce) {
      positionCards();
      root.style.setProperty("--reveal", "1");
      cardEls.forEach((el, i) => {
        gsap.set(el, { opacity: 1, scale: 1, y: 0, rotation: 0 });
        filmEls[i].style.opacity = String(CONFIG.cardPaintOpacity);
      });
      roller.style.display = "none";
      splashes.style.display = "none";
      return;
    }

    /* 2. SCROLL TIMING — pinned, scrubbed; progress 0..1 === scroll through the section */
    const vh = window.innerHeight / 100;
    const scrollLen = (isMobile ? CONFIG.mobileScrollLength : CONFIG.desktopScrollLength) * vh;

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: section,
        start: "top top",
        end: `+=${scrollLen}`,
        scrub: true,
        pin: stage,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onRefresh: positionCards,
        onUpdate: (self: ScrollTrigger) => render(self.progress),
      });
    }, section);

    positionCards();
    render(0);
    // fonts/layout can shift the pin math — settle once ready
    const onLoad = () => ScrollTrigger.refresh();
    window.addEventListener("load", onLoad);

    return () => {
      window.removeEventListener("load", onLoad);
      ctx.revert();
    };
  }, [reduce]);

  return (
    <section
      ref={sectionRef}
      className={`paint-story${reduce ? " is-static" : ""}${CONFIG.debug ? " is-debug" : ""}`}
      aria-label="How it works — paint story"
    >
      <div className="ps-stage">
        <WallBackground />
        <PaintTrail />
        <div className="ps-cards">
          {CARDS.map((c) => (
            <FeatureCard key={c.id} card={c} />
          ))}
        </div>
        <PaintRoller />
        <PaintSplashes />

        {/* motion path (source of truth) — hidden unless debug */}
        <svg className="ps-path" viewBox={`0 0 ${BOX.w} ${BOX.h}`} preserveAspectRatio="none" aria-hidden>
          <path data-path d="" fill="none" />
        </svg>
        {CONFIG.debug && <div className="ps-dbg" data-dbg>progress 0%</div>}
      </div>
    </section>
  );
}
