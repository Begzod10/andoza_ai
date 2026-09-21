import { useEffect, useRef, useState } from "react";
import { RoomLineArt } from "./RoomLineArt";
import { usePointerTilt } from "./hooks/usePointerTilt";
import { useLanguage } from "./i18n/LanguageContext";

const ROTATE_INTERVAL_MS = 8000;

// Layered card composition standing in for a real product screenshot —
// keeps the landing page's JS bundle free of the heavy three.js/R3F chunk
// that the actual 3D studio needs. The whole stack tilts toward the cursor
// (plain CSS perspective/rotate) for a lightweight sense of depth, and the
// room shown cycles through all 5 presets from translations.ts every 8s
// (paused while hovered, and skipped entirely under prefers-reduced-motion,
// matching WCAG's "pause auto-updating content" guidance).
export function HeroMock() {
  const { ref, onMouseMove, onMouseLeave } = usePointerTilt<HTMLDivElement>();
  const { t } = useLanguage();
  const [roomIndex, setRoomIndex] = useState(0);
  const isPausedRef = useRef(false);
  const roomCount = t.heroMock.rooms.length;

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReducedMotion) return;

    const id = setInterval(() => {
      if (isPausedRef.current) return;
      setRoomIndex((i) => (i + 1) % roomCount);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [roomCount]);

  // Locale switches can happen mid-cycle; clamp in case a future locale
  // ever shipped a different room count.
  const room = t.heroMock.rooms[roomIndex % roomCount];

  const handleMouseMove: typeof onMouseMove = (e) => {
    isPausedRef.current = true;
    onMouseMove(e);
  };
  const handleMouseLeave = () => {
    isPausedRef.current = false;
    onMouseLeave();
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="landing-tilt relative mx-auto w-full max-w-sm h-[420px]"
    >
      <div className="absolute inset-0 rounded-3xl bg-white/10 border border-white/15 backdrop-blur-sm rotate-[-3deg] shadow-2xl" />
      <div className="absolute inset-4 rounded-2xl bg-white text-neutral-900 rotate-[-3deg] shadow-xl overflow-hidden">
        <div aria-hidden="true" className="landing-shimmer-sweep" />
        <div key={roomIndex} className="landing-fade-swap">
          <div className="p-4 border-b border-neutral-100 flex items-center justify-between">
            <span className="text-sm font-bold text-primary">{room.name}</span>
            <span className="text-xs text-success bg-success-tint px-2 py-0.5 rounded-full">
              {t.heroMock.ready3d}
            </span>
          </div>
          <div className="p-5 space-y-3">
            <RoomLineArt />
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>{room.area}</span>
              <span>{room.walls}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="landing-float absolute -bottom-6 -left-6 rotate-[4deg] rounded-2xl bg-white text-neutral-900 shadow-xl p-4 w-48">
        <p className="text-[11px] text-neutral-500 font-semibold">{t.heroMock.estimateLabel}</p>
        <p key={roomIndex} className="landing-fade-swap text-xl font-extrabold text-primary">
          {room.price}
        </p>
        <p className="text-[11px] text-success font-semibold mt-1">{t.heroMock.estimateNote}</p>
      </div>

      <div className="landing-float-delayed absolute -top-4 -right-2 rotate-[6deg] rounded-xl bg-orange-cta text-white shadow-xl px-3 py-2 text-xs font-bold">
        {t.heroMock.badge}
      </div>
    </div>
  );
}
