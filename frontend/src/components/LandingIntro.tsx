import { useEffect, useState } from "react";
import { BrandLoader } from "@/components/BrandLoader";

const SEEN_KEY = "andoza:landing-intro-seen";
/** Long enough for the logo to finish building and the wordmark to land. */
const SHOW_MS = 2300;
const FADE_MS = 500;

function alreadySeen(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false; // storage blocked: just play it
  }
}

function markSeen() {
  try {
    sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* nothing to remember it in; it will play again, which is harmless */
  }
}

/**
 * The first thing a guest sees on the public landing page: the brand loader,
 * held long enough to be seen (a cached landing chunk would otherwise skip it
 * entirely), then faded away. Once per browser session — a reload or coming
 * back to "/" does not replay it. Reduced-motion visitors get a short hold,
 * since the loader is a still logo for them.
 */
export function LandingIntro() {
  const [phase, setPhase] = useState<"show" | "fade" | "gone">(() => (alreadySeen() ? "gone" : "show"));

  useEffect(() => {
    if (phase === "gone") return;
    const still = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hold = still ? 600 : SHOW_MS;
    const toFade = setTimeout(() => setPhase("fade"), hold);
    const toGone = setTimeout(() => {
      markSeen();
      setPhase("gone");
    }, hold + FADE_MS);
    return () => {
      clearTimeout(toFade);
      clearTimeout(toGone);
    };
  }, [phase === "gone"]); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === "gone") return null;
  return (
    <div
      data-testid="landing-intro"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        opacity: phase === "fade" ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease`,
        pointerEvents: phase === "fade" ? "none" : "auto",
      }}
    >
      <BrandLoader />
    </div>
  );
}
