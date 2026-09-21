import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Reveal } from "./Reveal";
import { useLanguage } from "./i18n/LanguageContext";

export function FinalCta() {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <section className="relative overflow-hidden py-20 sm:py-28 bg-white">
      <div
        aria-hidden="true"
        className="landing-blob-drift absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[32rem] h-[32rem] rounded-full bg-primary-tint blur-3xl"
      />
      <Reveal className="relative max-w-4xl mx-auto px-4 sm:px-6 text-center">
        <h2 className="text-3xl sm:text-h2 font-extrabold text-neutral-900">
          {t.finalCta.headingPre}
          <span className="text-orange">{t.finalCta.headingHighlight}</span>
        </h2>
        <p className="mt-4 text-muted text-lg max-w-xl mx-auto">{t.finalCta.subheading}</p>
        <div className="mt-8">
          <Button
            size="lg"
            className="landing-glow-pulse landing-focus-ring-dark hover:scale-105 transition-transform"
            rightIcon={<ArrowRight className="w-5 h-5" />}
            onClick={() => navigate("/projects")}
          >
            {t.finalCta.cta}
          </Button>
        </div>
      </Reveal>
    </section>
  );
}
