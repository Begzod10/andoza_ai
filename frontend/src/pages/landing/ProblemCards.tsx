import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { useLang } from "./i18n";

// Same single brand hue (#2F55D4) on every card; only the light angle shifts a
// little so the four cards feel like a set rather than clones.
const ANGLES = [150, 165, 135, 155];

function Card({
  index,
  title,
  desc,
  reduce,
}: {
  index: number;
  title: string;
  desc: string;
  reduce: boolean;
}) {
  return (
    <motion.article
      variants={{
        hidden: reduce ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 40, scale: 0.94 },
        show: {
          opacity: 1,
          y: 0,
          scale: 1,
          transition: reduce ? { duration: 0 } : { type: "spring", stiffness: 130, damping: 16 },
        },
      }}
      whileHover={reduce ? undefined : { y: -8, scale: 1.02 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="relative flex h-full min-h-[277px] w-full max-w-[340px] flex-col overflow-hidden rounded-[28px] p-7 text-white"
      style={{
        background: `radial-gradient(120% 90% at 0% 0%, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 55%), linear-gradient(${ANGLES[index % 4]}deg,#6b8bf5 0%,#2F55D4 52%,#1b327f 100%)`,
        boxShadow:
          "0 34px 60px -30px rgba(31,58,158,0.75), 0 10px 20px -10px rgba(31,58,158,0.5), inset 0 1px 0 rgba(255,255,255,0.45), inset 0 0 0 1px rgba(255,255,255,0.12)",
      }}
    >
      <div
        className="pointer-events-none absolute -right-14 -top-16 h-44 w-44 rounded-full opacity-60 blur-2xl"
        style={{ background: "radial-gradient(circle, rgba(140,165,255,0.55), transparent 70%)" }}
      />
      {!reduce && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12"
          style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)" }}
          animate={{ x: ["0%", "560%"] }}
          transition={{ duration: 1.5, ease: "easeInOut", repeat: Infinity, repeatDelay: 6, delay: 2 + index * 0.9 }}
        />
      )}

      <div className="relative flex flex-1 flex-col justify-between gap-6">
        <h3 className="text-[22px] font-extrabold leading-snug tracking-tight">{title}</h3>
        <div>
          <div className="mb-4 h-px w-full bg-gradient-to-r from-white/35 via-white/15 to-transparent" />
          <p className="min-h-[3.5rem] text-[15px] leading-relaxed text-white/80">{desc}</p>
        </div>
      </div>
    </motion.article>
  );
}

/** The four renovation pain points as four brand-blue gradient flashcards. */
export default function ProblemCards({ className }: { className?: string }) {
  const { t } = useLang();
  const reduce = useReducedMotion() ?? false;
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.25 });

  return (
    <motion.div
      ref={ref}
      className={`grid grid-cols-1 justify-center justify-items-center gap-6 sm:grid-cols-[repeat(2,340px)] ${className ?? ""}`}
      initial="hidden"
      animate={inView ? "show" : "hidden"}
      variants={{ show: { transition: { staggerChildren: reduce ? 0 : 0.15 } } }}
    >
      {t.problem.items.map((item, i) => (
        <Card key={item.title} index={i} title={item.title} desc={item.desc} reduce={reduce} />
      ))}
    </motion.div>
  );
}
