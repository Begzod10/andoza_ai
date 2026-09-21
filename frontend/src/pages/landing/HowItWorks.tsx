import { Reveal } from "./Reveal";

const STEPS = [
  {
    n: "01",
    title: "Xonani skanerlang",
    desc: "LiDAR, 360° surat yoki qo'lda chizib o'lchamlarini kiriting.",
  },
  {
    n: "02",
    title: "Dizaynni soling",
    desc: "Suvoq, bo'yoq, mebel va yoritishni 3D'da sozlang.",
  },
  {
    n: "03",
    title: "Smetani oling",
    desc: "Aniq miqdor va narx bilan avtomatik hisob-kitob.",
  },
  {
    n: "04",
    title: "Sotib oling yoki ustani chaqiring",
    desc: "Do'kon yoki Ustalar bo'limidan davom eting.",
  },
];

export function HowItWorks() {
  return (
    <section id="qanday-ishlaydi" className="py-20 sm:py-28 bg-paper">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <Reveal className="max-w-2xl">
          <span className="text-orange font-bold text-sm uppercase tracking-wide">
            Qanday ishlaydi
          </span>
          <h2 className="mt-2 text-3xl sm:text-h2 font-extrabold text-neutral-900">
            4 qadamda — rejadan xaridgacha
          </h2>
        </Reveal>

        <ol className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} as="li" delayMs={i * 100} className="relative pl-1">
              <span className="text-5xl font-extrabold text-primary/15" aria-hidden="true">
                {s.n}
              </span>
              <h3 className="mt-2 font-bold text-neutral-900">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted">{s.desc}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
