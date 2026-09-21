import { Box, Calculator, ShoppingBag, HardHat, Zap } from "lucide-react";
import { Reveal } from "./Reveal";
import { useLanguage } from "./i18n/LanguageContext";

// Order matches t.solution.features in every locale — each maps to a real
// shipped feature/route, not an aspirational one: Box -> /scan/lidar,
// /scan/360, /scan/draw + the 3D studio; Calculator -> the smeta engine;
// ShoppingBag -> /dokon; HardHat -> /ustalar; Zap -> the electrical/suvoq
// planning stages inside the studio. Icons aren't translated.
const FEATURE_ICONS = [Box, Calculator, ShoppingBag, HardHat, Zap];
const BIG_INDEX = 0;

export function SolutionSection() {
  const { t } = useLanguage();

  return (
    <section className="py-20 sm:py-28 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <Reveal className="max-w-2xl">
          <span className="text-primary font-bold text-sm uppercase tracking-wide">
            {t.solution.eyebrow}
          </span>
          <h2 className="mt-2 text-3xl sm:text-h2 font-extrabold text-neutral-900">
            {t.solution.heading}
          </h2>
        </Reveal>

        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {t.solution.features.map(({ title, desc }, i) => {
            const Icon = FEATURE_ICONS[i];
            const big = i === BIG_INDEX;
            return (
              <Reveal key={title} delayMs={i * 80} className={big ? "sm:col-span-2" : undefined}>
                <div
                  className={`group rounded-3xl border border-border p-6 sm:p-7 transition-transform duration-normal hover:-translate-y-1 ${
                    big ? "bg-primary text-white" : "bg-paper text-neutral-900"
                  }`}
                >
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-5 transition-transform duration-normal group-hover:scale-110 ${
                      big ? "bg-white/15" : "bg-white"
                    }`}
                  >
                    <Icon className={`w-6 h-6 ${big ? "text-warning-bright" : "text-primary"}`} />
                  </div>
                  <h3 className="text-xl font-bold">{title}</h3>
                  <p className={`mt-2 max-w-md ${big ? "text-white/75" : "text-muted"}`}>{desc}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
