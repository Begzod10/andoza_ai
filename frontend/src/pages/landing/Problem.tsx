import { useLang } from "./i18n";
import Reveal from "./Reveal";

// Small per-note character: tilt + pin colour. A contained grid (not absolute
// scatter) guarantees every note stays inside the board at any text length.
const TILT = ["-2.5deg", "2deg", "-1.5deg", "2.5deg"];
const PIN_COLORS = ["#ef4444", "#f59e0b", "#e11d48", "#ef4444"];

function Pin({ color }: { color: string }) {
  return (
    <span className="absolute -top-3 left-1/2 z-20 -translate-x-1/2" aria-hidden>
      <span
        className="block h-[18px] w-[18px] rounded-full"
        style={{
          background: `radial-gradient(circle at 35% 28%, #fff 0 2px, ${color} 3.5px, ${color} 70%, rgba(0,0,0,0.25) 100%)`,
          boxShadow: "0 4px 7px -1px rgba(0,0,0,0.5)",
        }}
      />
    </span>
  );
}

function Note({ title, desc, color, tilt }: { title: string; desc: string; color: string; tilt: string }) {
  return (
    <div className="relative w-full max-w-[280px]" style={{ transform: `rotate(${tilt})` }}>
      <Pin color={color} />
      <div
        className="relative overflow-hidden rounded-xl px-6 pb-7 pt-8"
        style={{
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
        <h3 className="relative text-[17px] font-bold tracking-tight text-[#3a2e05]">{title}</h3>
        <p className="relative mt-2 text-sm leading-relaxed text-[#5f4e12]">{desc}</p>
        {/* soft peeled corner */}
        <span
          className="pointer-events-none absolute bottom-0 right-0 h-6 w-6"
          style={{ background: "linear-gradient(135deg, transparent 50%, rgba(120,90,0,0.22) 50%)" }}
        />
      </div>
    </div>
  );
}

export default function Problem() {
  const { t } = useLang();
  const items = t.problem.items;

  return (
    <section className="relative z-10 mx-auto max-w-6xl px-6 py-20 sm:py-24">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
          {t.problem.heading}
        </h2>
      </Reveal>

      {/* ── Modern evidence board: notes in a contained grid, tied with string ── */}
      <Reveal className="mt-14">
        <div
          className="relative overflow-hidden rounded-[28px] p-5 sm:p-8"
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

          {/* red string web connecting the four pin areas (2×2 grid) */}
          <svg
            className="pointer-events-none absolute inset-0 hidden h-full w-full sm:block"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ filter: "drop-shadow(0 1.5px 1.5px rgba(0,0,0,0.45))" }}
            aria-hidden
          >
            <path
              d="M27 19 L73 21 L27 66 L73 68 M27 19 L27 66 M73 21 L73 68"
              fill="none"
              stroke="#dc2626"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              opacity="0.9"
            />
          </svg>

          {/* the notes — grid keeps them inside the board at any length */}
          <div className="relative z-10 grid grid-cols-1 justify-items-center gap-x-10 gap-y-12 py-4 sm:grid-cols-2 sm:py-6">
            {items.map((item, i) => (
              <Note
                key={item.title}
                title={item.title}
                desc={item.desc}
                color={PIN_COLORS[i % PIN_COLORS.length]}
                tilt={TILT[i % TILT.length]}
              />
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
