import { EyeOff, Calculator, ShoppingCart, HardHat, PackageX } from "lucide-react";
import { Reveal } from "./Reveal";
import { useLanguage } from "./i18n/LanguageContext";

// Order matches t.problem.pains in every locale — icons aren't translated.
const PAIN_ICONS = [EyeOff, Calculator, ShoppingCart, HardHat, PackageX];

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

        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {t.problem.pains.map(({ title, desc }, i) => {
            const Icon = PAIN_ICONS[i];
            return (
              <Reveal key={title} delayMs={i * 80} className="h-52">
                <button type="button" className="flip-card landing-focus-ring-dark rounded-2xl">
                  <div className="flip-card-inner">
                    <div className="flip-card-front rounded-2xl bg-white border border-border p-5 shadow-sm flex flex-col items-start">
                      <div className="w-11 h-11 rounded-xl bg-primary-tint flex items-center justify-center mb-4">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <h3 className="font-bold text-neutral-900">{title}</h3>
                      <span className="mt-auto text-xs text-subtle">{t.problem.moreLabel}</span>
                    </div>
                    <div className="flip-card-back rounded-2xl bg-primary p-5 shadow-sm flex flex-col justify-center">
                      <h3 className="font-bold text-white text-sm">{title}</h3>
                      <p className="mt-2 text-sm text-white/80">{desc}</p>
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
