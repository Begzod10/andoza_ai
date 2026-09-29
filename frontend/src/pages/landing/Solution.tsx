import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { useLang } from "./i18n";
import Reveal from "./Reveal";

// Seconds before the papers start coming out — leaves time to watch the drawer
// slide forward first.
const OPEN = 1.0;

// ── A 3D-ish metal filing-cabinet drawer with orange folders inside ─────────
function Drawer() {
  return (
    <svg viewBox="0 0 240 190" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="dw-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eef1f5" />
          <stop offset="0.5" stopColor="#c3c9d2" />
          <stop offset="1" stopColor="#9aa1ab" />
        </linearGradient>
        <linearGradient id="dw-side" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#aab1bb" />
          <stop offset="1" stopColor="#7d848e" />
        </linearGradient>
        <linearGradient id="dw-handle" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4f6f9" />
          <stop offset="1" stopColor="#8b929c" />
        </linearGradient>
        <linearGradient id="dw-fold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fb923c" />
          <stop offset="1" stopColor="#ea6a12" />
        </linearGradient>
      </defs>

      {/* soft ground shadow */}
      <ellipse cx="122" cy="178" rx="96" ry="9" fill="#7a8494" opacity="0.4" />

      {/* interior (opening) */}
      <path d="M42 92 L188 92 L220 64 L74 64 Z" fill="#5b616b" />
      <path d="M42 92 L188 92 L188 96 L42 96 Z" fill="#3f444c" />

      {/* folders standing inside — grey dividers + orange leaning folder */}
      <g>
        <path d="M86 66 L150 66 L156 60 L92 60 Z" fill="#c9ced6" />
        <path d="M96 65 L160 65 L166 58 L102 58 Z" fill="#bcc2cb" />
        <path d="M106 64 L170 64 L176 56 L112 56 Z" fill="#aeb4be" />
        {/* the raised orange folder */}
        <path d="M96 70 L176 44 L200 52 L120 78 Z" fill="url(#dw-fold)" />
        <path d="M120 78 L200 52 L200 60 L120 86 Z" fill="#c85a10" />
        <path d="M96 70 L120 78 L120 86 L96 78 Z" fill="#d9631a" />
      </g>

      {/* right side panel (depth) */}
      <path d="M188 92 L220 64 L220 120 L188 150 Z" fill="url(#dw-side)" />

      {/* front face */}
      <rect x="42" y="92" width="146" height="58" rx="6" fill="url(#dw-front)" />
      <rect x="42" y="92" width="146" height="6" rx="3" fill="#ffffff" opacity="0.4" />

      {/* label holder */}
      <rect x="96" y="104" width="38" height="15" rx="2.5" fill="#ffffff" stroke="#8b929c" strokeWidth="1" />
      <rect x="99" y="108" width="32" height="2.4" rx="1.2" fill="#c9ced6" />
      <rect x="99" y="112.5" width="24" height="2.4" rx="1.2" fill="#d7dbe1" />

      {/* handle */}
      <rect x="86" y="130" width="58" height="10" rx="5" fill="url(#dw-handle)" stroke="#767d87" strokeWidth="1" />
      <rect x="90" y="132.5" width="50" height="3" rx="1.5" fill="#ffffff" opacity="0.55" />
    </svg>
  );
}

// ── Clips ───────────────────────────────────────────────────────────────────
function PaperClip({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 26 46" className={className} fill="none" aria-hidden>
      <path
        d="M8 12 V33 a5 5 0 0 0 10 0 V9 a8 8 0 0 0 -16 0 V34 a11 11 0 0 0 22 0 V14"
        stroke="#b9c0c9"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M8 12 V33 a5 5 0 0 0 10 0 V9 a8 8 0 0 0 -16 0 V34 a11 11 0 0 0 22 0 V14"
        stroke="#eef1f5"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BinderClip({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 34" className={className} fill="none" aria-hidden>
      <path d="M9 15 L20 3 L31 15" stroke="#c7ccd3" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M6 14 L34 14 L30 31 A3 3 0 0 1 27 33 H13 A3 3 0 0 1 10 31 Z" fill="#2b2f36" />
      <rect x="15" y="11" width="10" height="4" rx="2" fill="#3f444c" />
    </svg>
  );
}

export default function Solution() {
  const { t } = useLang();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15% 0px -15% 0px" });
  const reduced = useReducedMotion();
  const open = inView || reduced;

  // Papers rise up out of the drawer, converging from their column, then settle.
  const paper = {
    hidden: (i: number) => ({
      opacity: 0,
      scale: 0.45,
      y: -150,
      x: (1 - (i % 3)) * 120,
      rotate: i % 2 ? 6 : -6,
    }),
    open: {
      opacity: 1,
      scale: 1,
      y: 0,
      x: 0,
      rotate: 0,
      transition: { type: "spring" as const, stiffness: 260, damping: 24, mass: 0.9 },
    },
  };

  const container = {
    hidden: {},
    open: { transition: { delayChildren: reduced ? 0 : OPEN, staggerChildren: reduced ? 0.03 : 0.14 } },
  };

  return (
    <section ref={ref} className="relative z-10 mx-auto max-w-6xl px-6 py-20 sm:py-24">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
          {t.solution.heading}
        </h2>
      </Reveal>

      <div className="relative mt-14 flex flex-col items-center" style={{ perspective: 1000 }}>
        {/* the drawer slides forward toward the viewer on scroll */}
        <motion.div
          className="relative z-20 mb-10 w-56 sm:w-64"
          initial={reduced ? false : { scale: 0.82, y: -26, opacity: 0, rotateX: 12 }}
          animate={open ? { scale: 1, y: 0, opacity: 1, rotateX: 0 } : {}}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          style={{ transformOrigin: "50% 100%" }}
        >
          <Drawer />
        </motion.div>

        {/* the papers that come out of the drawer, each held by a clip */}
        <motion.div
          className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          variants={container}
          initial="hidden"
          animate={open ? "open" : "hidden"}
        >
          {t.solution.items.map((item, i) => (
            <motion.div key={item.title} custom={i} variants={paper} className="relative flex justify-center">
              {/* clip (alternating paper clip / binder clip) */}
              {i % 2 === 0 ? (
                <PaperClip className="absolute -top-4 left-8 z-20 h-11 w-6 drop-shadow-[0_3px_3px_rgba(0,0,0,0.3)]" />
              ) : (
                <BinderClip className="absolute -top-3 left-1/2 z-20 h-9 w-11 -translate-x-1/2 drop-shadow-[0_3px_3px_rgba(0,0,0,0.35)]" />
              )}

              {/* manila folder with a white paper peeking, info printed on it */}
              <div className="relative w-full max-w-[19rem]">
                {/* folder tab */}
                <span
                  className="absolute -top-3 right-8 h-4 w-20 rounded-t-md"
                  style={{ background: "linear-gradient(180deg,#e9d7a6,#dcc588)" }}
                />
                {/* white paper edge behind */}
                <div className="absolute inset-x-3 -top-1 bottom-3 rounded-sm bg-white shadow-[0_10px_20px_-12px_rgba(0,0,0,0.4)]" />
                {/* manila folder face */}
                <div
                  className="relative rounded-md p-6 shadow-[0_20px_36px_-16px_rgba(0,0,0,0.5)] ring-1 ring-black/5"
                  style={{
                    background: "linear-gradient(160deg,#f2e4bd 0%,#e6d3a2 100%)",
                  }}
                >
                  <h3 className="text-lg font-bold text-[#3a3323]">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[#6b6046]">{item.desc}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
