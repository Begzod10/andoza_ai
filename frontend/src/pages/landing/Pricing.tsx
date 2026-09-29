import { Link } from "react-router-dom";
import { useLang } from "./i18n";
import { Icon } from "./icons";
import Reveal from "./Reveal";

export default function Pricing() {
  const { t } = useLang();
  const tiers = [
    { tier: t.pricing.free, highlighted: false },
    { tier: t.pricing.pro, highlighted: true },
  ];

  return (
    <section className="relative z-10 mx-auto max-w-6xl px-6 py-20 sm:py-24">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
          {t.pricing.heading}
        </h2>
      </Reveal>

      <div className="mx-auto mt-12 grid max-w-3xl gap-6 sm:grid-cols-2">
        {tiers.map(({ tier, highlighted }, i) => (
          <Reveal
            key={tier.name}
            delay={i * 0.1}
            className={
              highlighted
                ? "relative overflow-hidden rounded-2xl bg-neutral-900 p-7 text-white shadow-[0_30px_60px_-24px_rgba(30,41,59,0.6)] ring-1 ring-black/5"
                : "relative overflow-hidden rounded-2xl bg-white/85 p-7 ring-1 ring-black/5 backdrop-blur shadow-[0_22px_50px_-24px_rgba(30,41,59,0.35)]"
            }
          >
            {highlighted && (
              <>
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl"
                  style={{ background: "radial-gradient(circle, rgba(59,127,255,0.5), transparent 70%)" }}
                />
                <span className="absolute right-5 top-6 rounded-full bg-[#3b7fff] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                  {t.pricing.popular}
                </span>
              </>
            )}

            <h3
              className={`text-sm font-bold uppercase tracking-wider ${
                highlighted ? "text-[#7aa5ff]" : "text-[#2563eb]"
              }`}
            >
              {tier.name}
            </h3>
            <p className="mt-3 text-4xl font-extrabold tracking-tight">{tier.price}</p>

            <ul className="mt-6 space-y-3">
              {tier.features.map((f) => (
                <li key={f} className="flex items-center gap-3 text-sm">
                  <span
                    className={`grid h-5 w-5 flex-shrink-0 place-items-center rounded-full ${
                      highlighted ? "bg-[#3b7fff]/20 text-[#7aa5ff]" : "bg-emerald-50 text-emerald-500"
                    }`}
                  >
                    <Icon name="check" className="h-3 w-3" strokeWidth={3} />
                  </span>
                  <span className={highlighted ? "text-neutral-200" : "text-neutral-600"}>{f}</span>
                </li>
              ))}
            </ul>

            <Link
              to="/login"
              className={`mt-7 flex w-full items-center justify-center rounded-full px-6 py-3 text-sm font-bold transition-transform hover:-translate-y-0.5 active:translate-y-0 ${
                highlighted
                  ? "bg-[#2563eb] text-white shadow-[0_16px_35px_-12px_rgba(37,99,235,0.7)] hover:bg-[#1d4ed8]"
                  : "bg-neutral-900 text-white hover:bg-neutral-800"
              }`}
            >
              {tier.cta}
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
