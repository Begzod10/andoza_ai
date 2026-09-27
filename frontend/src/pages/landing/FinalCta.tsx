import { Link } from "react-router-dom";
import { useLang } from "./i18n";
import Reveal from "./Reveal";

export default function FinalCta() {
  const { t } = useLang();

  return (
    <section className="relative z-10 mx-auto max-w-6xl px-6 py-16 sm:py-20">
      <Reveal className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1d4ed8] via-[#2563eb] to-[#3b7fff] px-8 py-14 text-center shadow-[0_40px_80px_-30px_rgba(37,99,235,0.7)] sm:px-16 sm:py-20">
        {/* soft texture + glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.6) 1px, transparent 1.4px)",
            backgroundSize: "22px 22px",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-16 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-white/20 blur-3xl"
        />

        <div className="relative">
          <h2 className="mx-auto max-w-2xl text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
            {t.finalCta.heading}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-blue-100 sm:text-lg">
            {t.finalCta.subtitle}
          </p>
          <Link
            to="/login"
            className="mt-8 inline-flex items-center rounded-full bg-white px-8 py-3.5 text-sm font-bold text-[#1d4ed8] shadow-[0_16px_35px_-12px_rgba(0,0,0,0.4)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
          >
            {t.finalCta.button}
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
