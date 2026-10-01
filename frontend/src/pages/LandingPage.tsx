import { LanguageProvider } from "./landing/i18n";
import Nav from "./landing/Nav";
import Hero from "./landing/Hero";
import ReferenceStory from "./landing/ReferenceStory";
import Problem from "./landing/Problem";
import Solution from "./landing/Solution";
import HowItWorks from "./landing/HowItWorks";
import Pricing from "./landing/Pricing";
import FinalCta from "./landing/FinalCta";
import Footer from "./landing/Footer";

export default function LandingPage() {
  return (
    <LanguageProvider>
      <div
        id="top"
        className="relative min-h-screen overflow-x-clip bg-gradient-to-b from-white to-[#eef0f4] text-neutral-900"
      >
        {/* subtle dot texture */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage: "radial-gradient(circle, #cdd2dc 1px, transparent 1.4px)",
            backgroundSize: "22px 22px",
          }}
        />
        {/* soft brand glow behind the hero */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[22%] h-[520px] w-[520px] -translate-x-1/2 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(59,127,255,0.18), transparent 70%)" }}
        />

        <Nav />
        <Hero />
        <ReferenceStory />
        <Problem />
        <Solution />
        <HowItWorks />
        <Pricing />
        <FinalCta />
        <Footer />
      </div>
    </LanguageProvider>
  );
}
