import { Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Reveal } from "./Reveal";
import { GridBackdrop } from "./GridBackdrop";

// Plan lineup as defined in the AndozaAI pitch deck. Billing isn't wired up
// in the product yet, so every CTA routes into the free flow today — see
// the disclosure line below the cards.
const TIERS = [
  {
    id: "start",
    name: "START",
    tagline: "Birinchi loyihangiz uchun",
    price: "Bepul",
    period: "",
    rooms: "1 xona",
    features: ["3D xona dizayni", "Render", "Smeta hisob-kitobi"],
    cta: "Bepul boshlash",
    highlight: false,
  },
  {
    id: "pro",
    name: "PRO",
    tagline: "Innovatsiyani his qiling",
    price: "299 000",
    period: "so'm/oy",
    rooms: "2 xona",
    features: ["2 xona dizayni", "Render + 2 variant", "Avtomatik smeta"],
    cta: "PRO tanlash",
    highlight: true,
    badge: "Ommabop",
  },
  {
    id: "max",
    name: "MAX",
    tagline: "Butun uy uchun",
    price: "999 000",
    period: "so'm/oy",
    rooms: "5–8 xona",
    features: ["5–8 xona 3D dizayni", "Butun uy loyihasi", "Batafsil smeta"],
    cta: "MAX tanlash",
    highlight: false,
    badge: "Eng foydali",
  },
];

export function PricingSection() {
  const navigate = useNavigate();

  return (
    <section className="py-20 sm:py-28 bg-primary text-white relative overflow-hidden">
      <GridBackdrop className="landing-grid-drift" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 relative">
        <Reveal className="max-w-2xl">
          <span className="text-warning-bright font-bold text-sm uppercase tracking-wide">
            Tariflar
          </span>
          <h2 className="mt-2 text-3xl sm:text-h2 font-extrabold">
            Har bir loyiha uchun mos reja
          </h2>
        </Reveal>

        <div className="mt-12 grid sm:grid-cols-3 gap-6">
          {TIERS.map((t, i) => (
            <Reveal key={t.id} delayMs={i * 100}>
              <div
                className={`relative rounded-3xl p-7 flex flex-col transition-transform duration-normal hover:-translate-y-1.5 ${
                  t.highlight
                    ? "bg-white text-neutral-900 shadow-2xl sm:scale-[1.03]"
                    : "bg-white/5 border border-white/15"
                }`}
              >
                {t.highlight && <div aria-hidden="true" className="landing-shimmer-sweep" />}
                {t.badge && (
                  <span className="landing-float absolute -top-3 right-6 bg-orange text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg shadow-orange/40">
                    {t.badge}
                  </span>
                )}
                <h3 className="font-extrabold text-lg">{t.name}</h3>
                <p className={`text-sm mt-1 ${t.highlight ? "text-muted" : "text-white/60"}`}>
                  {t.tagline}
                </p>
                <div
                  className={`mt-5 rounded-xl p-4 ${t.highlight ? "bg-paper" : "bg-white/10"}`}
                >
                  <p className="font-bold">{t.rooms}</p>
                </div>
                <div className="mt-5">
                  <span className="text-3xl font-extrabold">{t.price}</span>
                  {t.period && (
                    <span
                      className={`ml-1 text-sm ${t.highlight ? "text-muted" : "text-white/60"}`}
                    >
                      {t.period}
                    </span>
                  )}
                </div>
                <ul className="mt-5 space-y-2 flex-1">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <Check
                        className={`w-4 h-4 flex-shrink-0 ${
                          t.highlight ? "text-success" : "text-warning-bright"
                        }`}
                      />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  size="lg"
                  className={`mt-6 w-full hover:scale-[1.03] transition-transform ${
                    t.highlight
                      ? "!bg-orange !text-white hover:!bg-orange/90"
                      : "!bg-white !text-primary hover:!bg-white/90"
                  }`}
                  onClick={() => navigate("/projects")}
                >
                  {t.cta}
                </Button>
              </div>
            </Reveal>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-white/50">
          Tariflar tez orada faollashtiriladi — hozircha barcha imkoniyatlar bepul.
        </p>
      </div>
    </section>
  );
}
