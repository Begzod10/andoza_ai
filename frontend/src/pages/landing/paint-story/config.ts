/**
 * Paint Story — JS-side configuration + the card content.
 *
 * Visual values (colours, sizes, positions, scroll length, paint transparency)
 * live in `paint-story.css` as CSS variables — change them there.
 * This file holds the things that are naturally data or timing numbers.
 */
import { Calculator, Hammer, Ruler, Sparkles, type LucideIcon } from "lucide-react";

export interface PaintCard {
  id: number;
  /** small index label shown top-left of the card */
  number: string;
  title: string;
  description: string;
  /** which side of the wall the card is attached to (informational + entrance direction) */
  side: "left" | "right";
  icon: LucideIcon;
}

/** ── PLACEHOLDER CONTENT ── replace text freely; keep four entries, alternating sides. */
export const CARDS: PaintCard[] = [
  {
    id: 1,
    number: "01",
    title: "Birinchi imkoniyat",
    description: "Bu yerga birinchi kartaning qisqa tavsifi yoziladi: bir-ikki jumla yetarli.",
    side: "right",
    icon: Ruler,
  },
  {
    id: 2,
    number: "02",
    title: "Ikkinchi imkoniyat",
    description: "Ikkinchi karta uchun joy egallovchi matn. Keyin haqiqiy mazmun bilan almashtiriladi.",
    side: "left",
    icon: Calculator,
  },
  {
    id: 3,
    number: "03",
    title: "Uchinchi imkoniyat",
    description: "Uchinchi kartaning tavsifi. Bo'yoq uning ustidan o'tganda matn aniq o'qilib turadi.",
    side: "right",
    icon: Hammer,
  },
  {
    id: 4,
    number: "04",
    title: "To'rtinchi imkoniyat",
    description: "Oxirgi karta: valik chap chetga chiqib ketishdan oldin shu yerdan o'tadi.",
    side: "left",
    icon: Sparkles,
  },
];

/* ════════════════════════════════════════════════════════════════════════════
   SECTION 2 — SCROLL TIMING
   The whole section is ONE scrubbed GSAP timeline of length 1.
   Scroll position === timeline progress. Nothing ever autoplays.
   (Total scroll distance itself = `--scroll-length` in the CSS.)
   ════════════════════════════════════════════════════════════════════════════ */
export const TIMING = {
  /** timeline fraction where the roller starts travelling (before: quiet hold) */
  start: 0.02,
  /** timeline fraction where the roller has fully left the screen (after: quiet hold) */
  end: 0.965,
  /** px of path sampling resolution (smaller = smoother, heavier setup) */
  sampleStepPx: 4,
} as const;

/* How each card is "attached" to the wall. Distances are measured ALONG the roller path,
   so cards always appear just ahead of the roller no matter the screen size. */
export const CARD_ENTER = {
  /** how far (beyond the card's half-width) ahead of the roller the card starts to appear */
  leadPx: 300,
  /** path distance over which the entrance plays */
  durationPx: 240,
  from: { opacity: 0, scale: 0.94, rotation: 3.5, y: 16 },
  ease: "power3.out",
} as const;

/* Roller body language. */
export const ROLLER_MOTION = {
  /** resting tilt: moving right→left = -tilt, left→right = +tilt */
  tiltDeg: 5,
  /** tiny sinusoidal wobble so it feels hand-held */
  wobbleDeg: 1.1,
  /** how quickly the arm swings from one side to the other when direction changes */
  flipGain: 2.4,
} as const;
