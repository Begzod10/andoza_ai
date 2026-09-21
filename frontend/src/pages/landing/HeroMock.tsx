import { RoomLineArt } from "./RoomLineArt";
import { usePointerTilt } from "./hooks/usePointerTilt";
import { useLanguage } from "./i18n/LanguageContext";

// Layered card composition standing in for a real product screenshot —
// keeps the landing page's JS bundle free of the heavy three.js/R3F chunk
// that the actual 3D studio needs. The whole stack tilts toward the cursor
// (plain CSS perspective/rotate) for a lightweight sense of depth.
export function HeroMock() {
  const { ref, onMouseMove, onMouseLeave } = usePointerTilt<HTMLDivElement>();
  const { t } = useLanguage();

  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className="landing-tilt relative mx-auto w-full max-w-sm h-[420px]"
    >
      <div className="absolute inset-0 rounded-3xl bg-white/10 border border-white/15 backdrop-blur-sm rotate-[-3deg] shadow-2xl" />
      <div className="absolute inset-4 rounded-2xl bg-white text-neutral-900 rotate-[-3deg] shadow-xl overflow-hidden">
        <div aria-hidden="true" className="landing-shimmer-sweep" />
        <div className="p-4 border-b border-neutral-100 flex items-center justify-between">
          <span className="text-sm font-bold text-primary">{t.heroMock.roomName}</span>
          <span className="text-xs text-success bg-success-tint px-2 py-0.5 rounded-full">
            {t.heroMock.ready3d}
          </span>
        </div>
        <div className="p-5 space-y-3">
          <RoomLineArt />
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span>{t.heroMock.area}</span>
            <span>{t.heroMock.walls}</span>
          </div>
        </div>
      </div>

      <div className="landing-float absolute -bottom-6 -left-6 rotate-[4deg] rounded-2xl bg-white text-neutral-900 shadow-xl p-4 w-48">
        <p className="text-[11px] text-neutral-500 font-semibold">{t.heroMock.estimateLabel}</p>
        <p className="text-xl font-extrabold text-primary">{t.heroMock.estimateValue}</p>
        <p className="text-[11px] text-success font-semibold mt-1">{t.heroMock.estimateNote}</p>
      </div>

      <div className="landing-float-delayed absolute -top-4 -right-2 rotate-[6deg] rounded-xl bg-orange-cta text-white shadow-xl px-3 py-2 text-xs font-bold">
        {t.heroMock.badge}
      </div>
    </div>
  );
}
