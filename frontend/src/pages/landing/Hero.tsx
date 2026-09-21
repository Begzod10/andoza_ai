import { ArrowRight, PlayCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/branding/Logo";
import { GridBackdrop } from "./GridBackdrop";
import { HeroMock } from "./HeroMock";
import { useSpotlight } from "./hooks/useSpotlight";
import { useLanguage } from "./i18n/LanguageContext";
import { LanguageSwitcher } from "./i18n/LanguageSwitcher";

export function Hero() {
  const navigate = useNavigate();
  const { ref: spotlightRef, onMouseMove } = useSpotlight<HTMLElement>();
  const { t } = useLanguage();

  return (
    <section
      ref={spotlightRef}
      onMouseMove={onMouseMove}
      className="relative overflow-hidden bg-primary text-white"
    >
      <GridBackdrop className="landing-grid-drift" />
      <div aria-hidden="true" className="landing-spotlight pointer-events-none absolute inset-0" />
      <div
        aria-hidden="true"
        className="landing-blob-drift absolute -top-24 -right-24 w-96 h-96 rounded-full bg-secondary/30 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="landing-blob-drift absolute bottom-0 left-1/3 w-72 h-72 rounded-full bg-orange/10 blur-3xl"
        style={{ animationDelay: "3s" }}
      />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-20 sm:pt-10 sm:pb-28">
        <header className="flex items-center justify-between mb-16 sm:mb-24 gap-3">
          <Logo variant="horizontal" theme="dark" width={140} height={46} />
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Button
              variant="secondary"
              size="sm"
              className="landing-focus-ring !border-white !text-white hover:!bg-white/10"
              onClick={() => navigate("/login")}
            >
              {t.hero.kirish}
            </Button>
          </div>
        </header>

        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center">
          <div className="landing-hero-in">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide uppercase text-warning-bright">
              {t.hero.eyebrow}
            </span>
            <h1 className="mt-5 text-4xl sm:text-5xl lg:text-h1 font-extrabold leading-[1.08]">
              {t.hero.headlinePre}
              <span className="text-warning-bright">{t.hero.headlineHighlight}</span>
              {t.hero.headlinePost}
            </h1>
            <p className="mt-5 text-lg text-white/80 max-w-xl">{t.hero.subheadline}</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button
                size="lg"
                className="landing-glow-pulse landing-focus-ring !bg-orange-cta !text-white hover:!bg-orange-cta/90 hover:scale-105 shadow-lg shadow-orange/30 transition-transform"
                rightIcon={<ArrowRight className="w-5 h-5" />}
                onClick={() => navigate("/projects")}
              >
                {t.hero.ctaPrimary}
              </Button>
              <a
                href="#qanday-ishlaydi"
                className="landing-focus-ring rounded-md inline-flex items-center gap-2 text-white/90 font-semibold hover:text-white transition-colors"
              >
                <PlayCircle className="w-5 h-5" /> {t.hero.ctaSecondary}
              </a>
            </div>
            <p className="mt-4 text-sm text-white/60">{t.hero.disclaimer}</p>
          </div>

          <div className="landing-hero-in-delayed">
            <HeroMock />
          </div>
        </div>
      </div>
    </section>
  );
}
