import { useLang } from "./i18n";
import { Icon, type IconName } from "./icons";
import Reveal from "./Reveal";

const ICONS: IconName[] = ["scan", "palette", "calculator"];

export default function HowItWorks() {
  const { t } = useLang();

  return (
    <section
      id="how"
      className="relative z-10 mx-auto max-w-6xl scroll-mt-24 px-6 py-20 sm:py-24"
    >
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
          {t.how.heading}
        </h2>
      </Reveal>

      <div className="relative mt-14">
        {/* connecting line (desktop) */}
        <div
          aria-hidden
          className="absolute left-0 right-0 top-7 hidden h-px bg-gradient-to-r from-transparent via-[#3b7fff]/30 to-transparent lg:block"
        />
        <div className="grid gap-10 lg:grid-cols-3 lg:gap-8">
          {t.how.steps.map((step, i) => (
            <Reveal key={step.title} delay={i * 0.12} className="relative text-center lg:px-4">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#2563eb] text-white shadow-[0_16px_35px_-12px_rgba(37,99,235,0.7)] ring-4 ring-white">
                <span className="text-lg font-extrabold">{i + 1}</span>
              </div>
              <div className="mt-5 flex items-center justify-center gap-2">
                <Icon name={ICONS[i]} className="h-5 w-5 text-[#2563eb]" />
                <h3 className="text-lg font-bold text-neutral-900">{step.title}</h3>
              </div>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-neutral-500">
                {step.desc}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
