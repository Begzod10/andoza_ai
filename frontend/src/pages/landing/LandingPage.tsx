import "./landing-motion.css";
import { Hero } from "./Hero";
import { ProblemSection } from "./ProblemSection";
import { SolutionSection } from "./SolutionSection";
import { HowItWorks } from "./HowItWorks";
import { PricingSection } from "./PricingSection";
import { FinalCta } from "./FinalCta";
import { LandingFooter } from "./LandingFooter";
import { LanguageProvider } from "./i18n/LanguageContext";

// Public marketing home page at "/". Everyone sees it; every CTA routes to
// /projects, which itself bounces logged-out visitors to /login (existing
// RequireAuth behavior) and drops authenticated visitors straight into
// their dashboard.
export default function LandingPage() {
  return (
    <LanguageProvider>
      <div className="min-h-screen bg-white">
        <Hero />
        <ProblemSection />
        <SolutionSection />
        <HowItWorks />
        <PricingSection />
        <FinalCta />
        <LandingFooter />
      </div>
    </LanguageProvider>
  );
}
