import { ArrowRight, Hammer, Palette } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Reveal } from "./Reveal";
import { GridBackdrop } from "./GridBackdrop";
import { FloatingObject } from "./FloatingObject";
import { useLanguage } from "./i18n/LanguageContext";

export function FinalCta() {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <section className="relative overflow-hidden py-20 sm:py-28 bg-paper">
      <div
        aria-hidden="true"
        className="landing-blob-drift absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[32rem] h-[32rem] rounded-full bg-primary-tint blur-3xl"
      />
      <div
        aria-hidden="true"
        className="landing-blob-drift absolute top-0 right-0 w-72 h-72 rounded-full bg-orange-tint blur-3xl"
        style={{ animationDelay: "2.5s" }}
      />
      <FloatingObject icon={Hammer} tint="orange" className="w-14 h-14 top-10 left-[8%] hidden lg:flex" />
      <FloatingObject
        icon={Palette}
        tint="primary"
        floatDelayed
        className="w-14 h-14 bottom-10 right-[8%] hidden lg:flex"
      />

      {/* A closing "card" rather than bare centered text floating on the
          section background — echoes the navy anchor tiles used in
          Problem/Solution/Pricing so the page reads as one system, and
          gives this section its own structural identity instead of
          riding entirely on the decorative icons around it. */}
      <Reveal className="relative max-w-3xl mx-auto px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-primary text-center px-8 py-14 sm:px-16 sm:py-16 shadow-2xl">
          <GridBackdrop className="landing-grid-drift" />
          <div className="relative">
            <h2 className="text-3xl sm:text-h2 font-extrabold text-white">
              {t.finalCta.headingPre}
              <span className="text-warning-bright">{t.finalCta.headingHighlight}</span>
            </h2>
            <p className="mt-4 text-white/75 text-lg max-w-xl mx-auto">{t.finalCta.subheading}</p>
            <div className="mt-8">
              <Button
                size="lg"
                className="landing-keycap landing-keycap--orange landing-focus-ring !text-white"
                style={{ textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}
                rightIcon={<ArrowRight className="w-5 h-5" />}
                onClick={() => navigate("/projects")}
              >
                {t.finalCta.cta}
              </Button>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
