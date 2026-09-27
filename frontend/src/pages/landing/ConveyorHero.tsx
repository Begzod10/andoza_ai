/*
   ConveyorHero — the AndozaAI machine on a conveyor.

   Problems ride in from the LEFT, travel across the belt and pass THROUGH the
   AndozaAI machine (behind it) to the right. When the block is scrolled into
   view, every problem is also collected into a list that sits BELOW the belt.
*/
import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { useLang } from "./i18n";

const BELT_DUR = 15; // seconds for one chip to cross the belt

function MachineCard() {
  return (
    <div className="conveyor-machine group" data-active="true">
      <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-b from-white to-[#f3f6fc] p-4 shadow-[0_34px_70px_-26px_rgba(30,64,175,0.55)] ring-1 ring-black/5">
        <div className="conveyor-sweep pointer-events-none absolute inset-0" aria-hidden />
        <div className="conveyor-glow pointer-events-none absolute inset-0" aria-hidden />

        <div className="relative flex items-center justify-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#eaf1ff] ring-1 ring-[#3b7fff]/20">
            <img src="/icon.svg" alt="" className="h-5 w-5" />
          </span>
          <span className="text-[15px] font-extrabold tracking-tight text-neutral-900">
            Andoza<span className="text-[#2563eb]">AI</span>
          </span>
        </div>

        <div className="relative mx-auto mt-3 h-9 w-9 overflow-hidden rounded-xl bg-[#0b1220] ring-1 ring-inset ring-[#3b7fff]/30 sm:h-10 sm:w-10">
          <div className="conveyor-lines absolute inset-0 opacity-70" aria-hidden />
          <div className="conveyor-scanbar absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-[#5b9bff] to-transparent shadow-[0_0_16px_4px_rgba(59,127,255,0.7)]" aria-hidden />
          <div className="conveyor-pulse absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#3b7fff]/60" aria-hidden />
        </div>
      </div>
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 whitespace-nowrap rounded-full bg-white/95 px-4 py-2 text-[13px] font-semibold text-neutral-700 shadow-[0_12px_26px_-14px_rgba(30,41,59,0.5)] ring-1 ring-rose-100">
      <span className="h-2 w-2 flex-shrink-0 rounded-full bg-rose-500" />
      {label}
    </div>
  );
}

export default function ConveyorHero() {
  const { t } = useLang();
  const pairs = t.conveyor.pairs;
  const belowRef = useRef<HTMLDivElement>(null);
  const inView = useInView(belowRef, { once: true, margin: "-10% 0px -10% 0px" });
  const reduced = useReducedMotion();

  const container = {
    hidden: {},
    open: { transition: { staggerChildren: reduced ? 0.02 : 0.09, delayChildren: 0.05 } },
  };
  const item = {
    hidden: { opacity: 0, y: 22, scale: 0.96 },
    open: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { type: "spring" as const, stiffness: 300, damping: 24 },
    },
  };

  return (
    <div className="relative mx-auto w-full max-w-5xl" aria-hidden>
      <style>{CONVEYOR_CSS}</style>

      {/* ── The belt + machine ─────────────────────────────────────── */}
      <div className="relative h-40 sm:h-44">
        {/* belt track */}
        <div className="absolute inset-x-0 top-1/2 h-16 -translate-y-1/2 rounded-2xl bg-gradient-to-b from-white/80 to-[#e9eef7] shadow-[inset_0_2px_6px_rgba(255,255,255,0.9),0_26px_50px_-30px_rgba(30,41,59,0.5)]" />
        <div className="conveyor-rollers absolute inset-x-0 top-1/2 h-16 -translate-y-1/2 rounded-2xl" />

        {/* problems entering from the left, passing through the machine */}
        {pairs.map((p, i) => (
          <div
            key={p.problem}
            className="belt-chip absolute top-1/2 z-10"
            style={{
              animationDuration: `${BELT_DUR}s`,
              animationDelay: `${-((i * BELT_DUR) / pairs.length).toFixed(2)}s`,
            }}
          >
            <Chip label={p.problem} />
          </div>
        ))}

        {/* the machine sits above the belt so problems pass behind it */}
        <div className="absolute left-1/2 top-1/2 z-20 w-[150px] -translate-x-1/2 -translate-y-1/2 sm:w-[180px]">
          <MachineCard />
        </div>
      </div>

      {/* ── Collected below the belt on scroll ─────────────────────── */}
      <motion.div
        ref={belowRef}
        className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3"
        variants={container}
        initial="hidden"
        animate={inView || reduced ? "open" : "hidden"}
      >
        {pairs.map((p) => (
          <motion.div
            key={p.problem}
            variants={item}
            className="flex items-start gap-2.5 rounded-xl bg-white/85 px-4 py-3 text-left ring-1 ring-black/5 backdrop-blur shadow-[0_14px_30px_-18px_rgba(30,41,59,0.4)]"
          >
            <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-rose-500" />
            <div>
              <p className="text-sm font-bold text-neutral-900">{p.problem}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">{p.problemTip}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

// ── Scoped CSS (belt motion + machine effects) ────────────────────────────────
const CONVEYOR_CSS = `
.belt-chip {
  transform: translate(-50%, -50%);
  animation-name: beltMove;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}
@keyframes beltMove {
  0%   { left: -8%;  opacity: 0; }
  6%   { opacity: 1; }
  94%  { opacity: 1; }
  100% { left: 108%; opacity: 0; }
}

.conveyor-rollers {
  background-image: repeating-linear-gradient(
    90deg,
    rgba(148,163,184,0) 0px, rgba(148,163,184,0) 34px,
    rgba(148,163,184,0.28) 34px, rgba(148,163,184,0.28) 37px,
    rgba(255,255,255,0.7) 37px, rgba(255,255,255,0.7) 40px
  );
  background-size: 40px 100%;
  animation: conveyorRoll 1.1s linear infinite;
  opacity: 0.85;
}
@keyframes conveyorRoll { from { background-position: 0 0; } to { background-position: 40px 0; } }

.conveyor-sweep {
  background: linear-gradient(115deg, transparent 40%, rgba(91,155,255,0.18) 50%, transparent 60%);
  background-size: 250% 100%;
  animation: conveyorSweep 3.4s ease-in-out infinite;
}
@keyframes conveyorSweep { 0% { background-position: 130% 0; } 100% { background-position: -130% 0; } }

.conveyor-glow {
  background: radial-gradient(120px 80px at 50% 62%, rgba(59,127,255,0.16), transparent 70%);
  opacity: 1;
}

.conveyor-lines {
  background-image: repeating-linear-gradient(90deg, rgba(91,155,255,0.0) 0 10px, rgba(91,155,255,0.35) 10px 11px);
  background-size: 22px 100%;
  animation: conveyorLines 1.6s linear infinite;
}
@keyframes conveyorLines { from { background-position: 0 0; } to { background-position: 22px 0; } }

.conveyor-scanbar { animation: conveyorScan 1s ease-in-out infinite; }
@keyframes conveyorScan { 0%,100% { top: 8%; opacity: 0.5; } 50% { top: 82%; opacity: 1; } }

.conveyor-pulse { animation: conveyorPulse 1.8s ease-out infinite; opacity: 0; }
@keyframes conveyorPulse { 0% { transform: translate(-50%,-50%) scale(0.6); opacity: 0.7; } 100% { transform: translate(-50%,-50%) scale(2.4); opacity: 0; } }

@media (prefers-reduced-motion: reduce) {
  .belt-chip { display: none; }
  .conveyor-rollers, .conveyor-sweep, .conveyor-lines, .conveyor-scanbar, .conveyor-pulse { animation: none !important; }
}
`;
