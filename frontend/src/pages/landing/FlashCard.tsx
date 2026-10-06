import { useEffect, useRef } from "react";
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";

export interface FlashCardProps {
  /** big number, e.g. 24 */
  value?: number;
  /** unit rendered small next to the number */
  unit?: string;
  label?: string;
  tags?: string[];
  priceLabel?: string;
  price?: string;
  note?: string;
  className?: string;
}

/**
 * Modern glass flashcard in the Andoza brand blue (#2F55D4) only — a single hue
 * family, lit from the top-left. Count-up number, staggered chips, a slow gloss
 * sweep and a gentle pointer tilt. All motion is skipped for reduced-motion users.
 */
export default function FlashCard({
  value = 24,
  unit = "m²",
  label = "Yashash xonasi",
  tags = ["Pol", "Devor", "Shift", "Mebel", "Yorug'lik", "Parda"],
  priceLabel = "Taxminiy smeta",
  price = "18 mln so'm",
  note = "3D hisob-kitob · bir necha daqiqada",
  className,
}: FlashCardProps) {
  const reduce = useReducedMotion() ?? false;
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });

  // count-up
  const count = useMotionValue(reduce ? value : 0);
  const rounded = useTransform(count, (v) => Math.round(v).toString());
  useEffect(() => {
    if (!inView || reduce) return;
    const controls = animate(count, value, { duration: 1.4, delay: 0.25, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [inView, reduce, count, value]);

  // pointer tilt
  const rx = useSpring(0, { stiffness: 160, damping: 16 });
  const ry = useSpring(0, { stiffness: 160, damping: 16 });
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType === "touch") return;
    const r = e.currentTarget.getBoundingClientRect();
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 10);
    rx.set(-((e.clientY - r.top) / r.height - 0.5) * 10);
  };
  const onLeave = () => {
    rx.set(0);
    ry.set(0);
  };

  return (
    <div className={className} style={{ perspective: 1000 }}>
      <motion.div
        ref={ref}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        initial={reduce ? false : { opacity: 0, y: 28, scale: 0.96 }}
        animate={inView || reduce ? { opacity: 1, y: 0, scale: 1 } : undefined}
        transition={{ type: "spring", stiffness: 120, damping: 16 }}
        style={{
          rotateX: rx,
          rotateY: ry,
          transformStyle: "preserve-3d",
          background:
            "radial-gradient(120% 90% at 0% 0%, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 55%), linear-gradient(150deg,#6b8bf5 0%,#2F55D4 52%,#1b327f 100%)",
          boxShadow:
            "0 40px 70px -32px rgba(31,58,158,0.75), 0 12px 24px -12px rgba(31,58,158,0.5), inset 0 1px 0 rgba(255,255,255,0.45), inset 0 0 0 1px rgba(255,255,255,0.12)",
        }}
        className="relative w-full max-w-[340px] overflow-hidden rounded-[28px] p-7 text-white"
      >
        {/* soft glow blobs, same hue only */}
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full opacity-60 blur-2xl"
          style={{ background: "radial-gradient(circle, rgba(140,165,255,0.55), transparent 70%)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full opacity-50 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(20,40,120,0.9), transparent 70%)" }}
        />

        {/* gloss sweep */}
        {!reduce && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12"
            style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)" }}
            animate={{ x: ["0%", "480%"] }}
            transition={{ duration: 1.6, ease: "easeInOut", repeat: Infinity, repeatDelay: 4.5, delay: 1.8 }}
          />
        )}

        <div className="relative">
          <div className="flex items-end gap-1.5 leading-none">
            <motion.span className="text-[64px] font-extrabold tracking-tight tabular-nums">{rounded}</motion.span>
            <span className="pb-2 text-2xl font-bold text-white/80">{unit}</span>
          </div>
          <p className="mt-2 text-[15px] font-medium text-white/85">{label}</p>

          <motion.ul
            className="mt-5 flex flex-wrap gap-2"
            initial={reduce ? false : "hidden"}
            animate={inView || reduce ? "show" : "hidden"}
            variants={{ show: { transition: { delayChildren: 0.7, staggerChildren: 0.07 } } }}
          >
            {tags.map((tag) => (
              <motion.li
                key={tag}
                variants={{
                  hidden: { opacity: 0, y: 8, scale: 0.9 },
                  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 300, damping: 18 } },
                }}
                className="rounded-full border border-white/25 bg-white/15 px-3.5 py-1.5 text-[13px] font-semibold backdrop-blur-sm"
              >
                {tag}
              </motion.li>
            ))}
          </motion.ul>

          <div className="mt-6 h-px w-full bg-gradient-to-r from-white/35 via-white/15 to-transparent" />

          <p className="mt-5 text-xs font-medium uppercase tracking-wider text-white/65">{priceLabel}</p>
          <motion.p
            className="mt-1 text-[28px] font-extrabold tracking-tight"
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={inView || reduce ? { opacity: 1, y: 0 } : undefined}
            transition={{ delay: 1.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            {price}
          </motion.p>
          <p className="mt-3 text-xs font-semibold text-white/70">{note}</p>
        </div>
      </motion.div>
    </div>
  );
}
