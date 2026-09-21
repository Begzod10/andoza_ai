import { EyeOff, Calculator, ShoppingCart, HardHat, PackageX } from "lucide-react";
import { Reveal } from "./Reveal";

const PAINS = [
  {
    icon: EyeOff,
    title: "Ko'rmay turib to'laysiz",
    desc: "Pulini to'lashdan oldin natijani ko'ra olmaysiz.",
  },
  {
    icon: Calculator,
    title: "Byudjet — taxmin",
    desc: "Necha pul ketishini hech kim aniq aytolmaydi.",
  },
  {
    icon: ShoppingCart,
    title: "Xarid tarqoq",
    desc: "Har bir material uchun alohida do'kon, alohida narx.",
  },
  {
    icon: HardHat,
    title: "Usta shaffof emas",
    desc: "Qancha ish, qancha material ketganini bilmaysiz.",
  },
  {
    icon: PackageX,
    title: "Isrofgarchilik",
    desc: "Noto'g'ri hisoblangan miqdor — ortiqcha xarajat.",
  },
];

export function ProblemSection() {
  return (
    <section className="py-20 sm:py-28 bg-paper">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <Reveal className="max-w-2xl">
          <span className="text-orange font-bold text-sm uppercase tracking-wide">
            Muammo
          </span>
          <h2 className="mt-2 text-3xl sm:text-h2 font-extrabold text-neutral-900">
            Ta'mir — bu doim noaniqlik
          </h2>
        </Reveal>

        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {PAINS.map(({ icon: Icon, title, desc }, i) => (
            <Reveal key={title} delayMs={i * 80}>
              <div className="rounded-2xl bg-white border border-border p-5 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-normal">
                <div className="w-11 h-11 rounded-xl bg-primary-tint flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-bold text-neutral-900">{title}</h3>
                <p className="mt-1.5 text-sm text-muted">{desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
