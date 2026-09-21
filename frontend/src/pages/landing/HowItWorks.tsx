import { Reveal } from "./Reveal";
import { useLanguage } from "./i18n/LanguageContext";

const STEP_NUMBERS = ["01", "02", "03", "04"];

export function HowItWorks() {
  const { t } = useLanguage();

  return (
    <section id="qanday-ishlaydi" className="py-20 sm:py-28 bg-paper">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <Reveal className="max-w-2xl">
          <span className="text-orange font-bold text-sm uppercase tracking-wide">
            {t.howItWorks.eyebrow}
          </span>
          <h2 className="mt-2 text-3xl sm:text-h2 font-extrabold text-neutral-900">
            {t.howItWorks.heading}
          </h2>
        </Reveal>

        <ol className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {t.howItWorks.steps.map(({ title, desc }, i) => (
            <Reveal key={title} as="li" delayMs={i * 100} className="relative pl-1">
              <span className="text-5xl font-extrabold text-primary/15" aria-hidden="true">
                {STEP_NUMBERS[i]}
              </span>
              <h3 className="mt-2 font-bold text-neutral-900">{title}</h3>
              <p className="mt-1.5 text-sm text-muted">{desc}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
