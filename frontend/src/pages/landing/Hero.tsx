import { Link } from "react-router-dom";
import { useLang } from "./i18n";
import ConveyorHero from "./ConveyorHero";

// ─── Hero ────────────────────────────────────────────────────────────────────

export default function Hero() {
  const { t } = useLang();

  return (
    <main className="relative z-10 mx-auto flex max-w-6xl flex-col items-center px-6 pb-24 pt-8 text-center sm:pt-14 lg:pt-20">
      {/* eyebrow */}
      <span className="animate-rise-in mb-7 inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white/70 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-500 backdrop-blur">
        <span className="h-1.5 w-1.5 rounded-full bg-[#3b7fff]" />
        {t.hero.eyebrow}
      </span>

      {/* floating app glyph */}
      <div className="animate-float mb-7 grid h-16 w-16 place-items-center rounded-2xl bg-white shadow-[0_18px_45px_-15px_rgba(30,41,59,0.35)] ring-1 ring-black/5 sm:h-[68px] sm:w-[68px]">
        <span className="grid grid-cols-2 gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#3b7fff]" />
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-900" />
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-900" />
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-900" />
        </span>
      </div>

      <h1 className="animate-rise-in text-[38px] font-extrabold leading-[1.04] tracking-tight sm:text-6xl lg:text-[76px]">
        {t.hero.title1}
        <br />
        <span className="bg-gradient-to-r from-[#3b7fff] via-[#7aa5ff] to-neutral-400 bg-clip-text text-transparent">
          {t.hero.title2}
        </span>
      </h1>

      <p
        className="animate-rise-in mt-6 max-w-lg text-base text-neutral-500 sm:text-lg"
        style={{ animationDelay: "0.08s" }}
      >
        {t.hero.subtitle}
      </p>

      <div
        className="animate-rise-in mt-9 flex flex-col items-center gap-3 sm:flex-row"
        style={{ animationDelay: "0.16s" }}
      >
        <Link
          to="/login"
          className="rounded-full bg-[#2563eb] px-7 py-3.5 text-sm font-bold text-white shadow-[0_16px_35px_-12px_rgba(37,99,235,0.7)] transition-transform hover:-translate-y-0.5 hover:bg-[#1d4ed8] active:translate-y-0"
        >
          {t.hero.primary}
        </Link>
        <a
          href="#how"
          className="inline-flex items-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold text-neutral-600 transition-colors hover:text-neutral-900"
        >
          <span className="grid h-6 w-6 place-items-center rounded-full bg-white shadow ring-1 ring-black/5">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          {t.hero.secondary}
        </a>
      </div>

      <p className="animate-rise-in mt-5 text-[13px] text-neutral-400" style={{ animationDelay: "0.22s" }}>
        {t.hero.note}
      </p>

      {/* ── Main visual: PROBLEM → AndozaAI machine → SOLUTION conveyor ── */}
      <div
        className="animate-rise-in mt-14 w-full sm:mt-16"
        style={{ animationDelay: "0.3s" }}
      >
        <ConveyorHero />
      </div>
    </main>
  );
}
