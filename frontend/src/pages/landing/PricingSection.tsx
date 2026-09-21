import { Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Reveal } from "./Reveal";
import { GridBackdrop } from "./GridBackdrop";
import { useLanguage } from "./i18n/LanguageContext";

// Highlighted tier index — matches TIERS[1] ("PRO") in every locale of
// translations.ts. Billing isn't wired up in the product yet, so every CTA
// routes into the free flow today — see the disclosure line below the cards.
const HIGHLIGHT_INDEX = 1;

export function PricingSection() {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <section className="py-20 sm:py-28 bg-primary text-white relative overflow-hidden">
      <GridBackdrop className="landing-grid-drift" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 relative">
        <Reveal className="max-w-2xl">
          <span className="text-warning-bright font-bold text-sm uppercase tracking-wide">
            {t.pricing.eyebrow}
          </span>
          <h2 className="mt-2 text-3xl sm:text-h2 font-extrabold">{t.pricing.heading}</h2>
        </Reveal>

        <div className="mt-12 grid sm:grid-cols-3 gap-6">
          {t.pricing.tiers.map((tier, i) => {
            const highlight = i === HIGHLIGHT_INDEX;
            return (
              <Reveal key={tier.name} delayMs={i * 100}>
                <div
                  className={`relative rounded-3xl p-7 flex flex-col transition-transform duration-normal hover:-translate-y-1.5 ${
                    highlight
                      ? "bg-white text-neutral-900 shadow-2xl sm:scale-[1.03]"
                      : "bg-white/5 border border-white/15"
                  }`}
                >
                  {highlight && <div aria-hidden="true" className="landing-shimmer-sweep" />}
                  {tier.badge && (
                    <span className="landing-float absolute -top-3 right-6 bg-orange-cta text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg shadow-orange/40">
                      {tier.badge}
                    </span>
                  )}
                  <h3 className="font-extrabold text-lg">{tier.name}</h3>
                  <p className={`text-sm mt-1 ${highlight ? "text-muted" : "text-white/60"}`}>
                    {tier.tagline}
                  </p>
                  <div
                    className={`mt-5 rounded-xl p-4 ${highlight ? "bg-paper" : "bg-white/10"}`}
                  >
                    <p className="font-bold">{tier.rooms}</p>
                  </div>
                  <div className="mt-5">
                    <span className="text-3xl font-extrabold">{tier.price}</span>
                    {tier.period && (
                      <span
                        className={`ml-1 text-sm ${highlight ? "text-muted" : "text-white/60"}`}
                      >
                        {tier.period}
                      </span>
                    )}
                  </div>
                  <ul className="mt-5 space-y-2 flex-1">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm">
                        <Check
                          className={`w-4 h-4 flex-shrink-0 ${
                            highlight ? "text-success" : "text-warning-bright"
                          }`}
                        />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    size="lg"
                    className={`mt-6 w-full hover:scale-[1.03] transition-transform ${
                      highlight
                        ? "landing-focus-ring-dark !bg-orange-cta !text-white hover:!bg-orange-cta/90"
                        : "landing-focus-ring !bg-white !text-primary hover:!bg-white/90"
                    }`}
                    onClick={() => navigate("/projects")}
                  >
                    {tier.cta}
                  </Button>
                </div>
              </Reveal>
            );
          })}
        </div>

        <p className="mt-8 text-center text-sm text-white/50">{t.pricing.disclosure}</p>
      </div>
    </section>
  );
}
