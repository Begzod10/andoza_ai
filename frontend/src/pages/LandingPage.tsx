import { Link } from "react-router-dom";

// ─── Small building blocks ──────────────────────────────────────────────────

function Avatar({ initials, from, to }: { initials: string; from: string; to: string }) {
  return (
    <span
      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-white"
      style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      {initials}
    </span>
  );
}

function TaskRow({
  color,
  title,
  date,
  pct,
}: {
  color: string;
  title: string;
  date: string;
  pct: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-8 w-8 flex-shrink-0 rounded-lg" style={{ background: color }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-neutral-800">{title}</p>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[11px] text-neutral-400">{date}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-200/70">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
          </div>
          <span className="text-[11px] font-semibold text-neutral-500">{pct}%</span>
        </div>
      </div>
    </div>
  );
}

function FloatingCard({
  className,
  delay = 0,
  slow = false,
  children,
}: {
  className?: string;
  delay?: number;
  slow?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`absolute hidden lg:block ${slow ? "animate-float-slow" : "animate-float"} ${className ?? ""}`}
      style={{ animationDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
}

// ─── Landing page ───────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-white to-[#eef0f4] text-neutral-900">
      {/* subtle dot texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        style={{
          backgroundImage: "radial-gradient(circle, #cdd2dc 1px, transparent 1.4px)",
          backgroundSize: "22px 22px",
        }}
      />
      {/* soft brand glow behind the hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 h-[520px] w-[520px] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(59,127,255,0.18), transparent 70%)" }}
      />

      {/* Nav */}
      <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <img src="/icon.svg" alt="AndozaAI" className="h-9 w-9" />
          <span className="text-lg font-bold tracking-tight">AndozaAI</span>
        </div>
        <nav className="flex items-center gap-2">
          <Link
            to="/login"
            className="rounded-full px-4 py-2 text-sm font-semibold text-neutral-600 transition-colors hover:bg-white/70 hover:text-neutral-900"
          >
            Kirish
          </Link>
          <Link
            to="/login"
            className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-neutral-800"
          >
            Boshlash
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <main className="relative z-10 mx-auto flex max-w-6xl flex-col items-center px-6 pb-28 pt-8 text-center sm:pt-14 lg:pt-20">
        {/* eyebrow */}
        <span className="animate-rise-in mb-7 inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white/70 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-500 backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-[#3b7fff]" />
          Ta'mir uchun raqamli yordamchi
        </span>

        {/* floating app glyph */}
        <div className="animate-float mb-7 grid h-16 w-16 place-items-center rounded-2xl bg-white shadow-[0_18px_45px_-15px_rgba(30,41,59,0.35)] ring-1 ring-black/5 sm:h-[68px] sm:w-[68px]">
          <span className="grid grid-cols-2 gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#3b7fff]" />
            <span className="h-2.5 w-2.5 rounded-full bg-neutral-900" />
            <span className="h-2.5 w-2.5 rounded-full bg-neutral-900" />
            <span className="h-2.5 w-2.5 rounded-full bg-neutral-900" />
          </span>
        </div>

        <h1 className="animate-rise-in text-[38px] font-extrabold leading-[1.04] tracking-tight sm:text-6xl lg:text-[76px]">
          Xonangizni 3D'da ko'ring
          <br />
          <span className="bg-gradient-to-r from-[#3b7fff] via-[#7aa5ff] to-neutral-400 bg-clip-text text-transparent">
            ta'mirdan oldin
          </span>
        </h1>

        <p
          className="animate-rise-in mt-6 max-w-lg text-base text-neutral-500 sm:text-lg"
          style={{ animationDelay: "0.08s" }}
        >
          Skanerlang, dizayn qiling va aniq smeta oling — kerakli materiallarni bitta ilovadan sotib oling.
        </p>

        <div
          className="animate-rise-in mt-9 flex flex-col items-center gap-3 sm:flex-row"
          style={{ animationDelay: "0.16s" }}
        >
          <Link
            to="/login"
            className="rounded-full bg-[#2563eb] px-7 py-3.5 text-sm font-bold text-white shadow-[0_16px_35px_-12px_rgba(37,99,235,0.7)] transition-transform hover:-translate-y-0.5 hover:bg-[#1d4ed8] active:translate-y-0"
          >
            Bepul boshlash
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold text-neutral-600 transition-colors hover:text-neutral-900"
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-white shadow ring-1 ring-black/5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            </span>
            Qanday ishlaydi?
          </Link>
        </div>

        <p className="animate-rise-in mt-5 text-[13px] text-neutral-400" style={{ animationDelay: "0.22s" }}>
          Ro'yxatdan o'tish bepul · Karta talab qilinmaydi
        </p>

        {/* ── Floating cards (desktop) ── */}

        {/* top-left: sticky note */}
        <FloatingCard className="left-0 top-8 xl:-left-6" delay={0.2}>
          <div className="relative w-56 -rotate-6">
            <span className="absolute -top-2 left-6 h-4 w-4 rounded-full bg-rose-500 shadow-md ring-4 ring-rose-200" />
            <div className="rounded-md bg-[#fbe79a] p-4 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.35)]">
              <p className="text-[13px] leading-snug text-neutral-700" style={{ fontFamily: "'Comic Sans MS', cursive" }}>
                Xona o'lchamini bir marta kiriting — 3D model o'zi tayyor bo'ladi.
              </p>
            </div>
            <div className="mt-3 ml-2 grid h-12 w-12 place-items-center rounded-2xl bg-[#2563eb] shadow-lg">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>
        </FloatingCard>

        {/* top-right: reminders */}
        <FloatingCard className="right-0 top-6 xl:-right-4" delay={0.5} slow>
          <div className="w-60 rotate-3 rounded-2xl bg-white/80 p-4 shadow-[0_22px_50px_-20px_rgba(30,41,59,0.4)] ring-1 ring-black/5 backdrop-blur">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-neutral-100">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/></svg>
              </span>
              <span className="text-sm font-bold text-neutral-800">Eslatmalar</span>
            </div>
            <div className="mt-3 rounded-xl bg-neutral-50 p-3">
              <p className="text-[13px] font-semibold text-neutral-800">Usta bilan uchrashuv</p>
              <p className="text-[11px] text-neutral-400">Mehmonxona — suvoq bosqichi</p>
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-600">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                13:00 – 13:45
              </div>
            </div>
          </div>
        </FloatingCard>

        {/* bottom-left: today's tasks */}
        <FloatingCard className="-bottom-4 left-0 xl:-left-10" delay={0.35} slow>
          <div className="w-72 -rotate-2 rounded-2xl bg-white/85 p-4 shadow-[0_24px_55px_-20px_rgba(30,41,59,0.45)] ring-1 ring-black/5 backdrop-blur">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-bold text-neutral-800">Loyihalarim</span>
              <div className="flex -space-x-2">
                <Avatar initials="AK" from="#f97316" to="#ef4444" />
                <Avatar initials="MB" from="#3b82f6" to="#6366f1" />
              </div>
            </div>
            <div className="space-y-3">
              <TaskRow color="#22c55e" title="Mehmonxona — dizayn" date="Bugun" pct={88} />
              <TaskRow color="#ef4444" title="Oshxona — smeta" date="Sen 18" pct={60} />
            </div>
          </div>
        </FloatingCard>

        {/* bottom-right: stores / integrations */}
        <FloatingCard className="-bottom-2 right-0 xl:-right-8" delay={0.65}>
          <div className="w-60 rotate-2 rounded-2xl bg-white/85 p-4 shadow-[0_22px_50px_-20px_rgba(30,41,59,0.4)] ring-1 ring-black/5 backdrop-blur">
            <p className="mb-3 text-sm font-bold text-neutral-800">100+ do'kon</p>
            <div className="flex items-center gap-3">
              {[
                { label: "H", bg: "#eef2ff", fg: "#4338ca" },
                { label: "L", bg: "#ecfdf5", fg: "#047857" },
                { label: "S", bg: "#fff7ed", fg: "#c2410c" },
              ].map((i) => (
                <span
                  key={i.label}
                  className="grid h-12 w-12 place-items-center rounded-2xl text-base font-extrabold shadow-md ring-1 ring-black/5"
                  style={{ background: i.bg, color: i.fg }}
                >
                  {i.label}
                </span>
              ))}
              <span className="text-sm font-semibold text-neutral-400">…</span>
            </div>
          </div>
        </FloatingCard>
      </main>
    </div>
  );
}
