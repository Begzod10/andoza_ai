import { useLang } from "./i18n";
import Reveal from "./Reveal";

// Scattered note placements on the wide board (pin point = % of the board box,
// so the SVG string — drawn in the same 0–100 space — meets each pin exactly).
const SPOTS = [
  { x: 16, y: 15, rot: -6 },
  { x: 40, y: 33, rot: 5 },
  { x: 63, y: 13, rot: -4 },
  { x: 85, y: 39, rot: 7 },
];
const PIN_COLORS = ["#ef4444", "#f59e0b", "#e11d48", "#ef4444"];

function Pin({ color }: { color: string }) {
  return (
    <span
      className="absolute -top-3 left-1/2 z-20 h-4 w-4 -translate-x-1/2 rounded-full"
      aria-hidden
      style={{
        background: `radial-gradient(circle at 34% 30%, #ffffff 0 1.5px, ${color} 3px, ${color} 100%)`,
        boxShadow: "0 3px 5px rgba(0,0,0,0.45)",
      }}
    />
  );
}

function Note({
  title,
  desc,
  color,
  className = "",
  style,
}: {
  title: string;
  desc: string;
  color: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`relative w-48 max-w-full ${className}`} style={style}>
      <Pin color={color} />
      <div
        className="relative rounded-[3px] px-5 pb-6 pt-7 shadow-[0_16px_26px_-10px_rgba(0,0,0,0.6)]"
        style={{ background: "linear-gradient(160deg,#fef3c7 0%,#fcd34d 100%)" }}
      >
        <h3 className="text-base font-bold text-neutral-900">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-neutral-700">{desc}</p>
        {/* folded corner */}
        <span
          className="absolute bottom-0 right-0 h-5 w-5"
          style={{ background: "linear-gradient(135deg, transparent 50%, rgba(180,130,10,0.35) 50%)" }}
        />
      </div>
    </div>
  );
}

// Cork + wooden-frame board surface, shared by both layouts.
function boardShell(children: React.ReactNode, className: string) {
  return (
    <div
      className={`relative rounded-[20px] ${className}`}
      style={{
        background: "linear-gradient(150deg,#8a6636 0%,#5f4222 55%,#4a3319 100%)",
        padding: 16,
        boxShadow: "0 40px 80px -34px rgba(0,0,0,0.6), inset 0 2px 4px rgba(255,255,255,0.18)",
      }}
    >
      {/* cork surface */}
      <div
        className="pointer-events-none absolute inset-4 rounded-[12px]"
        style={{
          backgroundColor: "#c19a5e",
          backgroundImage:
            "radial-gradient(rgba(96,58,16,0.28) 1px, transparent 1.8px), radial-gradient(rgba(255,238,200,0.20) 1px, transparent 1.8px), radial-gradient(rgba(140,96,40,0.14) 1.5px, transparent 2.4px)",
          backgroundSize: "12px 12px, 18px 18px, 30px 30px",
          backgroundPosition: "0 0, 6px 9px, 14px 5px",
          boxShadow: "inset 0 0 70px rgba(64,40,12,0.6)",
        }}
      />
      {children}
    </div>
  );
}

export default function Problem() {
  const { t } = useLang();
  const items = t.problem.items;

  return (
    <section className="relative z-10 mx-auto max-w-7xl px-6 py-20 sm:py-24">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
          {t.problem.heading}
        </h2>
      </Reveal>

      {/* ── Wide detective board (md+): scattered notes tied with a red web ── */}
      <Reveal className="mt-14 hidden md:block">
        {boardShell(
          <>
            {/* red string web — same 0–100 space as the note pin points */}
            <svg
              className="pointer-events-none absolute inset-4 h-[calc(100%-2rem)] w-[calc(100%-2rem)]"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              style={{ filter: "drop-shadow(0 1.5px 1.5px rgba(0,0,0,0.5))" }}
              aria-hidden
            >
              <path
                d={`M${SPOTS[0].x} ${SPOTS[0].y} L${SPOTS[1].x} ${SPOTS[1].y} L${SPOTS[2].x} ${SPOTS[2].y} L${SPOTS[3].x} ${SPOTS[3].y} M${SPOTS[0].x} ${SPOTS[0].y} L${SPOTS[2].x} ${SPOTS[2].y} M${SPOTS[1].x} ${SPOTS[1].y} L${SPOTS[3].x} ${SPOTS[3].y}`}
                fill="none"
                stroke="#dc2626"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            {/* the notes */}
            <div className="relative h-[440px] lg:h-[520px]">
              {items.map((item, i) => (
                <Note
                  key={item.title}
                  title={item.title}
                  desc={item.desc}
                  color={PIN_COLORS[i % PIN_COLORS.length]}
                  className="absolute"
                  style={{
                    left: `${SPOTS[i % SPOTS.length].x}%`,
                    top: `${SPOTS[i % SPOTS.length].y}%`,
                    transform: `translateX(-50%) rotate(${SPOTS[i % SPOTS.length].rot}deg)`,
                  }}
                />
              ))}
            </div>
          </>,
          "",
        )}
      </Reveal>

      {/* ── Stacked board (mobile): notes down the centre on one red thread ── */}
      <Reveal className="mt-12 md:hidden">
        {boardShell(
          <>
            <svg
              className="pointer-events-none absolute inset-4 h-[calc(100%-2rem)] w-[calc(100%-2rem)]"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.5))" }}
              aria-hidden
            >
              <path
                d="M50 3 C 60 26 40 38 50 52 C 60 66 40 80 50 98"
                fill="none"
                stroke="#dc2626"
                strokeWidth="2"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <div className="relative flex flex-col items-center gap-12 py-4">
              {items.map((item, i) => (
                <Note
                  key={item.title}
                  title={item.title}
                  desc={item.desc}
                  color={PIN_COLORS[i % PIN_COLORS.length]}
                  style={{ transform: `rotate(${SPOTS[i % SPOTS.length].rot}deg)` }}
                />
              ))}
            </div>
          </>,
          "",
        )}
      </Reveal>
    </section>
  );
}
