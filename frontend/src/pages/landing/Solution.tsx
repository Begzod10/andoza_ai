import { useLang } from "./i18n";
import { Icon, type IconName } from "./icons";
import Reveal from "./Reveal";

const ICONS: IconName[] = ["scan", "palette", "calculator", "bag", "users", "steps"];

export default function Solution() {
  const { t } = useLang();

  return (
    <section className="relative z-10 mx-auto max-w-6xl px-6 py-20 sm:py-24">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
          {t.solution.heading}
        </h2>
      </Reveal>

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {t.solution.items.map((item, i) => (
          <Reveal
            key={item.title}
            delay={(i % 3) * 0.08}
            className="group relative overflow-hidden rounded-2xl bg-white/85 p-6 ring-1 ring-black/5 backdrop-blur shadow-[0_22px_50px_-24px_rgba(30,41,59,0.35)] transition-transform hover:-translate-y-1"
          >
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-blue-50 text-[#2563eb] ring-1 ring-blue-100">
              <Icon name={ICONS[i]} className="h-6 w-6" />
            </span>
            <h3 className="mt-4 text-lg font-bold text-neutral-900">{item.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-neutral-500">{item.desc}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
