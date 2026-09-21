import { Box, Calculator, ShoppingBag, HardHat, Zap } from "lucide-react";
import { Reveal } from "./Reveal";

// Each card maps to a real shipped feature/route, not an aspirational one:
// Box -> /scan/lidar, /scan/360, /scan/draw + the 3D studio; Calculator ->
// the smeta engine; ShoppingBag -> /dokon; HardHat -> /ustalar; Zap -> the
// electrical/suvoq planning stages inside the studio.
const FEATURES = [
  {
    icon: Box,
    title: "3D'da ko'ring",
    desc: "Xonangizni LiDAR, 360° surat yoki qo'lda chizib skanerlang — natijani haqiqiy o'lchamda, real vaqtda 3D'da ko'ring.",
    big: true,
  },
  {
    icon: Calculator,
    title: "Aniq smeta",
    desc: "Har bir devor va sirt uchun avtomatik hisob-kitob — faqat kerakli materiallarga pul to'laysiz.",
  },
  {
    icon: ShoppingBag,
    title: "Bir joyda xarid",
    desc: "Do'kon bo'limidan kerakli materiallarni to'g'ridan-to'g'ri buyurtma qiling.",
  },
  {
    icon: HardHat,
    title: "Ishonchli ustalar",
    desc: "Tajribali ustalarni topib, ish narxini oldindan bilib oling.",
  },
  {
    icon: Zap,
    title: "Elektr va suvoq rejasi",
    desc: "Devordan elektr jihozlarigacha — har bir bosqich alohida rejalashtiriladi.",
  },
];

export function SolutionSection() {
  return (
    <section className="py-20 sm:py-28 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <Reveal className="max-w-2xl">
          <span className="text-primary font-bold text-sm uppercase tracking-wide">
            Yechim
          </span>
          <h2 className="mt-2 text-3xl sm:text-h2 font-extrabold text-neutral-900">
            Bitta ilova — loyihadan xaridgacha
          </h2>
        </Reveal>

        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(({ icon: Icon, title, desc, big }, i) => (
            <Reveal key={title} delayMs={i * 80} className={big ? "sm:col-span-2" : undefined}>
              <div
                className={`group rounded-3xl border border-border p-6 sm:p-7 transition-transform duration-normal hover:-translate-y-1 ${
                  big ? "bg-primary text-white" : "bg-paper text-neutral-900"
                }`}
              >
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-5 transition-transform duration-normal group-hover:scale-110 ${
                    big ? "bg-white/15" : "bg-white"
                  }`}
                >
                  <Icon className={`w-6 h-6 ${big ? "text-warning-bright" : "text-primary"}`} />
                </div>
                <h3 className="text-xl font-bold">{title}</h3>
                <p className={`mt-2 max-w-md ${big ? "text-white/75" : "text-muted"}`}>{desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
