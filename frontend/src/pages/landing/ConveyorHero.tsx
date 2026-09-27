import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "./i18n";
import type { ConveyorPair } from "./i18n";

/* ────────────────────────────────────────────────────────────────────────────
   ConveyorHero — an airport-baggage-scanner style conveyor.
   PROBLEM (left) → AndozaAI MACHINE (center) → SOLUTION (right).
   One continuous belt, viewed top-down with a slight isometric 3D tilt.

   The loop is driven by a requestAnimationFrame ticker that advances a
   per-slot clock. Each slot maps its clock to a normalized progress 0→1 across
   the belt; positions/opacity are written straight to the DOM (no per-frame
   React state) for smooth ~60fps. React state changes only when a slot starts
   a new lap (which happens off-screen at the belt edge) or on hover.
──────────────────────────────────────────────────────────────────────────── */

// ── Tunables ────────────────────────────────────────────────────────────────
const CYCLE = 13; // seconds for one object to travel the full belt
const HOVER_SLOWDOWN = 0.22; // clock speed factor while a card is hovered (desktop)
const MACHINE_IN = 0.435; // progress at which an object enters the machine
const MACHINE_OUT = 0.565; // progress at which it emerges, transformed
const FADE_IN_END = 0.07; // progress where the entering fade completes
const FADE_OUT_START = 0.9; // progress where the exit fade begins

// ── Per-pair icons (index-aligned with the i18n `conveyor.pairs`) ─────────────
const strokeProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const PAIR_ICONS: React.FC[] = [
  // 1 — costs / estimate
  () => (
    <svg viewBox="0 0 24 24" {...strokeProps}>
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  // 2 — store
  () => (
    <svg viewBox="0 0 24 24" {...strokeProps}>
      <path d="M4 9 5.5 4h13L20 9M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9M4 9h16M9 20v-6h6v6" />
    </svg>
  ),
  // 3 — worker / pro
  () => (
    <svg viewBox="0 0 24 24" {...strokeProps}>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  ),
  // 4 — 3D plan / cube
  () => (
    <svg viewBox="0 0 24 24" {...strokeProps}>
      <path d="M12 2 21 7v10l-9 5-9-5V7l9-5ZM3 7l9 5 9-5M12 12v10" />
    </svg>
  ),
  // 5 — calculation
  () => (
    <svg viewBox="0 0 24 24" {...strokeProps}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 7h8M8 11h.01M12 11h.01M16 11v6M8 15h.01M12 15h.01M8 18h4" />
    </svg>
  ),
  // 6 — stages / process
  () => (
    <svg viewBox="0 0 24 24" {...strokeProps}>
      <path d="M4 7h10M4 12h16M4 17h7" />
      <circle cx="18.5" cy="7" r="1.6" />
      <circle cx="14.5" cy="17" r="1.6" />
    </svg>
  ),
];

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ── Small utility ─────────────────────────────────────────────────────────────
const frac = (n: number) => n - Math.floor(n);
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Opacity for a travelling object at a given progress (0 inside machine / edges). */
function edgeOpacity(p: number): number {
  if (p < FADE_IN_END) return clamp01(p / FADE_IN_END);
  if (p > FADE_OUT_START) return clamp01((1 - p) / (1 - FADE_OUT_START));
  if (p > MACHINE_IN && p < MACHINE_OUT) return 0; // hidden inside the machine
  return 1;
}

// ── Card face (problem or solution) ───────────────────────────────────────────
function CardFace({
  variant,
  icon: Icon,
  label,
  tag,
}: {
  variant: "problem" | "solution";
  icon: React.FC;
  label: string;
  tag: string;
}) {
  const isSolution = variant === "solution";
  return (
    <div
      className={[
        "conveyor-face absolute inset-0 flex flex-col justify-between rounded-2xl p-3 sm:p-3.5",
        "ring-1 backdrop-blur",
        isSolution
          ? "bg-white ring-[#3b7fff]/25 shadow-[0_22px_45px_-18px_rgba(37,99,235,0.55)]"
          : "bg-white/85 ring-black/5 shadow-[0_18px_38px_-18px_rgba(30,41,59,0.45)]",
      ].join(" ")}
    >
      <div className="flex items-center justify-between">
        <span
          className={[
            "grid h-8 w-8 place-items-center rounded-xl sm:h-9 sm:w-9",
            isSolution ? "bg-[#eaf1ff] text-[#2563eb]" : "bg-neutral-100 text-neutral-500",
          ].join(" ")}
        >
          <span className="h-4 w-4 sm:h-[18px] sm:w-[18px]">
            <Icon />
          </span>
        </span>
        {isSolution ? (
          <span className="grid h-5 w-5 place-items-center rounded-full bg-[#2563eb] text-white shadow-sm">
            <CheckIcon />
          </span>
        ) : (
          <span className="h-2 w-2 rounded-full bg-neutral-300" />
        )}
      </div>
      <div>
        <span
          className={[
            "text-[9px] font-bold uppercase tracking-wider",
            isSolution ? "text-[#2563eb]" : "text-neutral-400",
          ].join(" ")}
        >
          {tag}
        </span>
        <p
          className={[
            "mt-0.5 text-[12px] font-bold leading-tight sm:text-[13px]",
            isSolution ? "text-neutral-900" : "text-neutral-700",
          ].join(" ")}
        >
          {label}
        </p>
      </div>
    </div>
  );
}

// ── One travelling object (a belt "slot") ─────────────────────────────────────
interface SlotState {
  key: number; // React key, bumped so face-swap re-mounts cleanly per lap
  pairIndex: number;
}

function ConveyorSlot({
  slotState,
  pair,
  labels,
  registerRef,
  onHover,
  hovered,
}: {
  slotState: SlotState;
  pair: ConveyorPair;
  labels: { problem: string; solution: string };
  registerRef: (el: HTMLDivElement | null) => void;
  onHover: (hovering: boolean) => void;
  hovered: boolean;
}) {
  const safeIdx = Number.isFinite(slotState.pairIndex)
    ? ((slotState.pairIndex % PAIR_ICONS.length) + PAIR_ICONS.length) % PAIR_ICONS.length
    : 0;
  const Icon = PAIR_ICONS[safeIdx];
  return (
    <div
      ref={registerRef}
      className="conveyor-slot absolute left-0 top-1/2 z-10 h-[92px] w-[132px] will-change-transform sm:h-[104px] sm:w-[150px]"
      style={{ opacity: 0 }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <div
        className="relative h-full w-full transition-transform duration-300 ease-out"
        style={{ transform: hovered ? "translateZ(0) scale(1.06)" : "translateZ(0) scale(1)" }}
      >
        {/* solution face sits under, revealed on the machine's right side */}
        <div className="conveyor-solution absolute inset-0" style={{ opacity: 0 }}>
          <CardFace variant="solution" icon={Icon} label={pair.solution} tag={labels.solution} />
        </div>
        <div className="conveyor-problem absolute inset-0" style={{ opacity: 1 }}>
          <CardFace variant="problem" icon={Icon} label={pair.problem} tag={labels.problem} />
        </div>

        {/* hover tooltip (desktop only) */}
        <div
          className={[
            "pointer-events-none absolute -top-2 left-1/2 z-30 w-44 -translate-x-1/2 -translate-y-full rounded-xl bg-neutral-900/95 px-3 py-2 text-center text-[11px] font-medium leading-snug text-white shadow-xl transition-all duration-200",
            hovered ? "opacity-100" : "opacity-0",
          ].join(" ")}
        >
          <span className="conveyor-tip-problem block">{pair.problemTip}</span>
          <span className="conveyor-tip-solution block">{pair.solutionTip}</span>
          <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-neutral-900/95" />
        </div>
      </div>
    </div>
  );
}

// ── The AndozaAI processing machine ───────────────────────────────────────────
function Machine({ machineRef }: { machineRef: React.RefObject<HTMLDivElement> }) {
  const { t } = useLang();
  return (
    <div
      ref={machineRef}
      data-active="false"
      className="conveyor-machine group absolute left-1/2 top-1/2 z-20 w-[168px] -translate-x-1/2 -translate-y-1/2 sm:w-[210px] lg:w-[236px]"
    >
      {/* belt window the object passes through (behind the body) */}
      <div className="conveyor-window absolute left-1/2 top-1/2 -z-10 h-[104px] w-[150px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-[#0b1220]/90 ring-1 ring-[#3b7fff]/40" />

      {/* machine body */}
      <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-b from-white to-[#f3f6fc] p-4 shadow-[0_34px_70px_-26px_rgba(30,64,175,0.55)] ring-1 ring-black/5">
        {/* scanning light sweep */}
        <div className="conveyor-sweep pointer-events-none absolute inset-0" aria-hidden />
        {/* soft internal glow, intensifies when active */}
        <div className="conveyor-glow pointer-events-none absolute inset-0" aria-hidden />

        {/* brand header */}
        <div className="relative flex items-center justify-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#eaf1ff] ring-1 ring-[#3b7fff]/20">
            <img src="/icon.svg" alt="" className="h-5 w-5" />
          </span>
          <span className="text-[15px] font-extrabold tracking-tight text-neutral-900">
            Andoza<span className="text-[#2563eb]">AI</span>
          </span>
        </div>

        {/* the scan aperture */}
        <div className="relative mt-3 h-14 overflow-hidden rounded-2xl bg-[#0b1220] ring-1 ring-inset ring-[#3b7fff]/30 sm:h-16">
          {/* moving light lines */}
          <div className="conveyor-lines absolute inset-0 opacity-70" aria-hidden />
          {/* scan bar */}
          <div className="conveyor-scanbar absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-[#5b9bff] to-transparent shadow-[0_0_16px_4px_rgba(59,127,255,0.7)]" aria-hidden />
          {/* center pulse */}
          <div className="conveyor-pulse absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#3b7fff]/60" aria-hidden />
        </div>

        {/* futuristic UI ticks */}
        <div className="relative mt-3 flex items-center justify-between gap-2">
          {t.conveyor.machineTicks.map((tick, i) => (
            <span
              key={tick}
              className="conveyor-tick flex items-center gap-1 text-[8px] font-semibold uppercase tracking-wide text-neutral-400 sm:text-[9px]"
              style={{ animationDelay: `${i * 0.5}s` }}
            >
              <span className="conveyor-tick-dot h-1.5 w-1.5 rounded-full bg-neutral-300" />
              {tick}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Static (reduced-motion) composition ───────────────────────────────────────
function StaticComposition() {
  const { t } = useLang();
  const c = t.conveyor;
  const left = [0, 1];
  const right = [2, 3];
  return (
    <div className="relative flex items-center justify-between gap-3 px-2">
      <div className="flex flex-1 flex-col gap-3">
        {left.map((i) => {
          const Icon = PAIR_ICONS[i];
          return (
            <div key={i} className="relative h-[92px]">
              <CardFace variant="problem" icon={Icon} label={c.pairs[i].problem} tag={c.problemLabel} />
            </div>
          );
        })}
      </div>
      <div className="w-[190px] flex-shrink-0 sm:w-[220px]">
        <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-b from-white to-[#f3f6fc] p-4 shadow-[0_34px_70px_-26px_rgba(30,64,175,0.55)] ring-1 ring-black/5">
          <div className="flex items-center justify-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#eaf1ff] ring-1 ring-[#3b7fff]/20">
              <img src="/icon.svg" alt="" className="h-5 w-5" />
            </span>
            <span className="text-[15px] font-extrabold tracking-tight text-neutral-900">
              Andoza<span className="text-[#2563eb]">AI</span>
            </span>
          </div>
          <div className="mt-3 h-14 rounded-2xl bg-[#0b1220] ring-1 ring-inset ring-[#3b7fff]/30" />
          <div className="mt-3 flex items-center justify-between gap-2">
            {c.machineTicks.map((tick) => (
              <span key={tick} className="flex items-center gap-1 text-[8px] font-semibold uppercase tracking-wide text-neutral-400 sm:text-[9px]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#3b7fff]" />
                {tick}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3">
        {right.map((i) => {
          const Icon = PAIR_ICONS[i];
          return (
            <div key={i} className="relative h-[92px]">
              <CardFace variant="solution" icon={Icon} label={c.pairs[i].solution} tag={c.solutionLabel} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ConveyorHero() {
  const { t } = useLang();
  const pairs = t.conveyor.pairs;
  const pairCount = pairs.length;

  // Environment capabilities (resolved on mount, SSR-safe).
  const [reducedMotion, setReducedMotion] = useState(false);
  const [canHover, setCanHover] = useState(false);
  const [slotCount, setSlotCount] = useState(4);

  useEffect(() => {
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const hover = window.matchMedia("(hover: hover) and (pointer: fine)");
    const applyRm = () => setReducedMotion(rm.matches);
    const applyHover = () => setCanHover(hover.matches);
    applyRm();
    applyHover();
    rm.addEventListener("change", applyRm);
    hover.addEventListener("change", applyHover);
    return () => {
      rm.removeEventListener("change", applyRm);
      hover.removeEventListener("change", applyHover);
    };
  }, []);

  // Responsive slot count.
  useEffect(() => {
    const mSmall = window.matchMedia("(max-width: 639px)");
    const mMed = window.matchMedia("(max-width: 1023px)");
    const apply = () => setSlotCount(mSmall.matches ? 2 : mMed.matches ? 3 : 4);
    apply();
    mSmall.addEventListener("change", apply);
    mMed.addEventListener("change", apply);
    return () => {
      mSmall.removeEventListener("change", apply);
      mMed.removeEventListener("change", apply);
    };
  }, []);

  // Slot React state — only changes on lap boundaries (off-screen) & re-init.
  const [slots, setSlots] = useState<SlotState[]>([]);
  useEffect(() => {
    setSlots(
      Array.from({ length: slotCount }, (_, i) => ({ key: i, pairIndex: i % pairCount })),
    );
  }, [slotCount, pairCount]);

  // Refs used by the rAF ticker (no re-render).
  const stageRef = useRef<HTMLDivElement>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const machineRef = useRef<HTMLDivElement>(null);
  const slotEls = useRef<(HTMLDivElement | null)[]>([]);
  const clocks = useRef<number[]>([]);
  const laps = useRef<number[]>([]);
  const hoveredRef = useRef<number>(-1);
  const [hoveredIndex, setHoveredIndex] = useState(-1);

  // Keep clock/lap arrays sized to slotCount, preserving stagger.
  useEffect(() => {
    clocks.current = Array.from({ length: slotCount }, (_, i) => (i / slotCount) * CYCLE);
    laps.current = Array.from({ length: slotCount }, () => 0);
    slotEls.current = Array.from({ length: slotCount }, () => null);
  }, [slotCount]);

  const registerSlot = useCallback(
    (i: number) => (el: HTMLDivElement | null) => {
      slotEls.current[i] = el;
    },
    [],
  );

  const handleHover = useCallback(
    (i: number) => (hovering: boolean) => {
      if (!canHover) return;
      hoveredRef.current = hovering ? i : hoveredRef.current === i ? -1 : hoveredRef.current;
      setHoveredIndex(hovering ? i : (prev) => (prev === i ? -1 : prev));
    },
    [canHover],
  );

  // ── The animation ticker ────────────────────────────────────────────────────
  useEffect(() => {
    if (reducedMotion || slots.length === 0) return;

    let raf = 0;
    let last = performance.now();
    let running = true;
    let inView = true;

    const stage = stageRef.current;
    const lane = laneRef.current;
    const machine = machineRef.current;

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05); // clamp big gaps (tab restore)
      last = now;
      const laneW = lane ? lane.clientWidth : 0;

      // Read all layout up front, then write — avoids per-frame reflow thrashing.
      const widths = slotEls.current.map((el) => (el ? el.offsetWidth : 0));

      let anyInside = false;

      for (let i = 0; i < slots.length; i++) {
        const el = slotEls.current[i];
        if (!el) continue;

        const speed = hoveredRef.current === i ? HOVER_SLOWDOWN : 1;
        clocks.current[i] += dt * speed;

        const phase = (clocks.current[i] ?? (i / slotCount) * CYCLE) / CYCLE;
        const p = frac(phase);
        const lap = Math.floor(phase);

        // Lap rollover happens at the belt edge (opacity 0) → swap content there.
        if (lap !== laps.current[i]) {
          laps.current[i] = lap;
          setSlots((prev) => {
            if (!prev[i]) return prev;
            const next = prev.slice();
            next[i] = { key: next[i].key + slotCount, pairIndex: (lap * slotCount + i) % pairCount };
            return next;
          });
        }

        // Position across the belt: enter fully off-screen left, exit off-screen
        // right, and align the card's center with the machine center at p = 0.5.
        const cardW = widths[i];
        const x = -cardW + p * (laneW + cardW);
        el.style.transform = `translate3d(${x}px, -50%, 0)`;
        el.style.opacity = String(edgeOpacity(p));

        // Problem → solution face swap around the machine center.
        const problemFace = el.querySelector<HTMLElement>(".conveyor-problem");
        const solutionFace = el.querySelector<HTMLElement>(".conveyor-solution");
        const showSolution = p >= 0.5;
        if (problemFace) problemFace.style.opacity = showSolution ? "0" : "1";
        if (solutionFace) solutionFace.style.opacity = showSolution ? "1" : "0";
        const tipP = el.querySelector<HTMLElement>(".conveyor-tip-problem");
        const tipS = el.querySelector<HTMLElement>(".conveyor-tip-solution");
        if (tipP) tipP.style.display = showSolution ? "none" : "block";
        if (tipS) tipS.style.display = showSolution ? "block" : "none";

        if (p > MACHINE_IN && p < MACHINE_OUT) anyInside = true;
      }

      if (machine) machine.dataset.active = anyInside ? "true" : "false";

      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    const sync = () => {
      const shouldRun = inView && !document.hidden;
      if (shouldRun && !running) {
        running = true;
        start();
      } else if (!shouldRun && running) {
        running = false;
        stop();
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        inView = entries[0]?.isIntersecting ?? true;
        sync();
      },
      { threshold: 0.05 },
    );
    if (stage) io.observe(stage);

    const onVisibility = () => sync();
    document.addEventListener("visibilitychange", onVisibility);

    start();

    return () => {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reducedMotion, slots.length, slotCount, pairCount]);

  const labels = useMemo(
    () => ({ problem: t.conveyor.problemLabel, solution: t.conveyor.solutionLabel }),
    [t.conveyor.problemLabel, t.conveyor.solutionLabel],
  );

  return (
    <div
      ref={stageRef}
      className="conveyor-stage relative mx-auto w-full max-w-5xl"
      aria-hidden
    >
      <style>{CONVEYOR_CSS}</style>

      {reducedMotion ? (
        <div className="py-4">
          <StaticComposition />
        </div>
      ) : (
        <div
          className="conveyor-scene relative h-[300px] sm:h-[360px] lg:h-[400px]"
          style={{ perspective: "1200px" }}
        >
          {/* tilted belt floor */}
          <div className="conveyor-floor-wrap absolute inset-x-0 top-1/2 -translate-y-1/2">
            <div className="conveyor-floor relative mx-auto h-[150px] w-[92%] sm:h-[170px]">
              <div className="conveyor-belt absolute inset-0 rounded-[28px]" />
              <div className="conveyor-rollers absolute inset-0 rounded-[28px]" />
              <div className="conveyor-rail conveyor-rail-top" />
              <div className="conveyor-rail conveyor-rail-bottom" />
            </div>
          </div>

          {/* travelling objects ride in a flat lane above the belt */}
          <div ref={laneRef} className="conveyor-lane absolute inset-x-0 top-1/2 h-0">
            {slots.map((s, i) => (
              <ConveyorSlot
                key={`${i}-${s.key}`}
                slotState={s}
                pair={pairs[s.pairIndex % pairCount] ?? pairs[0]}
                labels={labels}
                registerRef={registerSlot(i)}
                onHover={handleHover(i)}
                hovered={hoveredIndex === i}
              />
            ))}
          </div>

          <Machine machineRef={machineRef} />
        </div>
      )}
    </div>
  );
}

// ── Scoped CSS (belt motion, machine effects) ─────────────────────────────────
const CONVEYOR_CSS = `
.conveyor-floor {
  transform: rotateX(52deg);
  transform-style: preserve-3d;
}
@media (max-width: 1023px) { .conveyor-floor { transform: rotateX(46deg); } }
@media (max-width: 639px)  { .conveyor-floor { transform: rotateX(38deg); } }

.conveyor-belt {
  background:
    linear-gradient(180deg, rgba(255,255,255,0.75), rgba(233,238,247,0.9)),
    #e9eef7;
  box-shadow:
    inset 0 2px 6px rgba(255,255,255,0.9),
    0 30px 60px -30px rgba(30,41,59,0.5);
}
.conveyor-rollers {
  background-image: repeating-linear-gradient(
    90deg,
    rgba(148,163,184,0.0) 0px,
    rgba(148,163,184,0.0) 34px,
    rgba(148,163,184,0.28) 34px,
    rgba(148,163,184,0.28) 37px,
    rgba(255,255,255,0.7) 37px,
    rgba(255,255,255,0.7) 40px
  );
  background-size: 40px 100%;
  animation: conveyorRoll 1.1s linear infinite;
  opacity: 0.9;
}
@keyframes conveyorRoll { from { background-position: 0 0; } to { background-position: 40px 0; } }

.conveyor-rail {
  position: absolute;
  left: -1.5%;
  right: -1.5%;
  height: 12px;
  border-radius: 999px;
  background: linear-gradient(180deg, #ffffff, #cbd5e1);
  box-shadow: 0 6px 14px -6px rgba(30,41,59,0.55);
}
.conveyor-rail-top { top: -8px; transform: translateZ(14px); }
.conveyor-rail-bottom { bottom: -8px; transform: translateZ(14px); }

/* Machine effects */
.conveyor-sweep {
  background: linear-gradient(115deg, transparent 40%, rgba(91,155,255,0.18) 50%, transparent 60%);
  background-size: 250% 100%;
  animation: conveyorSweep 3.4s ease-in-out infinite;
}
@keyframes conveyorSweep { 0% { background-position: 130% 0; } 100% { background-position: -130% 0; } }

.conveyor-glow {
  background: radial-gradient(120px 80px at 50% 62%, rgba(59,127,255,0.16), transparent 70%);
  opacity: 0.5;
  transition: opacity 0.4s ease;
}
.conveyor-machine[data-active="true"] .conveyor-glow { opacity: 1; }

.conveyor-lines {
  background-image: repeating-linear-gradient(90deg, rgba(91,155,255,0.0) 0 10px, rgba(91,155,255,0.35) 10px 11px);
  background-size: 22px 100%;
  animation: conveyorLines 1.6s linear infinite;
}
@keyframes conveyorLines { from { background-position: 0 0; } to { background-position: 22px 0; } }

.conveyor-scanbar { animation: conveyorScan 2.2s ease-in-out infinite; }
@keyframes conveyorScan { 0%,100% { top: 8%; opacity: 0.5; } 50% { top: 82%; opacity: 1; } }
.conveyor-machine[data-active="true"] .conveyor-scanbar { animation-duration: 1s; }

.conveyor-pulse { animation: conveyorPulse 1.8s ease-out infinite; opacity: 0; }
@keyframes conveyorPulse { 0% { transform: translate(-50%,-50%) scale(0.6); opacity: 0.7; } 100% { transform: translate(-50%,-50%) scale(2.4); opacity: 0; } }

.conveyor-tick-dot { animation: conveyorTickDot 1.5s ease-in-out infinite; }
.conveyor-tick { animation: conveyorTickText 1.5s ease-in-out infinite; }
@keyframes conveyorTickDot { 0%,100% { background: #d1d5db; } 50% { background: #3b7fff; } }
@keyframes conveyorTickText { 0%,100% { color: #9ca3af; } 50% { color: #4b5563; } }
.conveyor-machine[data-active="true"] .conveyor-tick-dot { background: #3b7fff; }

.conveyor-window {
  box-shadow: 0 0 30px -6px rgba(59,127,255,0.5);
}

@media (prefers-reduced-motion: reduce) {
  .conveyor-rollers, .conveyor-sweep, .conveyor-lines, .conveyor-scanbar,
  .conveyor-pulse, .conveyor-tick, .conveyor-tick-dot { animation: none !important; }
}
`;
