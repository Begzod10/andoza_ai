/**
 * Paint Story v2 — configuration + content + the single motion path.
 *
 * ONE SVG path (in a 1440×760 design box) is the source of truth for:
 *   • the roller's movement      • the paint reveal direction
 *   • where each feature card is anchored (card.at = fraction along the path)
 *
 * Everything you are likely to tweak lives here or in paint-story.css.
 */
import { BarChart3, Box, ShieldCheck, Zap, type LucideIcon } from "lucide-react";

export const CONFIG = {
  paintColor: "#176BFF",
  wallColor: "#F7F6F2",
  cardPaintOpacity: 0.2, // translucent blue film left on a card after the roller passes
  rollerScaleDesktop: 1,
  rollerScaleMobile: 0.68,
  desktopScrollLength: 450, // vh of scroll the pinned sequence lasts
  mobileScrollLength: 260,
  /** px, how far behind the roller the paint's leading edge sits */
  paintLagPx: 40,
  debug: false, // ← flip true to see the path, roller/card anchors, progress
} as const;

/** Design box the PATH + card anchors are authored in (maps to the stage by %). */
export const BOX = { w: 1440, h: 760 } as const;

/* ════ MOTION PATH ════ one long, smooth, cinematic left→right Bézier.
   Gentle up/down waves, no sharp turns. Edit freely (keep it left→right). */
export const PATH_DESKTOP =
  "M -140 320 C 180 300 300 300 470 356 C 640 412 720 300 900 300 C 1080 300 1140 452 1300 452 C 1440 452 1540 404 1620 392";
export const PATH_MOBILE =
  "M -80 300 C 120 300 220 384 360 384 C 500 384 540 300 720 300 C 820 300 860 470 1520 470";

export interface PaintCardData {
  id: number;
  number: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** fraction along the path (0..1) where the card is anchored + revealed */
  at: number;
  /** card body sits above or below the path line */
  place: "above" | "below";
}

export const CARDS: PaintCardData[] = [
  { id: 1, number: "01", title: "Creative Design", description: "Beautiful and modern designs for your ideas.", icon: Box, at: 0.3, place: "below" },
  { id: 2, number: "02", title: "Fast Performance", description: "Optimized for speed and a smooth experience.", icon: Zap, at: 0.5, place: "above" },
  { id: 3, number: "03", title: "Smart Analytics", description: "Understand your data and grow faster.", icon: BarChart3, at: 0.68, place: "below" },
  { id: 4, number: "04", title: "Secure & Reliable", description: "Your data is always safe with us.", icon: ShieldCheck, at: 0.85, place: "above" },
];
