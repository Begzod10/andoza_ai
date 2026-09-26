import { EyeOff, Calculator, ShoppingCart, HardHat, PackageX } from "lucide-react";
import { Reveal } from "./Reveal";
import { useLanguage } from "./i18n/LanguageContext";

// Order matches t.problem.pains in every locale — icons aren't translated.
const PAIN_ICONS = [EyeOff, Calculator, ShoppingCart, HardHat, PackageX];

// Bento layout instead of 5 uniform tiles: the core tension ("you pay
// before you can see it") gets a wider, taller anchor tile; the other 4
// pair up into two even half-width tiles per row. Grid-span/height only —
// the flip-card mechanic itself doesn't care about its box's dimensions.
const SPAN_CLASSES = ["lg:col-span-2", "", "", "lg:col-span-2", "lg:col-span-2"];
const HEIGHT_CLASSES = ["h-64", "h-52", "h-52", "h-52", "h-52"];

export function ProblemSection() {
  const { t } = useLanguage();

  return (
    <section className="py-20 sm:py-28 bg-paper">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <Reveal className="max-w-2xl">
          <span className="text-orange font-bold text-sm uppercase tracking-wide">
            {t.problem.eyebrow}
          </span>
          <h2 className="mt-2 text-3xl sm:text-h2 font-extrabold text-neutral-900">
            {t.problem.heading}
          </h2>
        </Reveal>

        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {t.problem.pains.map(({ title, desc }, i) => {
            const Icon = PAIN_ICONS[i];
            const big = i === 0;
            return (
              <Reveal
                key={title}
                delayMs={i * 80}
                className={`${HEIGHT_CLASSES[i]} ${SPAN_CLASSES[i]}`}
              >
                <button
                  type="button"
                  className="flip-card landing-focus-ring-dark rounded-2xl"
                  aria-label={`${title} — ${desc}`}
                >
                  <div className="flip-card-inner">
                    <div
                      aria-hidden="true"
                      className="flip-card-front rounded-2xl bg-white border border-border shadow-sm flex items-center justify-center"
                    >
                      <div
                        className={`rounded-2xl bg-primary-tint flex items-center justify-center ${
                          big ? "w-20 h-20" : "w-16 h-16"
                        }`}
                      >
                        <Icon className={big ? "w-10 h-10 text-primary" : "w-8 h-8 text-primary"} />
                      </div>
                    </div>
                    <div
                      aria-hidden="true"
                      className="flip-card-back rounded-2xl bg-primary p-5 shadow-sm flex flex-col justify-center"
                    >
                      <h3 className={`font-bold text-white ${big ? "text-lg" : "text-sm"}`}>
                        {title}
                      </h3>
                      <p className={`mt-2 text-white/80 ${big ? "text-base max-w-xs" : "text-sm"}`}>
                        {desc}
                      </p>
                    </div>
                  </div>
                </button>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
