import { useEffect, useRef } from "react";
import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useLang } from "./i18n";

/**
 * The four renovation pain points on a single brand-blue gradient flashcard.
 * Same visual language as FlashCard (one hue, glass chips, gloss sweep), but
 * the body is a numbered list that reveals row by row. Text comes from i18n,
 * so it follows the UZ/RU/EN switch.
 */
export default function ProblemCard({ className }: { className?: string }) {
  const { t } = useLang();
  const items = t.problem.items;
  const reduce = useReducedMotion() ?? false;
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.35 });

  const count = useMotionValue(reduce ? items.length : 0);
  const rounded = useTransform(count, (v) => Math.round(v).toString());
  useEffect(() => {
    if (!inView || reduce) return;
    const c = animate(count, items.length, { duration: 0.9, delay: 0.2, ease: "easeOut" });
    return () => c.stop();
  }, [inView, reduce, count, items.length]);

  return (
    <div className={className}>
      <motion.div
        ref={ref}
        initial={reduce ? false : { opacity: 0, y: 28, scale: 0.96 }}
        animate={inView || reduce ? { opacity: 1, y: 0, scale: 1 } : undefined}
        transition={{ type: "spring", stiffness: 120, damping: 16 }}
        className="relative w-full max-w-[400px] overflow-hidden rounded-[28px] p-7 text-white"
        style={{
          background:
            "radial-gradient(120% 90% at 0% 0%, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 55%), linear-gradient(150deg,#6b8bf5 0%,#2F55D4 52%,#1b327f 100%)",
          boxShadow:
            "0 40px 70px -32px rgba(31,58,158,0.75), 0 12px 24px -12px rgba(31,58,158,0.5), inset 0 1px 0 rgba(255,255,255,0.45), inset 0 0 0 1px rgba(255,255,255,0.12)",
        }}
      >
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full opacity-60 blur-2xl"
          style={{ background: "radial-gradient(circle, rgba(140,165,255,0.55), transparent 70%)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full opacity-50 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(20,40,120,0.9), transparent 70%)" }}
        />
        {!reduce && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12"
            style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)" }}
            animate={{ x: ["0%", "560%"] }}
            transition={{ duration: 1.6, ease: "easeInOut", repeat: Infinity, repeatDelay: 5, delay: 2.2 }}
          />
        )}

        <div className="relative">
          <div className="flex items-center gap-4">
            <motion.span className="text-[64px] font-extrabold leading-none tracking-tight tabular-nums">
              {rounded}
            </motion.span>
            <h3 className="text-[17px] font-bold leading-snug tracking-tight text-white/95">{t.problem.heading}</h3>
          </div>

          <div className="mt-5 h-px w-full bg-gradient-to-r from-white/35 via-white/15 to-transparent" />

          <motion.ol
            className="mt-2"
            initial={reduce ? false : "hidden"}
            animate={inView || reduce ? "show" : "hidden"}
            variants={{ show: { transition: { delayChildren: 0.5, staggerChildren: 0.14 } } }}
          >
            {items.map((item, i) => (
              <motion.li
                key={item.title}
                variants={{
                  hidden: { opacity: 0, x: -14 },
                  show: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 220, damping: 20 } },
                }}
                className="flex gap-3.5 border-b border-white/10 py-4 last:border-b-0 last:pb-1"
              >
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/15 text-[13px] font-bold backdrop-blur-sm">
                  {i + 1}
                </span>
                <div>
                  <p className="text-[15px] font-bold leading-snug">{item.title}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-white/75">{item.desc}</p>
                </div>
              </motion.li>
            ))}
          </motion.ol>
        </div>
      </motion.div>
    </div>
  );
}
