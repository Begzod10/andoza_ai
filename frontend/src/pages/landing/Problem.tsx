import { useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { useLang } from "./i18n";
import Reveal from "./Reveal";

// Small per-note character: tilt + pin colour. A contained grid (not absolute
// scatter) guarantees every note stays inside the board at any text length.
const TILT = [-2.5, 2, -1.5, 2.5];
const PIN_COLORS = ["#ef4444", "#f59e0b", "#e11d48", "#ef4444"];

// Red string segments (viewBox 0..100). Drawn one after another once the notes
// have landed. Plain <line>s (not a dashed path) so `non-scaling-stroke` keeps
// working under preserveAspectRatio="none".
const STRINGS = [
  { x1: 27, y1: 19, x2: 73, y2: 21 },
  { x1: 27, y1: 19, x2: 27, y2: 66 },
  { x1: 73, y1: 21, x2: 73, y2: 68 },
  { x1: 73, y1: 21, x2: 27, y2: 66 },
  { x1: 27, y1: 66, x2: 73, y2: 68 },
];

const NOTE_STAGGER = 0.16; // s between notes
const STRINGS_START = 0.35 + 3 * NOTE_STAGGER + 0.45; // after the last note settles

function Pin({ color, delay, still }: { color: string; delay: number; still: boolean }) {
  return (
    <motion.span
      className="absolute -top-3 left-1/2 z-20 -ml-[9px]"
      aria-hidden
      variants={{
        hidden: { scale: still ? 1 : 0, y: still ? 0 : -10 },
        show: {
          scale: 1,
          y: 0,
          transition: { delay, type: "spring", stiffness: 520, damping: 14 },
        },
      }}
    >
      <span
        className="block h-[18px] w-[18px] rounded-full"
        style={{
          background: `radial-gradient(circle at 35% 28%, #fff 0 2px, ${color} 3.5px, ${color} 70%, rgba(0,0,0,0.25) 100%)`,
          boxShadow: "0 4px 7px -1px rgba(0,0,0,0.5)",
        }}
      />
    </motion.span>
  );
}

function FlipIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 11a8 8 0 0 0-14.5-4.3L4 8.5" />
      <path d="M4 4v4.5h4.5" />
      <path d="M4 13a8 8 0 0 0 14.5 4.3L20 15.5" />
      <path d="M20 20v-4.5h-4.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

interface NoteProps {
  index: number;
  title: string;
  desc: string;
  fixTitle: string;
  fixDesc: string;
  color: string;
  tilt: number;
  still: boolean;
}

function Note({ index, title, desc, fixTitle, fixDesc, color, tilt, still }: NoteProps) {
  const [flipped, setFlipped] = useState(false);
  const delay = 0.35 + index * NOTE_STAGGER;

  return (
    <motion.div
      className="relative w-full max-w-[280px]"
      variants={{
        // the note is "thrown" onto the board from above, overshooting its tilt
        hidden: still
          ? { opacity: 1, y: 0, rotate: tilt }
          : { opacity: 0, y: -140, rotate: tilt * 4, scale: 1.12 },
        show: {
          opacity: 1,
          y: 0,
          rotate: tilt,
          scale: 1,
          transition: still
            ? { duration: 0 }
            : {
                delay,
                type: "spring",
                stiffness: 150,
                damping: 13,
                mass: 0.9,
                opacity: { duration: 0.25, delay },
              },
        },
      }}
    >
      <Pin color={color} delay={delay + 0.3} still={still} />

      {/* hover lift is its own layer so it never fights the entrance spring */}
      <motion.div
        whileHover={still ? undefined : { y: -6, rotate: -tilt * 0.4 }}
        whileTap={still ? undefined : { scale: 0.97 }}
        transition={{ type: "spring", stiffness: 300, damping: 18 }}
        style={{ perspective: 900 }}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => setFlipped((f) => !f)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setFlipped((f) => !f);
            }
          }}
          aria-pressed={flipped}
          aria-label={`${title} → ${fixTitle}`}
          className="group relative block w-full cursor-pointer select-none rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-[#2F55D4] focus-visible:ring-offset-2 focus-visible:ring-offset-[#c7a46a]"
        >
          <motion.div
            className="relative"
            style={{ transformStyle: "preserve-3d" }}
            animate={{ rotateY: flipped ? 180 : 0 }}
            transition={still ? { duration: 0 } : { type: "spring", stiffness: 110, damping: 15 }}
          >
            {/* ── front: the pain point (yellow sticky note) ── */}
            <div
              className="relative overflow-hidden rounded-xl px-6 pb-7 pt-8"
              style={{
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
                background: "linear-gradient(150deg,#fffbe6 0%,#ffe884 55%,#ffdd5c 100%)",
                boxShadow:
                  "0 18px 30px -14px rgba(40,30,0,0.45), 0 3px 8px -3px rgba(40,30,0,0.3), inset 0 1px 0 rgba(255,255,255,0.6)",
              }}
            >
              {/* faint ruled lines for a real paper feel */}
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.07]"
                style={{ backgroundImage: "repeating-linear-gradient(transparent 0 22px, #6b5200 22px 23px)" }}
              />
              <h3 className="relative pr-6 text-[17px] font-bold tracking-tight text-[#3a2e05]">{title}</h3>
              <p className="relative mt-2 text-sm leading-relaxed text-[#5f4e12]">{desc}</p>
              {/* flip hint — gently pulses so the card reads as interactive */}
              <motion.span
                className="absolute right-3 top-3 text-[#6b5200]/60 transition-colors group-hover:text-[#6b5200]"
                animate={still ? undefined : { rotate: [0, 0, 180, 180, 360] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 3 + index * 0.4 }}
              >
                <FlipIcon />
              </motion.span>
              {/* soft peeled corner */}
              <span
                className="pointer-events-none absolute bottom-0 right-0 h-6 w-6"
                style={{ background: "linear-gradient(135deg, transparent 50%, rgba(120,90,0,0.22) 50%)" }}
              />
            </div>

            {/* ── back: the Andoza fix (brand-blue card) ── */}
            <div
              className="absolute inset-0 flex flex-col overflow-hidden rounded-xl px-6 pb-7 pt-8 text-white"
              style={{
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
                background: "linear-gradient(150deg,#5b7df0 0%,#2F55D4 60%,#2445b3 100%)",
                boxShadow:
                  "0 18px 30px -14px rgba(20,35,110,0.55), 0 3px 8px -3px rgba(20,35,110,0.4), inset 0 1px 0 rgba(255,255,255,0.35)",
              }}
            >
              <span className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
                <CheckIcon />
              </span>
              <h3 className="pr-9 text-[17px] font-bold tracking-tight">{fixTitle}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/85">{fixDesc}</p>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function Problem() {
  const { t } = useLang();
  const items = t.problem.items;
  const reduce = useReducedMotion() ?? false;
  const boardRef = useRef<HTMLDivElement | null>(null);
  const inView = useInView(boardRef, { once: true, amount: 0.3 });

  return (
    <section className="relative z-10 mx-auto max-w-6xl px-6 py-20 sm:py-24">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
          {t.problem.heading}
        </h2>
      </Reveal>

      {/* ── Modern evidence board: notes in a contained grid, tied with string ── */}
      <motion.div
        ref={boardRef}
        className="relative mt-14 overflow-hidden rounded-[28px] p-5 sm:p-8"
        initial="hidden"
        animate={inView ? "show" : "hidden"}
        style={{
          background: "linear-gradient(160deg,#caa877 0%,#b8945c 55%,#a07c42 100%)",
          boxShadow: "0 36px 70px -34px rgba(60,40,10,0.55), inset 0 2px 3px rgba(255,255,255,0.22)",
        }}
      >
        {/* refined cork texture */}
        <div
          className="pointer-events-none absolute inset-3 rounded-[20px]"
          style={{
            backgroundColor: "#c7a46a",
            backgroundImage:
              "radial-gradient(rgba(90,60,20,0.22) 1px, transparent 1.7px), radial-gradient(rgba(255,244,214,0.18) 1px, transparent 1.7px)",
            backgroundSize: "13px 13px, 21px 21px",
            backgroundPosition: "0 0, 7px 10px",
            boxShadow: "inset 0 0 60px rgba(70,46,14,0.5), inset 0 0 0 1px rgba(255,255,255,0.08)",
          }}
        />

        {/* red string web connecting the four pin areas (2×2 grid); each strand is drawn in turn */}
        <svg
          className="pointer-events-none absolute inset-0 hidden h-full w-full sm:block"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ filter: "drop-shadow(0 1.5px 1.5px rgba(0,0,0,0.45))" }}
          aria-hidden
        >
          {STRINGS.map((s, i) => (
            <motion.line
              key={i}
              x1={s.x1}
              y1={s.y1}
              stroke="#dc2626"
              strokeWidth="1.8"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              opacity="0.9"
              variants={{
                hidden: reduce ? { x2: s.x2, y2: s.y2 } : { x2: s.x1, y2: s.y1 },
                show: {
                  x2: s.x2,
                  y2: s.y2,
                  transition: reduce
                    ? { duration: 0 }
                    : { delay: STRINGS_START + i * 0.22, duration: 0.7, ease: [0.22, 1, 0.36, 1] },
                },
              }}
            />
          ))}
        </svg>

        {/* the notes — grid keeps them inside the board at any length */}
        <div className="relative z-10 grid grid-cols-1 justify-items-center gap-x-10 gap-y-12 py-4 sm:grid-cols-2 sm:py-6">
          {items.map((item, i) => (
            <Note
              key={item.title}
              index={i}
              title={item.title}
              desc={item.desc}
              fixTitle={item.fixTitle}
              fixDesc={item.fixDesc}
              color={PIN_COLORS[i % PIN_COLORS.length]}
              tilt={TILT[i % TILT.length]}
              still={reduce}
            />
          ))}
        </div>
      </motion.div>
    </section>
  );
}
